import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const p = req.nextUrl.searchParams;

    // Single-post lookup by ID
    const postId = p.get("id");
    if (postId) {
      const { data, error } = await db
        .from("content_posts")
        .select("*, content_type:content_types(*), brand_voice:brand_voices(*), created_by_member:team_members!created_by(*)")
        .eq("id", postId)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: error.code === "PGRST116" ? 404 : 500 });
      return NextResponse.json(data);
    }

    let query = db
      .from("content_posts")
      .select("*, content_type:content_types(*), brand_voice:brand_voices(*), created_by_member:team_members!created_by(*)");

    const status = p.get("status");
    if (status) {
      const statuses = status.split(",");
      if (statuses.length === 1) query = query.eq("status", statuses[0]);
      else query = query.in("status", statuses);
    }

    const contentTypeId = p.get("content_type_id");
    if (contentTypeId) {
      const ids = contentTypeId.split(",");
      if (ids.length === 1) query = query.eq("content_type_id", ids[0]);
      else query = query.in("content_type_id", ids);
    }

    const brandVoiceId = p.get("brand_voice_id");
    if (brandVoiceId) query = query.eq("brand_voice_id", brandVoiceId);

    const createdBy = p.get("created_by");
    if (createdBy) query = query.eq("created_by", createdBy);

    const dateFrom = p.get("date_from");
    if (dateFrom) query = query.gte("created_at", dateFrom);

    const dateTo = p.get("date_to");
    if (dateTo) query = query.lte("created_at", dateTo);

    const search = p.get("search");
    if (search) query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);

    const platforms = p.get("platforms");
    if (platforms) {
      const platformList = platforms.split(",");
      query = query.contains("target_platforms", platformList);
    }

    const sortBy = p.get("sort_by") || "created_at";
    const sortDir = p.get("sort_dir") === "asc";
    query = query.order(sortBy, { ascending: sortDir });

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
    const { data, error } = await db.from("content_posts").insert(body).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
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
      .from("content_posts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
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
    const { error } = await db.from("content_posts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
