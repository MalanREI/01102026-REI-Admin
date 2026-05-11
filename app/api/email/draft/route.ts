import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  if (!accountId) return NextResponse.json({ error: "missing_account_id" }, { status: 400 });

  const { data: account } = await db.from("connected_accounts").select("user_id").eq("id", accountId).single();
  if (!account || account.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mode = (body.mode as string) ?? "compose";
  const fields = body.initialFields as Record<string, unknown> | undefined;

  const { data, error } = await db.from("email_drafts").insert({
    user_id: user.id,
    account_id: accountId,
    mode,
    in_reply_to_message_id: (body.inReplyToMessageId as string) ?? null,
    to_addresses: (fields?.to as string[]) ?? [],
    cc_addresses: (fields?.cc as string[]) ?? [],
    bcc_addresses: (fields?.bcc as string[]) ?? [],
    subject: (fields?.subject as string) ?? "",
    body_html: (fields?.body_html as string) ?? "",
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draftId: data?.id });
}

export async function PATCH(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const draftId = body.draftId as string;
  const fields = body.fields as Record<string, unknown> | undefined;
  if (!draftId || !fields) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const { data: draft } = await db.from("email_drafts").select("user_id").eq("id", draftId).single();
  if (!draft || draft.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await db.from("email_drafts").update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq("id", draftId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const draftId = body.draftId as string;
  if (!draftId) return NextResponse.json({ error: "missing_draft_id" }, { status: 400 });

  const { data: draft } = await db.from("email_drafts").select("user_id").eq("id", draftId).single();
  if (!draft || draft.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Delete storage files for attachments
  const admin = supabaseAdmin();
  const { data: attachments } = await admin.from("draft_attachments").select("storage_path").eq("draft_id", draftId);
  if (attachments) {
    const paths = attachments.map((a) => a.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await admin.storage.from("email-attachments").remove(paths);
    }
  }

  // FK cascade handles draft_attachments rows
  await db.from("email_drafts").delete().eq("id", draftId);
  return NextResponse.json({ success: true });
}
