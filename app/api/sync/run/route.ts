import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/src/lib/supabase/server";
import { runPendingSyncJobs } from "@/src/lib/sync/run-pending-jobs";

export async function POST(request: NextRequest) {
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  const { accountId } = body;
  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  // Verify account ownership
  const { data: account } = await db
    .from("connected_accounts")
    .select("user_id")
    .eq("id", accountId)
    .single();

  if (!account || account.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Check for existing pending/running job
  const { data: existingJobs } = await db
    .from("sync_jobs")
    .select("id")
    .eq("account_id", accountId)
    .in("status", ["pending", "running"])
    .limit(1);

  // If no pending job, queue an incremental sync
  if (!existingJobs || existingJobs.length === 0) {
    await db.from("sync_jobs").insert({
      user_id: user.id,
      account_id: accountId,
      job_type: "incremental_sync",
      status: "pending",
    });
  }

  // Run pending jobs for this account
  const result = await runPendingSyncJobs({
    userId: user.id,
    accountId,
    budgetMs: 50000,
  });

  return NextResponse.json(result);
}
