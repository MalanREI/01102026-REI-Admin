import { NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";

// GET /api/auth/me → returns the current user's TeamMember record,
// or basic auth user info if no team member exists, or 401
export async function GET() {
  try {
    const db = await supabaseServer();
    const {
      data: { user },
    } = await db.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Try to find a team member record
    const { data } = await db
      .from("team_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (data) return NextResponse.json(data);

    // No team member record — return basic user info so the caller
    // doesn't get a 404 on every page load
    return NextResponse.json({
      id: user.id,
      user_id: user.id,
      email: user.email,
      display_name: user.email?.split("@")[0] ?? "User",
      role: "member",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
