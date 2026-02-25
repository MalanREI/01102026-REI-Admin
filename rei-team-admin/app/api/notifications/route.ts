import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

// GET /api/notifications?recipient_id=<id>&unread=true
export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const p = req.nextUrl.searchParams;
    const recipientId = p.get("recipient_id");
    const unreadOnly = p.get("unread") === "true";
    const limit = parseInt(p.get("limit") ?? "50", 10);

    if (!recipientId) {
      return NextResponse.json({ error: "recipient_id is required" }, { status: 400 });
    }

    let query = db
      .from("notifications")
      .select(
        "*, post:content_posts(id,title,body,status), actor:team_members!actor_id(id,display_name,avatar_url)"
      )
      .eq("recipient_id", recipientId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq("is_read", false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/notifications  { id } or { recipient_id, mark_all_read: true }
export async function PATCH(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const body = await req.json();

    if (body.mark_all_read && body.recipient_id) {
      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", body.recipient_id)
        .eq("is_read", false);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data, error } = await db
      .from("notifications")
      .update({ is_read: true })
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
