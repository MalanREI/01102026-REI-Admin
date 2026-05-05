"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageShell } from "@/src/components/PageShell";
import { Card, Button } from "@/src/components/ui";

type BackfillOption = 30 | 90 | 365;

const BACKFILL_OPTIONS: { value: BackfillOption; label: string; description: string }[] = [
  { value: 30, label: "Last 30 days", description: "Quick start — sync the most recent month." },
  { value: 90, label: "Last 90 days", description: "Recommended — about a quarter of context for Claude." },
  { value: 365, label: "Last year (365 days)", description: "Maximum context — initial sync may take 20+ minutes." },
];

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined the permission request.",
  csrf_mismatch: "Security check failed. Please try again.",
  user_mismatch: "Authentication mismatch. Please try again.",
  token_exchange_failed: "Could not complete connection. Please try again.",
  profile_fetch_failed: "Connected but couldn't read your profile. Please try again.",
  no_email: "Microsoft did not provide an email address.",
  missing_params: "Connection callback was incomplete.",
  bad_state: "Security state was invalid. Please try again.",
};

export default function WorkspaceConnectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [backfillDays, setBackfillDays] = useState<BackfillOption>(90);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const status = searchParams.get("status");
  const reason = searchParams.get("reason");

  // Auto-redirect on successful connection
  useEffect(() => {
    if (status === "connected") {
      const timer = setTimeout(() => {
        window.location.href = "/workspace";
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  function dismissBanner() {
    setBannerDismissed(true);
    router.replace("/workspace/connect");
  }

  function connectOutlook() {
    window.location.href = `/api/auth/outlook/start?backfill_days=${backfillDays}`;
  }

  return (
    <PageShell>
      <div className="max-w-2xl space-y-6">
        {/* Status banners */}
        {!bannerDismissed && status === "connected" && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-sm text-emerald-400">
              Outlook connected. Initial sync starting…
            </p>
            <button onClick={dismissBanner} className="text-emerald-400/60 hover:text-emerald-400 text-sm">
              ✕
            </button>
          </div>
        )}

        {!bannerDismissed && status === "error" && reason && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">
              Connection failed: {ERROR_MESSAGES[reason] ?? `Something went wrong: ${reason}`}
            </p>
            <button onClick={dismissBanner} className="text-red-400/60 hover:text-red-400 text-sm">
              ✕
            </button>
          </div>
        )}

        <div>
          <h1 className="text-xl font-semibold text-slate-100">Connect an Email Account</h1>
          <p className="text-sm text-slate-400 mt-1">
            Link a Gmail or Outlook account to create a new workspace.
          </p>
        </div>

        {/* Backfill picker */}
        <div className="space-y-2">
          <p className="text-sm text-slate-300">How much history should we sync?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {BACKFILL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBackfillDays(opt.value)}
                className={[
                  "text-left rounded-lg border bg-surface p-4 cursor-pointer transition-all",
                  backfillDays === opt.value
                    ? "ring-2 ring-emerald-500 border-emerald-500/40"
                    : "border-white/[0.06] hover:border-white/[0.12]",
                ].join(" ")}
              >
                <p className="text-sm font-medium text-slate-200">{opt.label}</p>
                <p className="text-xs text-slate-500 mt-1">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Provider cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Outlook">
            <p className="text-xs text-slate-400 mb-4">
              Connect via Microsoft OAuth. Requires read access to your inbox.
            </p>
            <Button onClick={connectOutlook}>
              Connect Outlook
            </Button>
          </Card>

          <Card title="Gmail">
            <p className="text-xs text-slate-400 mb-4">
              Connect via Google OAuth. Requires read access to your inbox.
            </p>
            <Button disabled>
              Connect Gmail (Phase 4)
            </Button>
          </Card>
        </div>

        <p className="text-xs text-slate-500">
          Your credentials are encrypted and stored securely. We only request read access to your email.
        </p>
      </div>
    </PageShell>
  );
}
