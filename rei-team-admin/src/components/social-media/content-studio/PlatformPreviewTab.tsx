"use client";

const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  linkedin: 3000,
  tiktok: 2200,
  youtube: 5000,
  google_business: 1500,
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_business: "Google Business",
};

type Props = {
  platform: string;
  content: string;
  imageUrl?: string;
};

export function PlatformPreviewTab({ platform, content, imageUrl }: Props) {
  const limit = PLATFORM_LIMITS[platform] ?? 2200;
  const charCount = content.length;
  const overLimit = charCount > limit;
  const pct = Math.min(charCount / limit, 1);

  // Extract hashtags
  const hashtags = content.match(/#\w+/g) ?? [];

  return (
    <div className="space-y-3">
      {/* Mock post frame */}
      <div className="rounded-xl bg-elevated border border-white/[0.06] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-full bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center text-xs text-emerald-400 font-bold">RE</div>
          <div>
            <div className="text-xs font-medium text-slate-200">REI Team</div>
            <div className="text-xs text-slate-500">{PLATFORM_LABELS[platform]}</div>
          </div>
        </div>

        {/* Image */}
        {imageUrl && (
          <img src={imageUrl} alt="Post image" className="w-full aspect-square object-cover" />
        )}
        {!imageUrl && (
          <div className="aspect-video bg-base/50 flex items-center justify-center text-slate-600 text-sm border-b border-white/[0.06]">
            No image generated
          </div>
        )}

        {/* Content */}
        <div className="p-3 space-y-2">
          <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
            {content || <span className="text-slate-500 italic">No content yet — generate something in the chat!</span>}
          </p>

          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hashtags.map((tag, i) => (
                <span key={i} className="text-xs text-emerald-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Character count */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className={overLimit ? "text-red-400" : "text-slate-400"}>
            {charCount.toLocaleString()} / {limit.toLocaleString()} characters
          </span>
          {overLimit && <span className="text-red-400 font-medium">⚠ Over limit</span>}
        </div>
        <div className="h-1 rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all ${overLimit ? "bg-red-500" : pct > 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
