import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import {
  refreshAccessToken,
  sendMail,
  getMessageById,
  type OutlookMessageDraft,
} from "@/src/lib/auth/outlook";
import { formatEmailDateLong } from "@/src/lib/format";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.body) return String(anyErr.body).slice(0, 500);
    if (anyErr.message) return String(anyErr.message);
    try { return JSON.stringify(err).slice(0, 500); }
    catch { return "Unknown error"; }
  }
  return String(err);
}

type SendMode = "compose" | "reply" | "replyAll" | "forward";

interface SendPayload {
  accountId: string;
  mode: SendMode;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyToMessageId?: string;
}

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Parse and validate payload
  let payload: SendPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload", details: "Could not parse JSON body" }, { status: 400 });
  }

  if (!payload.accountId || typeof payload.accountId !== "string") {
    return NextResponse.json({ error: "invalid_payload", details: "accountId is required" }, { status: 400 });
  }
  if (!["compose", "reply", "replyAll", "forward"].includes(payload.mode)) {
    return NextResponse.json({ error: "invalid_payload", details: "mode must be compose, reply, replyAll, or forward" }, { status: 400 });
  }
  if (!Array.isArray(payload.to) || payload.to.length === 0) {
    return NextResponse.json({ error: "invalid_payload", details: "to must be a non-empty array of email addresses" }, { status: 400 });
  }
  if (typeof payload.subject !== "string") {
    return NextResponse.json({ error: "invalid_payload", details: "subject is required" }, { status: 400 });
  }
  if (typeof payload.body !== "string") {
    return NextResponse.json({ error: "invalid_payload", details: "body is required" }, { status: 400 });
  }
  if (payload.mode !== "compose" && !payload.inReplyToMessageId) {
    return NextResponse.json({ error: "invalid_payload", details: "inReplyToMessageId is required for reply/replyAll/forward" }, { status: 400 });
  }

  // Verify account ownership
  const { data: account } = await db
    .from("connected_accounts")
    .select("*")
    .eq("id", payload.accountId)
    .eq("user_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Refresh access token if needed
  let accessToken = account.access_token as string;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at as string) : new Date(0);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt < fiveMinFromNow) {
    try {
      const newTokens = await refreshAccessToken(account.refresh_token as string);
      accessToken = newTokens.access_token;

      const refreshedScopes = newTokens.scope
        ? newTokens.scope.split(" ").filter(Boolean)
        : (account.scopes as string[] ?? []);
      if (newTokens.refresh_token && !refreshedScopes.includes("offline_access")) {
        refreshedScopes.push("offline_access");
      }

      await db
        .from("connected_accounts")
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          token_expires_at: newTokens.expires_at,
          scopes: refreshedScopes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    } catch (err) {
      console.error("[email/send] Token refresh failed:", errorToMessage(err));
      return NextResponse.json({ error: "token_refresh_failed", message: errorToMessage(err) }, { status: 500 });
    }
  }

  // Build the message
  let finalSubject = payload.subject;
  let finalBody = payload.body;
  let originalConversationId: string | null = null;

  if (payload.mode !== "compose" && payload.inReplyToMessageId) {
    try {
      const original = await getMessageById(accessToken, payload.inReplyToMessageId);
      originalConversationId = original.conversationId ?? null;

      // Prefix subject if not already present
      if (payload.mode === "reply" || payload.mode === "replyAll") {
        if (!finalSubject.toLowerCase().startsWith("re:")) {
          finalSubject = `Re: ${finalSubject}`;
        }
      } else if (payload.mode === "forward") {
        if (!finalSubject.toLowerCase().startsWith("fwd:")) {
          finalSubject = `Fwd: ${finalSubject}`;
        }
      }

      // Append quoted original
      const originalFrom = original.from?.emailAddress
        ? `${original.from.emailAddress.name ?? ""} &lt;${original.from.emailAddress.address}&gt;`
        : "Unknown";
      const originalDate = formatEmailDateLong(original.sentDateTime);
      const originalSubject = original.subject ?? "(no subject)";
      const originalBody = original.body?.content ?? "";

      finalBody +=
        "<br><br>--- Original message ---<br>" +
        `From: ${originalFrom}<br>` +
        `Sent: ${originalDate}<br>` +
        `Subject: ${originalSubject}<br><br>` +
        originalBody;
    } catch (err) {
      console.error("[email/send] Failed to fetch original message:", errorToMessage(err));
      // Continue with send — user's new content is still valid, just without quote
    }
  }

  const draft: OutlookMessageDraft = {
    subject: finalSubject,
    body: { contentType: "HTML", content: finalBody },
    toRecipients: payload.to.map((addr) => ({ emailAddress: { address: addr } })),
    ccRecipients: (payload.cc ?? []).map((addr) => ({ emailAddress: { address: addr } })),
    bccRecipients: (payload.bcc ?? []).map((addr) => ({ emailAddress: { address: addr } })),
  };

  // Send
  try {
    await sendMail(accessToken, draft);
  } catch (err) {
    console.error("[email/send] Send failed:", {
      message: errorToMessage(err),
      status: (err as { status?: number }).status,
      body: (err as { body?: string }).body,
    });
    return NextResponse.json({ error: "send_failed", message: errorToMessage(err) }, { status: 500 });
  }

  // Insert local copy into emails table
  const localProviderId = `local-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const bodyText = stripHtml(finalBody);

  const { data: inserted } = await db
    .from("emails")
    .upsert(
      {
        account_id: payload.accountId,
        user_id: user.id,
        provider_message_id: localProviderId,
        thread_id: originalConversationId,
        subject: finalSubject,
        from_address: (account.email_address as string).toLowerCase(),
        from_name: (account.display_name as string) ?? null,
        to_addresses: payload.to.map((addr) => ({ emailAddress: { address: addr } })),
        cc_addresses: (payload.cc ?? []).map((addr) => ({ emailAddress: { address: addr } })),
        bcc_addresses: (payload.bcc ?? []).map((addr) => ({ emailAddress: { address: addr } })),
        sent_at: now,
        received_at: now,
        body_text: bodyText,
        body_html: finalBody,
        snippet: bodyText.slice(0, 250),
        is_sent_by_me: true,
        is_read: true,
        is_starred: false,
        has_attachments: false,
        folder_id: "sentitems",
        local_origin: true,
      },
      { onConflict: "account_id,provider_message_id" }
    )
    .select("id")
    .single();

  return NextResponse.json({
    success: true,
    localEmailId: inserted?.id ?? null,
  });
}
