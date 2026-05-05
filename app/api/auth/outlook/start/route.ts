import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { buildAuthUrl } from "@/src/lib/auth/outlook";

export async function GET(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Validate backfill_days
  const rawBackfill = request.nextUrl.searchParams.get("backfill_days");
  const validBackfill = ["30", "90", "365"];
  const backfillDays = validBackfill.includes(rawBackfill ?? "")
    ? Number(rawBackfill)
    : 90;

  // Generate CSRF token
  const csrf = crypto.randomUUID();

  // Build state payload (base64url-encoded JSON)
  const statePayload = {
    csrf,
    userId: user.id,
    backfillDays,
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  // Build auth URL and redirect
  const authUrl = buildAuthUrl(state);
  const response = NextResponse.redirect(authUrl);

  // Set CSRF cookie
  response.cookies.set("outlook_oauth_csrf", csrf, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return response;
}
