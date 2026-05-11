import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import {
  refreshAccessToken,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type OutlookEventDraft,
  type OutlookCalendarEvent,
} from "@/src/lib/auth/outlook";

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (anyErr.body) return String(anyErr.body).slice(0, 500);
    if (anyErr.message) return String(anyErr.message);
    try { return JSON.stringify(err).slice(0, 500); }
    catch { return "Unknown error"; }
  }
  return String(err);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGraphTime(dt: { dateTime: string; timeZone: string } | undefined): string | null {
  if (!dt?.dateTime) return null;
  const raw = dt.dateTime;
  if (raw.endsWith("Z")) return new Date(raw).toISOString();
  return new Date(raw + "Z").toISOString();
}

async function getAccountAndToken(db: Awaited<ReturnType<typeof supabaseServer>>, userId: string, accountId: string) {
  const { data: account } = await db
    .from("connected_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .single();

  if (!account) return null;

  let accessToken = account.access_token as string;
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at as string) : new Date(0);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt < fiveMinFromNow) {
    const newTokens = await refreshAccessToken(account.refresh_token as string);
    accessToken = newTokens.access_token;

    const refreshedScopes = newTokens.scope ? newTokens.scope.split(" ").filter(Boolean) : (account.scopes as string[] ?? []);
    if (newTokens.refresh_token && !refreshedScopes.includes("offline_access")) {
      refreshedScopes.push("offline_access");
    }

    await db
      .from("connected_accounts")
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_expires_at: newTokens.expires_at,
        scopes: refreshedScopes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);
  }

  return { account, accessToken };
}

function graphEventToLocalRow(
  graphEvent: OutlookCalendarEvent,
  userId: string,
  accountId: string,
  localOrigin: boolean
) {
  const bodyContent = graphEvent.body?.content ?? "";
  const isHtml = graphEvent.body?.contentType === "html";
  return {
    user_id: userId,
    account_id: accountId,
    provider_event_id: graphEvent.id,
    provider_etag: graphEvent["@odata.etag"] ?? null,
    ical_uid: graphEvent.iCalUId ?? null,
    series_master_id: graphEvent.seriesMasterId ?? null,
    subject: graphEvent.subject ?? null,
    body_preview: graphEvent.bodyPreview ?? null,
    body_html: isHtml ? bodyContent : null,
    body_text: isHtml ? stripHtml(bodyContent) : (bodyContent || null),
    start_at: parseGraphTime(graphEvent.start) ?? new Date().toISOString(),
    end_at: parseGraphTime(graphEvent.end) ?? new Date().toISOString(),
    is_all_day: graphEvent.isAllDay ?? false,
    time_zone: graphEvent.start?.timeZone ?? null,
    location: graphEvent.location?.displayName ?? null,
    online_meeting_url: graphEvent.onlineMeeting?.joinUrl ?? null,
    online_meeting_provider: graphEvent.onlineMeetingProvider ?? null,
    organizer_email: graphEvent.organizer?.emailAddress?.address?.toLowerCase() ?? null,
    organizer_name: graphEvent.organizer?.emailAddress?.name ?? null,
    attendees: graphEvent.attendees ?? [],
    is_organizer: graphEvent.isOrganizer ?? true,
    response_status: graphEvent.responseStatus?.response ?? null,
    show_as: graphEvent.showAs ?? null,
    sensitivity: graphEvent.sensitivity ?? null,
    is_cancelled: graphEvent.isCancelled ?? false,
    importance: graphEvent.importance ?? null,
    is_recurring: graphEvent.type === "occurrence" || graphEvent.type === "exception" || graphEvent.type === "seriesMaster",
    recurrence: graphEvent.recurrence ?? null,
    local_origin: localOrigin,
    last_synced_at: new Date().toISOString(),
  };
}

