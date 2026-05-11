import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { refreshAccessToken, moveMessage, deleteMessage } from "@/src/lib/auth/outlook";

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

async function getAccessToken(db: Awaited<ReturnType<typeof supabaseServer>>, accountId: string) {
  const { data: account } = await db.from("connected_accounts").select("*").eq("id", accountId).single();
  if (!account) return null;

  let accessToken = account.access_token as string;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at as string) : new Date(0);

  if (expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const newTokens = await refreshAccessToken(account.refresh_token as string);
    accessToken = newTokens.access_token;
    const scopes = newTokens.scope ? newTokens.scope.split(" ").filter(Boolean) : (account.scopes as string[] ?? []);
    if (newTokens.refresh_token && !scopes.includes("offline_access")) scopes.push("offline_access");
    await db.from("connected_accounts").update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      token_expires_at: newTokens.expires_at,
      scopes,
      updated_at: new Date().toISOString(),
    }).eq("id", accountId);
  }

  return { account, accessToken };
}

/**
 * POST /api/email/move
 * Body: { accountId, emailId, action, targetFolderId? }
 * action: 'move' | 'archive' | 'trash' | 'delete'
 * - move: requires targetFolderId (provider folder ID or well-known alias)
 * - archive: moves to 'archive' well-known folder
 * - trash: moves to 'deleteditems' well-known folder
 * - delete: permanently deletes via DELETE /me/messages/{id}
 */
export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  const emailId = body.emailId as string;
  const action = body.action as string;
  const targetFolderId = body.targetFolderId as string | undefined;

  if (!accountId || !emailId || !action) {
    return NextResponse.json({ error: "invalid_payload", details: "accountId, emailId, action required" }, { status: 400 });
  }

  if (!["move", "archive", "trash", "delete"].includes(action)) {
    return NextResponse.json({ error: "invalid_payload", details: "action must be move, archive, trash, or delete" }, { status: 400 });
  }

  if (action === "move" && !targetFolderId) {
    return NextResponse.json({ error: "invalid_payload", details: "targetFolderId required for move action" }, { status: 400 });
  }

  // Look up local email
  const { data: email } = await db.from("emails")
    .select("id, provider_message_id, account_id, user_id, folder_id")
    .eq("id", emailId)
    .single();

  if (!email || email.user_id !== user.id || email.account_id !== accountId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const auth = await getAccessToken(db, accountId);
  if (!auth) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    if (action === "delete") {
      // Permanent delete
      await deleteMessage(auth.accessToken, email.provider_message_id);
      await db.from("emails").delete().eq("id", emailId);
      return NextResponse.json({ success: true, deleted: true });
    }

    // Determine destination
    const destination = action === "archive" ? "archive"
      : action === "trash" ? "deleteditems"
      : targetFolderId!;

    // Move via Graph — returns NEW message ID
    const moveResult = await moveMessage(auth.accessToken, email.provider_message_id, destination);

    // Determine new folder_id for local row
    // For well-known aliases, use the alias. For custom folders, look up display name.
    let newFolderId = destination;
    if (action === "move" && targetFolderId) {
      // Try to find display name from our folders table
      const { data: folderRow } = await db.from("email_folders")
        .select("display_name, well_known_name")
        .eq("account_id", accountId)
        .eq("provider_folder_id", targetFolderId)
        .single();
      if (folderRow) {
        newFolderId = folderRow.well_known_name ?? folderRow.display_name;
      }
    }

    // Update local row with new provider_message_id and folder_id
    await db.from("emails").update({
      provider_message_id: moveResult.id,
      folder_id: newFolderId,
      updated_at: new Date().toISOString(),
    }).eq("id", emailId);

    return NextResponse.json({ success: true, newProviderId: moveResult.id, newFolderId });

  } catch (err) {
    console.error("[email/move] Failed:", errorToMessage(err));
    return NextResponse.json({ error: "move_failed", message: errorToMessage(err) }, { status: 500 });
  }
}
