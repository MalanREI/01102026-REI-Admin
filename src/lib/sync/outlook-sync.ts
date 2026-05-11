// Outlook email sync engine.
// Server-only — uses service role client and Graph API.

import { supabaseAdmin } from "@/src/lib/supabase/admin";
import { refreshAccessToken, graphFetch, listMailFolders, listChildFolders } from "@/src/lib/auth/outlook";

// ============================================================
// Types
// ============================================================

export interface SyncResult {
  status: "completed" | "pending_continuation" | "failed";
  emails_synced: number;
  attachments_recorded: number;
  error_message?: string;
  error_details?: unknown;
}

interface FolderInfo {
  alias: string;
  displayName: string;
}

interface ProcessingState {
  folders_pending: FolderInfo[];
  folders_done: FolderInfo[];
  current_folder_url: string | null;
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  bccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  sentDateTime?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { content?: string; contentType?: string };
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  conversationId?: string;
  parentFolderId?: string;
  internetMessageId?: string;
  attachments?: Array<{
    id: string;
    name?: string;
    size?: number;
    contentType?: string;
  }>;
}

interface GraphMessagesResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
}

// ============================================================
// Helpers
// ============================================================

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FOLDERS_TO_SYNC: FolderInfo[] = [
  { alias: "inbox", displayName: "Inbox" },
  { alias: "sentitems", displayName: "Sent Items" },
  { alias: "archive", displayName: "Archive" },
  { alias: "drafts", displayName: "Drafts" },
];

