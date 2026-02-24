"use client";
import { MultiSelectDropdown, Button } from "@/src/components/ui";
import type { ContentType, BrandVoice, TeamMember } from "@/src/lib/types/social-media";

export interface LibraryFilterState {
  statuses: Set<string>;
  contentTypeIds: Set<string>;
  platforms: Set<string>;
  brandVoiceId: string;
  creatorId: string;
  dateFrom: string;
  dateTo: string;
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const PLATFORM_OPTIONS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "google_business", label: "Google Business" },
];

export function LibraryFilters({
  filters,
  onChange,
  onClear,
  contentTypes,
  brandVoices,
  creators,
  totalCount,
  filteredCount,
}: {
  filters: LibraryFilterState;
  onChange: (f: Partial<LibraryFilterState>) => void;
  onClear: () => void;
  contentTypes: ContentType[];
  brandVoices: BrandVoice[];
  creators: TeamMember[];
  totalCount: number;
  filteredCount: number;
}) {
  const contentTypeOptions = contentTypes.map((ct) => ({ value: ct.id, label: ct.name }));
  const brandVoiceOptions = [{ value: "", label: "All Voices" }, ...brandVoices.map((bv) => ({ value: bv.id, label: bv.name }))];
  const creatorOptions = [{ value: "", label: "All Creators" }, ...creators.map((c) => ({ value: c.id, label: c.display_name }))];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectDropdown
          label="Status"
          options={STATUS_OPTIONS}
          selected={filters.statuses}
          onChange={(s) => onChange({ statuses: s })}
        />
        <MultiSelectDropdown
          label="Content Type"
          options={contentTypeOptions}
          selected={filters.contentTypeIds}
          onChange={(s) => onChange({ contentTypeIds: s })}
        />
        <MultiSelectDropdown
          label="Platform"
          options={PLATFORM_OPTIONS}
          selected={filters.platforms}
          onChange={(s) => onChange({ platforms: s })}
        />
        <select
          value={filters.brandVoiceId}
          onChange={(e) => onChange({ brandVoiceId: e.target.value })}
          className="rounded border border-white/10 px-2 py-1 text-xs bg-base text-slate-300"
        >
          {brandVoiceOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filters.creatorId}
          onChange={(e) => onChange({ creatorId: e.target.value })}
          className="rounded border border-white/10 px-2 py-1 text-xs bg-base text-slate-300"
        >
          {creatorOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className="rounded border border-white/10 px-2 py-1 text-xs bg-base text-slate-300"
          placeholder="From"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className="rounded border border-white/10 px-2 py-1 text-xs bg-base text-slate-300"
          placeholder="To"
        />
        <Button variant="ghost" onClick={onClear} className="text-xs px-2 py-1">
          Clear Filters
        </Button>
      </div>
      <div className="text-xs text-slate-500">
        Showing {filteredCount} of {totalCount} posts
      </div>
    </div>
  );
}