// ============================================================
// POST: Create event
// ============================================================

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  const subject = body.subject as string;
  const startAt = body.startAt as string;
  const endAt = body.endAt as string;

  if (!accountId || !subject || !startAt || !endAt) {
    return NextResponse.json({ error: "invalid_payload", details: "accountId, subject, startAt, endAt are required" }, { status: 400 });
  }

  const auth = await getAccountAndToken(db, user.id, accountId);
  if (!auth) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const timeZone = (body.timeZone as string) ?? "UTC";
  const draft: OutlookEventDraft = {
    subject,
    body: body.body ? { contentType: "HTML", content: body.body as string } : undefined,
    start: { dateTime: startAt, timeZone },
    end: { dateTime: endAt, timeZone },
    location: body.location ? { displayName: body.location as string } : undefined,
    attendees: ((body.attendees as string[]) ?? []).map((addr) => ({
      emailAddress: { address: addr },
      type: "required" as const,
    })),
    isAllDay: body.isAllDay as boolean | undefined,
    showAs: body.showAs as string | undefined,
    isOnlineMeeting: body.isOnlineMeeting as boolean | undefined,
    onlineMeetingProvider: body.isOnlineMeeting ? "teamsForBusiness" : undefined,
  };

  try {
    const graphEvent = await createCalendarEvent(auth.accessToken, draft);
    const row = graphEventToLocalRow(graphEvent, user.id, accountId, true);

    const { data: inserted } = await db
      .from("calendar_events")
      .upsert(row, { onConflict: "account_id,provider_event_id" })
      .select("id")
      .single();

    return NextResponse.json({ success: true, eventId: inserted?.id, providerEventId: graphEvent.id });
  } catch (err) {
    console.error("[calendar/event] Create failed:", errorToMessage(err));
    return NextResponse.json({ error: "create_failed", message: errorToMessage(err) }, { status: 500 });
  }
}

// ============================================================
// PATCH: Update event
// ============================================================

export async function PATCH(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  const eventId = body.eventId as string;
  const patch = body.patch as Record<string, unknown> | undefined;

  if (!accountId || !eventId || !patch) {
    return NextResponse.json({ error: "invalid_payload", details: "accountId, eventId, patch required" }, { status: 400 });
  }

  // Look up local event
  const { data: localEvent } = await db
    .from("calendar_events")
    .select("provider_event_id, account_id, user_id")
    .eq("id", eventId)
    .single();

  if (!localEvent || localEvent.user_id !== user.id || localEvent.account_id !== accountId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const auth = await getAccountAndToken(db, user.id, accountId);
  if (!auth) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const timeZone = (patch.timeZone as string) ?? "UTC";
  const graphPatch: Partial<OutlookEventDraft> = {};
  if (patch.subject !== undefined) graphPatch.subject = patch.subject as string;
  if (patch.body !== undefined) graphPatch.body = { contentType: "HTML", content: patch.body as string };
  if (patch.startAt !== undefined) graphPatch.start = { dateTime: patch.startAt as string, timeZone };
  if (patch.endAt !== undefined) graphPatch.end = { dateTime: patch.endAt as string, timeZone };
  if (patch.location !== undefined) graphPatch.location = { displayName: patch.location as string };
  if (patch.isAllDay !== undefined) graphPatch.isAllDay = patch.isAllDay as boolean;
  if (patch.showAs !== undefined) graphPatch.showAs = patch.showAs as string;
  if (patch.attendees !== undefined) {
    graphPatch.attendees = ((patch.attendees as string[]) ?? []).map((addr) => ({
      emailAddress: { address: addr },
      type: "required" as const,
    }));
  }

  try {
    const graphEvent = await updateCalendarEvent(auth.accessToken, localEvent.provider_event_id, graphPatch);
    const row = graphEventToLocalRow(graphEvent, user.id, accountId, localEvent.account_id === accountId);

    await db
      .from("calendar_events")
      .update(row)
      .eq("id", eventId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calendar/event] Update failed:", errorToMessage(err));
    return NextResponse.json({ error: "update_failed", message: errorToMessage(err) }, { status: 500 });
  }
}

// ============================================================
// DELETE: Delete event
// ============================================================

export async function DELETE(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const accountId = body.accountId as string;
  const eventId = body.eventId as string;

  if (!accountId || !eventId) {
    return NextResponse.json({ error: "invalid_payload", details: "accountId, eventId required" }, { status: 400 });
  }

  const { data: localEvent } = await db
    .from("calendar_events")
    .select("provider_event_id, account_id, user_id")
    .eq("id", eventId)
    .single();

  if (!localEvent || localEvent.user_id !== user.id || localEvent.account_id !== accountId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const auth = await getAccountAndToken(db, user.id, accountId);
  if (!auth) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    await deleteCalendarEvent(auth.accessToken, localEvent.provider_event_id);
    await db.from("calendar_events").delete().eq("id", eventId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calendar/event] Delete failed:", errorToMessage(err));
    return NextResponse.json({ error: "delete_failed", message: errorToMessage(err) }, { status: 500 });
  }
}
