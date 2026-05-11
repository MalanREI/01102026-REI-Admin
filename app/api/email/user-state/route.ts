import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const { accountId, targetType, targetId, state, followupDueAt, snoozedUntil } = body as {
    accountId?: string; targetType?: string; targetId?: string;
    state?: string; followupDueAt?: string; snoozedUntil?: string;
  };

  if (!accountId || !targetType || !targetId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (state && !["inbox", "handled", "followup", "snoozed"].includes(state)) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updates = {
    user_state: state ?? null,
    handled_at: state === "handled" ? now : null,
    followup_due_at: followupDueAt ?? null,
    snoozed_until: snoozedUntil ?? null,
    updated_at: now,
  };

  if (targetType === "email") {
    const { data: email } = await db.from("emails").select("user_id, account_id").eq("id", targetId).single();
    if (!email || email.user_id !== user.id || email.account_id !== accountId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { error } = await db.from("emails").update(updates).eq("id", targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (targetType === "conversation") {
    const { data: conv } = await db.from("conversations").select("user_id, account_id").eq("id", targetId).single();
    if (!conv || conv.user_id !== user.id || conv.account_id !== accountId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await db.from("conversations").update(updates).eq("id", targetId);
    await db.from("emails").update(updates).eq("conversation_id", targetId);
  } else {
    return NextResponse.json({ error: "invalid_target_type" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
