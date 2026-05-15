import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { exchangeCodeForTokens, fetchUserProfile } from "@/src/lib/auth/outlook";
import { logAuditEvent } from "@/src/lib/audit/log";

const COLOR_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function redirectError(request: NextRequest, reason: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("status", "error");
  url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  response.cookies.set("outlook_oauth_csrf", "", { maxAge: 0, path: "/" });
  return response;
}

export async function GET(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Microsoft sent an error (user denied consent, etc.)
  if (error) {
    return redirectError(request, error);
  }

  // Missing required params
  if (!code || !state) {
    return redirectError(request, "missing_params");
  }

  // Decode state payload
  let payload: { csrf: string; userId: string; backfillDays: number };
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return redirectError(request, "bad_state");
  }

  // CSRF validation
  const csrfCookie = request.cookies.get("outlook_oauth_csrf")?.value;
  if (!csrfCookie || csrfCookie !== payload.csrf) {
    return redirectError(request, "csrf_mismatch");
  }

  // Ownership check
  if (payload.userId !== user.id) {
    return redirectError(request, "user_mismatch");
  }

  // Validate backfill_days
  const backfillDays = [30, 90, 365].includes(payload.backfillDays)
    ? payload.backfillDays
    : 90;

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error("[outlook/callback] Token exchange failed:", {
      message: err instanceof Error ? err.message : String(err),
      status: (err as { status?: number }).status,
      body: (err as { body?: string }).body,
    });
    return redirectError(request, "token_exchange_failed");
  }

  // Fetch user profile
  let profile;
  try {
    profile = await fetchUserProfile(tokens.access_token);
  } catch (err) {
    console.error("[outlook/callback] Profile fetch failed:", {
      message: err instanceof Error ? err.message : String(err),
      status: (err as { status?: number }).status,
      body: (err as { body?: string }).body,
    });
    return redirectError(request, "profile_fetch_failed");
  }

  // Determine email address
  const emailAddress = (profile.mail || profile.userPrincipalName || "").toLowerCase();
  if (!emailAddress) {
    return redirectError(request, "no_email");
  }

  // Compute default display name from email
  const emailPrefix = emailAddress.split("@")[0] || "Workspace";
  const defaultDisplayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

  // Count existing accounts for color + position assignment
  const { count: existingCount } = await db
    .from("connected_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const accountCount = existingCount ?? 0;
  const colorHex = COLOR_PALETTE[accountCount % COLOR_PALETTE.length];

  // Microsoft does NOT include 'offline_access' in response.scope even
  // when it grants offline access. The presence of refresh_token is
  // the proof. Add it manually so scope detection reflects reality.
  const grantedScopeList = tokens.scope
    ? tokens.scope.split(" ").filter(Boolean)
    : [];
  if (tokens.refresh_token && !grantedScopeList.includes("offline_access")) {
    grantedScopeList.push("offline_access");
  }

  // Check if account already exists (for upsert logic)
  const { data: existing } = await db
    .from("connected_accounts")
    .select("id, display_name")
    .eq("user_id", user.id)
    .eq("email_address", emailAddress)
    .single();

  let accountId: string;

  if (existing) {
    // Update existing — preserve user's display_name
    const { data: updated, error: updateErr } = await db
      .from("connected_accounts")
      .update({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: tokens.expires_at,
        scopes: grantedScopeList,
        is_active: true,
        sync_status: "idle",
        sync_error: null,
        backfill_days: backfillDays,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updateErr) {
      return redirectError(request, "db_update_failed");
    }
    accountId = updated!.id;
  } else {
    // Insert new account
    const { data: inserted, error: insertErr } = await db
      .from("connected_accounts")
      .insert({
        user_id: user.id,
        provider: "outlook",
        email_address: emailAddress,
        display_name: defaultDisplayName,
        color_hex: colorHex,
        sidebar_position: accountCount,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: tokens.expires_at,
        scopes: grantedScopeList,
        is_active: true,
        sync_status: "idle",
        sync_error: null,
        backfill_days: backfillDays,
      })
      .select("id")
      .single();

    if (insertErr) {
      return redirectError(request, "db_insert_failed");
    }
    accountId = inserted!.id;
  }

  const isReconnect = !!existing;

  // Only queue initial backfill for new accounts, not reconnects
  if (!isReconnect) {
    await db.from("sync_jobs").insert({
      user_id: user.id,
      account_id: accountId,
      job_type: "initial_backfill",
      status: "pending",
      backfill_days: backfillDays,
    });
  }

  await logAuditEvent({
    userId: user.id,
    action: 'oauth.grant',
    resourceType: 'connected_account',
    resourceId: accountId,
    metadata: { provider: 'microsoft', isReconnect },
    request,
  });

  // Clear CSRF cookie and redirect to home (Phase 6 will retarget to add-in)
  const successUrl = new URL(`/`, request.url);
  successUrl.searchParams.set("status", isReconnect ? "reconnected" : "connected");
  successUrl.searchParams.set("accountId", accountId);
  const response = NextResponse.redirect(successUrl);
  response.cookies.set("outlook_oauth_csrf", "", { maxAge: 0, path: "/" });

  return response;
}
