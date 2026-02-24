import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const db = await supabaseServer();
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "false";
    let query = db.from("content_types").select("*").order("name");
    if (activeOnly) query = query.eq("is_active", true);
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
    const { data, error } = await db.from("content_types").insert(body).select().single();
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
      .from("content_types")
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
    const { error } = await db.from("content_types").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