const MS_GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export function errorToMessage(err: unknown): string {
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

function stripGraphBase(url: string): string {
  if (url.startsWith(MS_GRAPH_BASE)) {
    return url.slice(MS_GRAPH_BASE.length);
  }
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================
// Main sync function
// ============================================================

export async function syncOutlookAccount(params: {
  userId: string;
  accountId: string;
  jobId: string;
  budgetMs?: number;
}): Promise<SyncResult> {
  const { userId, accountId, jobId, budgetMs = 50000 } = params;
  const startTime = Date.now();
  const db = supabaseAdmin();

  let emailsSynced = 0;
  let attachmentsRecorded = 0;

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

    // 4. Mark account syncing
    await db
      .from("connected_accounts")
      .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    // 5. Token refresh check
    let accessToken = account.access_token as string;
    const expiresAt = new Date(account.token_expires_at as string);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt < fiveMinFromNow) {
      const newTokens = await refreshAccessToken(account.refresh_token as string);
      accessToken = newTokens.access_token;
      await db
        .from("connected_accounts")
        .update({
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
          token_expires_at: newTokens.expires_at,
          scopes: newTokens.scope.split(" "),
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
    }

    // Wrapper for Graph calls with 401/429 retry
    async function graphCall<T>(path: string): Promise<T> {
      try {
        return await graphFetch<T>(accessToken, path);
      } catch (err: unknown) {
        const graphErr = err as { status?: number; body?: string };

        // 401: refresh and retry once
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
          return await graphFetch<T>(accessToken, path);
        }

        // 429: respect Retry-After
        if (graphErr.status === 429) {
          let retryAfter = 30;
          try {
            const parsed = JSON.parse(graphErr.body ?? "{}");
            if (parsed?.["Retry-After"]) retryAfter = Number(parsed["Retry-After"]) || 30;
          } catch { /* use default */ }
          await sleep(retryAfter * 1000);
          return await graphFetch<T>(accessToken, path);
        }

        throw err;
      }
    }

    // 5b. Sync folder hierarchy into email_folders table
    const DISPLAY_TO_WELLKNOWN: Record<string, string> = {
      "inbox": "inbox", "sent items": "sentitems", "drafts": "drafts",
      "deleted items": "deleteditems", "junk email": "junkemail", "junk": "junkemail",
      "archive": "archive", "outbox": "outbox",
    };
    try {
      const graphFolders = await listMailFolders(accessToken);
      const now = new Date().toISOString();
      for (const gf of graphFolders) {
        const wkn = gf.wellKnownName ?? DISPLAY_TO_WELLKNOWN[gf.displayName.toLowerCase()] ?? null;
        await db.from("email_folders").upsert({
          user_id: userId,
          account_id: accountId,
          provider_folder_id: gf.id,
          well_known_name: wkn,
          is_well_known: wkn !== null,
          display_name: gf.displayName,
          parent_folder_id: null,
          unread_count: gf.unreadItemCount ?? 0,
          total_count: gf.totalItemCount ?? 0,
          is_hidden: gf.isHidden ?? false,
          updated_at: now,
        }, { onConflict: "account_id,provider_folder_id" });

        // Sync child folders if any
        if (gf.childFolderCount > 0) {
          try {
            const children = await listChildFolders(accessToken, gf.id);
            // Look up the parent's local UUID
            const { data: parentRow } = await db.from("email_folders")
              .select("id").eq("account_id", accountId).eq("provider_folder_id", gf.id).single();
            for (const cf of children) {
              await db.from("email_folders").upsert({
                user_id: userId,
                account_id: accountId,
                provider_folder_id: cf.id,
                well_known_name: null,
                display_name: cf.displayName,
                parent_folder_id: parentRow?.id ?? null,
                unread_count: cf.unreadItemCount ?? 0,
                total_count: cf.totalItemCount ?? 0,
                is_hidden: cf.isHidden ?? false,
                updated_at: now,
              }, { onConflict: "account_id,provider_folder_id" });
            }
          } catch { /* child folder fetch failed — continue */ }
        }
      }
    } catch (err) {
      console.error("[outlook-sync] Folder sync failed (non-fatal):", err);
    }

    // 6. Determine sync window
    let filterDate: string;
    if (job.job_type === "initial_backfill") {
      const days = job.backfill_days || 90;
      const d = new Date();
      d.setDate(d.getDate() - days);
      filterDate = d.toISOString();
    } else {
      // Incremental: use latest received_at or last_synced_at
      const { data: latestEmail } = await db
        .from("emails")
        .select("received_at")
        .eq("account_id", accountId)
        .order("received_at", { ascending: false })
        .limit(1)
        .single();

      const lastReceived = latestEmail?.received_at;
      const lastSynced = account.last_synced_at;
      if (lastReceived && lastSynced) {
        filterDate = lastReceived > lastSynced ? lastReceived : lastSynced;
      } else {
        filterDate = lastReceived || lastSynced || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // 7. Folder list / resume processing state
    let state: ProcessingState;
    const existingState = job.error_details as ProcessingState | null;

    if (existingState?.folders_pending) {
      state = existingState;
    } else {
      // First invocation: well-known aliases + custom folders from DB
      const { data: customFolders } = await db
        .from("email_folders")
        .select("provider_folder_id, display_name")
        .eq("account_id", accountId)
        .eq("is_well_known", false)
        .eq("is_hidden", false);

      const allFolders: FolderInfo[] = [
        ...FOLDERS_TO_SYNC,
        ...(customFolders ?? []).map((f) => ({
          alias: f.provider_folder_id,
          displayName: f.display_name,
        })),
      ];

      state = {
        folders_pending: allFolders,
        folders_done: [],
        current_folder_url: null,
      };
    }

    // Track totals from job (resume counts)
    emailsSynced = job.emails_synced || 0;
    attachmentsRecorded = job.attachments_processed || 0;

    // 8. Process folders
    while (state.folders_pending.length > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= budgetMs - 5000) {
        // Save state and return for continuation
        await db
          .from("sync_jobs")
          .update({
            status: "pending",
            emails_synced: emailsSynced,
            attachments_processed: attachmentsRecorded,
            error_details: state,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        await db
          .from("connected_accounts")
          .update({ sync_status: "idle", updated_at: new Date().toISOString() })
          .eq("id", accountId);

        return { status: "pending_continuation", emails_synced: emailsSynced, attachments_recorded: attachmentsRecorded };
      }

      const folder = state.folders_pending[0];

      // Build or resume URL
      let currentUrl: string | null = state.current_folder_url;
      if (!currentUrl) {
        const selectFields = "id,subject,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,bodyPreview,body,isRead,isDraft,internetMessageId,parentFolderId,hasAttachments,conversationId";
        const expandAttachments = "attachments($select=id,name,size,contentType)";
        const filter = `receivedDateTime ge ${filterDate}`;
        currentUrl = `/me/mailFolders/${folder.alias}/messages?$select=${selectFields}&$expand=${expandAttachments}&$filter=${encodeURIComponent(filter)}&$top=50&$orderby=receivedDateTime asc`;
      }

      // Paginate through this folder (with 404 handling for missing folders)
      let folderMissing = false;
      while (currentUrl) {
        const elapsed2 = Date.now() - startTime;
        if (elapsed2 >= budgetMs - 5000) {
          state.current_folder_url = currentUrl;
          await db
            .from("sync_jobs")
            .update({
              status: "pending",
              emails_synced: emailsSynced,
              attachments_processed: attachmentsRecorded,
              error_details: state,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          await db
            .from("connected_accounts")
            .update({ sync_status: "idle", updated_at: new Date().toISOString() })
            .eq("id", accountId);

          return { status: "pending_continuation", emails_synced: emailsSynced, attachments_recorded: attachmentsRecorded };
        }

        // Fetch page (handle 404 for folders that don't exist)
        let resp: GraphMessagesResponse;
        try {
          resp = await graphCall<GraphMessagesResponse>(currentUrl);
        } catch (fetchErr: unknown) {
          const graphErr = fetchErr as { status?: number; body?: string };
          if (graphErr.status === 404) {
            // Folder doesn't exist for this account — skip gracefully
            folderMissing = true;
            break;
          }
          throw fetchErr;
        }
        const messages = resp.value || [];

        // 9. Process messages
        for (const msg of messages) {
          if (msg.isDraft) continue;

          const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() ?? null;
          const isSentByMe = fromAddr === (account.email_address as string).toLowerCase();

          const bodyContent = msg.body?.content ?? "";
          const isHtml = msg.body?.contentType === "html";

          const emailRow = {
            account_id: accountId,
            user_id: userId,
            provider_message_id: msg.id,
            thread_id: msg.conversationId ?? null,
            subject: msg.subject ?? null,
            from_address: fromAddr,
            from_name: msg.from?.emailAddress?.name ?? null,
            to_addresses: msg.toRecipients ?? null,
            cc_addresses: msg.ccRecipients ?? null,
            bcc_addresses: msg.bccRecipients ?? null,
            sent_at: msg.sentDateTime ?? null,
            received_at: msg.receivedDateTime ?? null,
            body_text: isHtml ? stripHtml(bodyContent) : bodyContent,
            body_html: isHtml ? bodyContent : null,
            snippet: msg.bodyPreview ?? null,
            is_sent_by_me: isSentByMe,
            is_read: msg.isRead ?? false,
            is_starred: false,
            has_attachments: msg.hasAttachments ?? false,
            is_promotional: false,
            folder_id: folder.alias,
            provider_etag: null,
            raw_headers: null,
          };

          const { data: upserted } = await db
            .from("emails")
            .upsert(emailRow, { onConflict: "account_id,provider_message_id" })
            .select("id")
            .single();

          const emailId = upserted?.id;

          // Process attachments metadata
          if (emailId && msg.attachments && msg.attachments.length > 0) {
            for (const att of msg.attachments) {
              const attRow = {
                email_id: emailId,
                user_id: userId,
                account_id: accountId,
                provider_attachment_id: att.id,
                file_name: att.name ?? null,
                mime_type: att.contentType ?? null,
                size_bytes: att.size ?? null,
                storage_path: null,
                extracted_text: null,
                extraction_status: "pending",
                ai_classification_status: "pending",
              };

              await db
                .from("email_attachments")
                .upsert(attRow, { onConflict: "email_id,provider_attachment_id" });

              attachmentsRecorded++;
            }
          }

          emailsSynced++;
        }

        // Next page
        const nextLink = resp["@odata.nextLink"];
        currentUrl = nextLink ? stripGraphBase(nextLink) : null;

        // Persist progress after each page
        state.current_folder_url = currentUrl;
        await db
          .from("sync_jobs")
          .update({
            emails_synced: emailsSynced,
            attachments_processed: attachmentsRecorded,
            error_details: state,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      // Folder complete
      state.folders_done.push(folder);
      state.folders_pending.shift();
      state.current_folder_url = null;
    }

    // 14b. Reconcile conversations from thread_ids
    try {
      await reconcileConversations({ userId, accountId, db });
    } catch (err) {
      console.error("[outlook-sync] Conversation reconciliation failed:", err);
    }

    // 15. All folders done — mark completed
    await db
      .from("sync_jobs")
      .update({
        status: "completed",
        emails_synced: emailsSynced,
        attachments_processed: attachmentsRecorded,
        completed_at: new Date().toISOString(),
        error_details: state,
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

    return { status: "completed", emails_synced: emailsSynced, attachments_recorded: attachmentsRecorded };

  } catch (err: unknown) {
    // 14. Failure handling
    const message = errorToMessage(err);
    const details = {
      stack: err instanceof Error ? err.stack : undefined,
      body: (err as { body?: string }).body,
      raw: !(err instanceof Error) ? String(err).slice(0, 500) : undefined,
    };

    await db
      .from("sync_jobs")
      .update({
        status: "failed",
        error_message: message,
        error_details: details,
        emails_synced: emailsSynced,
        attachments_processed: attachmentsRecorded,
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

    return { status: "failed", emails_synced: emailsSynced, attachments_recorded: attachmentsRecorded, error_message: message, error_details: details };
  }
}

// ============================================================
// Conversation reconciliation
// ============================================================

async function reconcileConversations(params: {
  userId: string;
  accountId: string;
  db: ReturnType<typeof supabaseAdmin>;
}): Promise<void> {
  const { userId, accountId, db } = params;

  const { data: threads } = await db
    .from("emails")
    .select("thread_id")
    .eq("account_id", accountId)
    .not("thread_id", "is", null);

  if (!threads) return;

  const uniqueThreadIds = [...new Set(threads.map((t) => t.thread_id).filter(Boolean))] as string[];

  for (const threadId of uniqueThreadIds) {
    const { data: emails } = await db
      .from("emails")
      .select("*")
      .eq("account_id", accountId)
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });

    if (!emails || emails.length === 0) continue;

    const sorted = [...emails].sort((a, b) => {
      const aT = new Date(a.sent_at ?? a.received_at).getTime();
      const bT = new Date(b.sent_at ?? b.received_at).getTime();
      return aT - bT;
    });

    const newest = sorted[sorted.length - 1];
    const oldest = sorted[0];

    const participantSet = new Map<string, { address: string; name?: string }>();
    for (const e of emails) {
      if (e.from_address) {
        participantSet.set(e.from_address.toLowerCase(), {
          address: e.from_address,
          name: e.from_name ?? undefined,
        });
      }
      for (const arr of [e.to_addresses, e.cc_addresses]) {
        if (Array.isArray(arr)) {
          for (const r of arr as Array<{ emailAddress?: { address?: string; name?: string } }>) {
            const addr = r?.emailAddress?.address;
            const name = r?.emailAddress?.name;
            if (addr) {
              participantSet.set(addr.toLowerCase(), { address: addr, name: name ?? undefined });
            }
          }
        }
      }
    }

    // Check if conversation already exists (to preserve user-set state)
    const { data: existing } = await db.from("conversations")
      .select("id, user_state").eq("account_id", accountId).eq("provider_thread_id", threadId).single();

    const anyInboxEmail = emails.some((e) => e.user_state === "inbox");
    const computedUserState = anyInboxEmail ? "inbox" : "handled";

    const convRow: Record<string, unknown> = {
      user_id: userId,
      account_id: accountId,
      provider_thread_id: threadId,
      subject: newest.subject ?? oldest.subject,
      message_count: emails.length,
      unread_count: emails.filter((e) => !e.is_read).length,
      last_message_at: newest.sent_at ?? newest.received_at,
      first_message_at: oldest.sent_at ?? oldest.received_at,
      participants: Array.from(participantSet.values()),
      has_starred: emails.some((e) => e.is_starred),
      has_attachments: emails.some((e) => e.has_attachments),
      primary_folder_id: newest.folder_id,
    };

    // Only set user_state on new conversations (preserve manual state on existing)
    if (!existing) {
      convRow.user_state = computedUserState;
    }

    const { data: conv } = await db
      .from("conversations")
      .upsert(convRow, { onConflict: "account_id,provider_thread_id" })
      .select("id")
      .single();

    if (!conv) continue;

    await db
      .from("emails")
      .update({ conversation_id: conv.id })
      .eq("account_id", accountId)
      .eq("thread_id", threadId);
  }
}
