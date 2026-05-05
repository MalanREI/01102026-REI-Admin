import { NextRequest, NextResponse } from "next/server";
import { runPendingSyncJobs } from "@/src/lib/sync/run-pending-jobs";

export async function GET(request: NextRequest) {
  // Verify cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await runPendingSyncJobs({ budgetMs: 50000 });

  return NextResponse.json(result);
}
