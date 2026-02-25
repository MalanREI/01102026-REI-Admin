// /api/schedule — CRUD for content_schedules
// GET    ?id=<id>                        — fetch single schedule
// GET    ?post_id=<id>&active=<bool>     — fetch schedules for a post
// GET    (no params)                     — fetch all schedules
// POST   body: NewContentSchedule        — create schedule
// PATCH  body: { id, ...updates }        — update schedule
// DELETE ?id=<id>                        — delete schedule

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const p = req.nextUrl.searchParams;
    const id = p.get("id");

    if (id) {
      const { data, error } = await db
        .from("content_schedules")
        .select("*, post:content_posts(*)")
        .eq("id", id)
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
      return NextResponse.json(data);
    }

    let query = db
      .from("content_schedules")
      .select("*, post:content_posts(*)")
      .order("scheduled_at", { ascending: true });

    const postId = p.get("post_id");
    if (postId) query = query.eq("post_id", postId);

    const active = p.get("active");
    if (active === "true") query = query.eq("is_active", true);
    if (active === "false") query = query.eq("is_active", false);

    const scheduleType = p.get("schedule_type");
    if (scheduleType) query = query.eq("schedule_type", scheduleType);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const body = await req.json();
    const { data, error } = await db
      .from("content_schedules")
      .insert(body)
      .select("*, post:content_posts(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update the associated post status to 'scheduled' when a schedule is created
    if (data?.post_id) {
      await db
        .from("content_posts")
        .update({ status: "scheduled", updated_at: new Date().toISOString() })
        .eq("id", data.post_id);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data, error } = await db
      .from("content_schedules")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, post:content_posts(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Fetch the schedule to get post_id before deletion
    const { data: schedule } = await db
      .from("content_schedules")
      .select("post_id")
      .eq("id", id)
      .single();

    const { error } = await db.from("content_schedules").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If no remaining active schedules for this post, revert status to 'approved'
    if (schedule?.post_id) {
      const { count } = await db
        .from("content_schedules")
        .select("id", { count: "exact", head: true })
        .eq("post_id", schedule.post_id)
        .eq("is_active", true);
      if (!count) {
        await db
          .from("content_posts")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", schedule.post_id)
          .eq("status", "scheduled");
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
