// Orchestrator: picks up pending sync jobs and dispatches by provider.
// Server-only — uses service role client.

import { supabaseAdmin } from "@/src/lib/supabase/admin";
import { syncOutlookAccount, type SyncResult } from "./outlook-sync";
import { syncOutlookCalendar } from "./outlook-calendar-sync";

export async function runPendingSyncJobs(params: {
  userId?: string;
  accountId?: string;
  budgetMs?: number;
}): Promise<{
  jobs_processed: number;
  jobs_completed: number;
  jobs_failed: number;
  jobs_pending_continuation: number;
  results: Array<{ jobId: string; result: SyncResult }>;
}> {
  const { userId, accountId, budgetMs = 50000 } = params;
  const startTime = Date.now();
  const db = supabaseAdmin();

  let query = db
    .from("sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  if (userId) query = query.eq("user_id", userId);
  if (accountId) query = query.eq("account_id", accountId);

  const { data: jobs, error } = await query;
  if (error) throw error;
  if (!jobs || jobs.length === 0) {
    return { jobs_processed: 0, jobs_completed: 0, jobs_failed: 0, jobs_pending_continuation: 0, results: [] };
  }

  const results: Array<{ jobId: string; result: SyncResult }> = [];
  let completed = 0;
  let failed = 0;
  let pending = 0;

  for (const job of jobs) {
    const elapsed = Date.now() - startTime;
    const remaining = budgetMs - elapsed;
    if (remaining < 5000) break;

    // Fetch account to determine provider
    const { data: account } = await db
      .from("connected_accounts")
      .select("provider, user_id")
      .eq("id", job.account_id)
      .single();

    if (!account) {
      // Mark job failed if account gone
      await db
        .from("sync_jobs")
        .update({ status: "failed", error_message: "Account not found", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      failed++;
      results.push({ jobId: job.id, result: { status: "failed", emails_synced: 0, attachments_recorded: 0, error_message: "Account not found" } });
      continue;
    }

    if (account.provider === "outlook") {
      let result: SyncResult;

      if (job.job_type === "calendar_sync") {
        result = await syncOutlookCalendar({
          userId: account.user_id,
          accountId: job.account_id,
          jobId: job.id,
          budgetMs: remaining,
        });
      } else {
        result = await syncOutlookAccount({
          userId: account.user_id,
          accountId: job.account_id,
          jobId: job.id,
          budgetMs: remaining,
        });

        // Auto-queue calendar sync after successful email sync
        if (result.status === "completed" && (job.job_type === "initial_backfill" || job.job_type === "incremental_sync")) {
          const { data: existingCalSync } = await db
            .from("sync_jobs")
            .select("id")
            .eq("account_id", job.account_id)
            .eq("job_type", "calendar_sync")
            .in("status", ["pending", "running"])
            .limit(1);

          if (!existingCalSync?.length) {
            await db.from("sync_jobs").insert({
              user_id: account.user_id,
              account_id: job.account_id,
              job_type: "calendar_sync",
              status: "pending",
            });
          }
        }
      }

      results.push({ jobId: job.id, result });
      if (result.status === "completed") completed++;
      else if (result.status === "failed") failed++;
      else pending++;
    } else {
      console.warn(`[run-pending-jobs] Skipping job ${job.id}: provider '${account.provider}' not implemented`);
    }
  }

  return {
    jobs_processed: results.length,
    jobs_completed: completed,
    jobs_failed: failed,
    jobs_pending_continuation: pending,
    results,
  };
}
