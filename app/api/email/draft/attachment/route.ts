import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const draftId = formData.get("draftId") as string;
  const file = formData.get("file") as File | null;

  if (!draftId || !file) {
    return NextResponse.json({ error: "missing_draft_id_or_file" }, { status: 400 });
  }

  // Verify draft ownership
  const { data: draft } = await db.from("email_drafts").select("user_id, account_id").eq("id", draftId).single();
  if (!draft || draft.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Validate size (25MB)
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large", details: "Max 25MB" }, { status: 400 });
  }

  const storagePath = `${user.id}/drafts/${draftId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const admin = supabaseAdmin();

  // Upload to storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("email-attachments")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "application/octet-stream" });

  if (uploadErr) {
    return NextResponse.json({ error: "upload_failed", message: uploadErr.message }, { status: 500 });
  }

  // Insert draft_attachments row
  const { data: att, error: attErr } = await admin.from("draft_attachments").insert({
    user_id: user.id,
    draft_id: draftId,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path: storagePath,
  }).select("id, file_name, size_bytes, mime_type").single();

  if (attErr) {
    return NextResponse.json({ error: "db_insert_failed", message: attErr.message }, { status: 500 });
  }

  // Increment attachment count
  const { data: currentDraft } = await admin.from("email_drafts").select("attachment_count").eq("id", draftId).single();
  await admin.from("email_drafts").update({
    attachment_count: ((currentDraft?.attachment_count as number) ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", draftId);

  return NextResponse.json(att);
}

export async function DELETE(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const attachmentId = body.attachmentId as string;
  if (!attachmentId) return NextResponse.json({ error: "missing_attachment_id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: att } = await admin.from("draft_attachments")
    .select("user_id, draft_id, storage_path")
    .eq("id", attachmentId).single();

  if (!att || att.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Delete from storage
  await admin.storage.from("email-attachments").remove([att.storage_path]);

  // Delete row
  await admin.from("draft_attachments").delete().eq("id", attachmentId);

  return NextResponse.json({ success: true });
}
