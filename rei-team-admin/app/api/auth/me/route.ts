import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

// GET /api/auth/me → returns the current user's TeamMember record, or 401
export async function GET() {
  try {
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await db
      .from("team_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
