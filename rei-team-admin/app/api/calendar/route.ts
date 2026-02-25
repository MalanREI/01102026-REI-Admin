// /api/calendar — fetch calendar events (schedules joined with posts)
// GET ?date_from=<ISO>&date_to=<ISO>&platforms=<csv>&statuses=<csv>&schedule_type=<type>&active=<bool>

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import type { CalendarEvent, PostStatus, ScheduleType } from "@/src/lib/types/social-media";

export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const p = req.nextUrl.searchParams;

    const dateFrom = p.get("date_from");
    const dateTo = p.get("date_to");
    const platformsParam = p.get("platforms");
    const statusesParam = p.get("statuses");
    const scheduleType = p.get("schedule_type") as ScheduleType | null;
    const active = p.get("active");

    let query = db
      .from("content_schedules")
      .select("*, post:content_posts(*)")
      .order("scheduled_at", { ascending: true });

    // Active filter (default: active only)
    if (active === "false") query = query.eq("is_active", false);
    else query = query.eq("is_active", true);

    if (dateFrom) query = query.gte("scheduled_at", dateFrom);
    if (dateTo) query = query.lte("scheduled_at", dateTo + "T23:59:59.999Z");
    if (scheduleType) query = query.eq("schedule_type", scheduleType);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Filter by post-level fields (platform, status) and map to CalendarEvent
    const platforms = platformsParam ? platformsParam.split(",") : [];
    const statuses = statusesParam ? (statusesParam.split(",") as PostStatus[]) : [];

    const events: CalendarEvent[] = [];
    for (const row of data ?? []) {
      const post = row.post;
      if (!post) continue;

      if (statuses.length > 0 && !statuses.includes(post.status)) continue;
      if (platforms.length > 0) {
        const hasMatch = platforms.some((pl) => post.target_platforms?.includes(pl));
        if (!hasMatch) continue;
      }

      events.push({
        schedule_id: row.id,
        post_id: post.id,
        post_title: post.title,
        post_body: post.body,
        post_status: post.status,
        target_platforms: post.target_platforms ?? [],
        media_type: post.media_type,
        schedule_type: row.schedule_type,
        scheduled_at: row.scheduled_at,
        recurrence_rule: row.recurrence_rule,
        recurrence_end_date: row.recurrence_end_date,
        timezone: row.timezone,
        is_active: row.is_active,
        next_run_at: row.next_run_at,
      });
    }

    return NextResponse.json(events);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
