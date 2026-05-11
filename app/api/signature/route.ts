import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  const name = body.name as string;
  const bodyHtml = body.body_html as string;
  const isDefault = body.is_default as boolean ?? false;

  if (!accountId || !name || !bodyHtml) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { data: account } = await db.from("connected_accounts").select("user_id").eq("id", accountId).single();
  if (!account || account.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (isDefault) {
    await db.from("email_signatures").update({ is_default: false }).eq("account_id", accountId);
  }

  const { data, error } = await db.from("email_signatures").insert({
    user_id: user.id,
    account_id: accountId,
    name,
    body_html: bodyHtml,
    is_default: isDefault,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const signatureId = body.signatureId as string;
  if (!signatureId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data: sig } = await db.from("email_signatures").select("user_id, account_id").eq("id", signatureId).single();
  if (!sig || sig.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.body_html !== undefined) updates.body_html = body.body_html;
  if (body.is_default !== undefined) {
    updates.is_default = body.is_default;
    if (body.is_default) {
      await db.from("email_signatures").update({ is_default: false }).eq("account_id", sig.account_id).neq("id", signatureId);
    }
  }

  const { error } = await db.from("email_signatures").update(updates).eq("id", signatureId);
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

  const signatureId = body.signatureId as string;
  if (!signatureId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const { data: sig } = await db.from("email_signatures").select("user_id").eq("id", signatureId).single();
  if (!sig || sig.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await db.from("email_signatures").delete().eq("id", signatureId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
