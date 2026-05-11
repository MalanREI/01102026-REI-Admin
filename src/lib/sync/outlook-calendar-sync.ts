// Outlook calendar sync engine.
// Server-only — uses service role client and Graph API.

import { supabaseAdmin } from "@/src/lib/supabase/admin";
import {
  refreshAccessToken,
  listCalendarEvents,
  type OutlookCalendarEvent,
} from "@/src/lib/auth/outlook";
import { stripHtml, errorToMessage, type SyncResult } from "./outlook-sync";

// ============================================================
// Constants
// ============================================================

const PAST_DAYS = 30;
const FUTURE_DAYS = 90;

interface CalendarProcessingState {
  next_calendar_page: string | null;
}

// ============================================================
// Helpers
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEventTime(dt: { dateTime: string; timeZone: string } | undefined): string | null {
  if (!dt?.dateTime) return null;
  // With Prefer: outlook.timezone="UTC", Graph returns UTC times.
  // dateTime may or may not have a trailing Z; normalize.
  const raw = dt.dateTime;
  if (raw.endsWith("Z")) return new Date(raw).toISOString();
  return new Date(raw + "Z").toISOString();
}

// ============================================================
// Main sync function
// ============================================================

export async function syncOutlookCalendar(params: {
  userId: string;
  accountId: string;
  jobId: string;
  budgetMs?: number;
}): Promise<SyncResult> {
  const { userId, accountId, jobId, budgetMs = 50000 } = params;
  const startTime = Date.now();
  const db = supabaseAdmin();

  let eventsSynced = 0;

  try {
    // 1. Fetch account
    const { data: account, error: accErr } = await db
      .from("connected_accounts")
      .select("*")
      .eq("id", accountId)
      .single();

    if (accErr || !account) throw new Error("Account not found");
    if (account.user_id !== userId) throw new Error("Account/user mismatch");

    // 2. Fetch job
    const { data: job, error: jobErr } = await db
      .from("sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) throw new Error("Sync job not found");
    if (job.account_id !== accountId) throw new Error("Job/account mismatch");

    // 3. Mark job running
    if (job.status !== "running") {
      await db
        .from("sync_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    await db
      .from("connected_accounts")
      .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    // 4. Token refresh check
    let accessToken = account.access_token as string;
    const expiresAt = new Date(account.token_expires_at as string);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt < fiveMinFromNow) {
      const newTokens = await refreshAccessToken(account.refresh_token as string);
      accessToken = newTokens.access_token;

      const refreshedScopes = newTokens.scope
        ? newTokens.scope.split(" ").filter(Boolean)
        : (account.scopes as string[] ?? []);
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

    // Graph call wrapper with 401/429 retry
    async function graphCall<T>(fn: () => Promise<T>): Promise<T> {
      try {
        return await fn();
      } catch (err: unknown) {
        const graphErr = err as { status?: number; body?: string };

        if (graphErr.status === 401) {
          const newTokens = await refreshAccessToken(account.refresh_token as string);
          accessToken = newTokens.access_token;
          await db
            .from("connected_accounts")
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              token_expires_at: newTokens.expires_at,
              updated_at: new Date().toISOString(),
            })
            .eq("id", accountId);
          return await fn();
        }

        if (graphErr.status === 429) {
          let retryAfter = 30;
          try {
            const parsed = JSON.parse(graphErr.body ?? "{}");
            if (parsed?.["Retry-After"]) retryAfter = Number(parsed["Retry-After"]) || 30;
          } catch { /* use default */ }
          await sleep(retryAfter * 1000);
          return await fn();
        }

        throw err;
      }
    }

    // 5. Time window
    const now = new Date();
    const startDateTime = new Date(now.getTime() - PAST_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const endDateTime = new Date(now.getTime() + FUTURE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Resume state
    eventsSynced = job.emails_synced || 0;
    const existingState = job.error_details as CalendarProcessingState | null;
    let pageUrl: string | undefined = existingState?.next_calendar_page ?? undefined;

    // 6. Pagination loop
    let hasMore = true;
    while (hasMore) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= budgetMs - 5000) {
        // Budget exhausted — save state and return
        await db
          .from("sync_jobs")
          .update({
            status: "pending",
            emails_synced: eventsSynced,
            error_details: { next_calendar_page: pageUrl ?? null } satisfies CalendarProcessingState,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        await db
          .from("connected_accounts")
          .update({ sync_status: "idle", updated_at: new Date().toISOString() })
          .eq("id", accountId);

        return { status: "pending_continuation", emails_synced: eventsSynced, attachments_recorded: 0 };
      }

      const result = await graphCall(() =>
        listCalendarEvents(accessToken, { startDateTime, endDateTime, pageUrl })
      );

      // Process events
      for (const event of result.events) {
        if (!event.start || !event.end) continue;

        const startAt = parseEventTime(event.start);
        const endAt = parseEventTime(event.end);
        if (!startAt || !endAt) continue;

        const bodyContent = event.body?.content ?? "";
        const isHtml = event.body?.contentType === "html";

        const row = {
          account_id: accountId,
          user_id: userId,
          provider_event_id: event.id,
          provider_etag: event["@odata.etag"] ?? null,
          ical_uid: event.iCalUId ?? null,
          series_master_id: event.seriesMasterId ?? null,
          subject: event.subject ?? null,
          body_preview: event.bodyPreview ?? null,
          body_html: isHtml ? bodyContent : null,
          body_text: isHtml ? stripHtml(bodyContent) : (bodyContent || null),
          start_at: startAt,
          end_at: endAt,
          is_all_day: event.isAllDay ?? false,
          time_zone: event.start?.timeZone ?? null,
          location: event.location?.displayName ?? null,
          online_meeting_url: event.onlineMeeting?.joinUrl ?? null,
          online_meeting_provider: event.onlineMeetingProvider ?? null,
          organizer_email: event.organizer?.emailAddress?.address?.toLowerCase() ?? null,
          organizer_name: event.organizer?.emailAddress?.name ?? null,
          attendees: event.attendees ?? [],
          is_organizer: event.isOrganizer ?? false,
          response_status: event.responseStatus?.response ?? null,
          show_as: event.showAs ?? null,
          sensitivity: event.sensitivity ?? null,
          is_cancelled: event.isCancelled ?? false,
          importance: event.importance ?? null,
          is_recurring: event.type === "occurrence" || event.type === "exception" || event.type === "seriesMaster",
          recurrence: event.recurrence ?? null,
          local_origin: false,
          last_synced_at: new Date().toISOString(),
        };

        await db
          .from("calendar_events")
          .upsert(row, { onConflict: "account_id,provider_event_id" });

        eventsSynced++;
      }

      // Persist progress
      await db
        .from("sync_jobs")
        .update({
          emails_synced: eventsSynced,
          error_details: { next_calendar_page: result.nextLink } satisfies CalendarProcessingState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (result.nextLink) {
        pageUrl = result.nextLink;
      } else {
        hasMore = false;
      }
    }

    // 7. Complete
    await db
      .from("sync_jobs")
      .update({
        status: "completed",
        emails_synced: eventsSynced,
        completed_at: new Date().toISOString(),
        error_details: { next_calendar_page: null } satisfies CalendarProcessingState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await db
      .from("connected_accounts")
      .update({
        sync_status: "idle",
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    return { status: "completed", emails_synced: eventsSynced, attachments_recorded: 0 };

  } catch (err: unknown) {
    const message = errorToMessage(err);
    const details = {
      stack: err instanceof Error ? err.stack : undefined,
      body: (err as { body?: string }).body,
    };

    await db
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: message,
        error_details: details,
        emails_synced: eventsSynced,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await db
      .from("connected_accounts")
      .update({
        sync_status: "error",
        sync_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    return { status: "failed", emails_synced: eventsSynced, attachments_recorded: 0, error_message: message, error_details: details };
  }
}
