"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/src/components/PageShell";
import { Button } from "@/src/components/ui";
import { ViewToggle } from "@/src/components/social-media/library/ViewToggle";
import { LibrarySearch } from "@/src/components/social-media/library/LibrarySearch";
import { LibraryFilters, type LibraryFilterState } from "@/src/components/social-media/library/LibraryFilters";
import { PostGrid } from "@/src/components/social-media/library/PostGrid";
import { PostList } from "@/src/components/social-media/library/PostList";
import { BulkActions } from "@/src/components/social-media/library/BulkActions";
import type { ContentPostWithRelations, ContentType, BrandVoice, TeamMember } from "@/src/lib/types/social-media";

const EMPTY_FILTERS: LibraryFilterState = {
  statuses: new Set(),
  contentTypeIds: new Set(),
  platforms: new Set(),
  brandVoiceId: "",
  creatorId: "",
  dateFrom: "",
  dateTo: "",
};

export default function ContentLibraryPage() {
  const router = useRouter();

  const [view, setView] = useState<"grid" | "list">("grid");
  const [posts, setPosts] = useState<ContentPostWithRelations[]>([]);
  const [allPosts, setAllPosts] = useState<ContentPostWithRelations[]>([]);
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [creators, setCreators] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<LibraryFilterState>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchMeta = useCallback(async () => {
    try {
      const [ctRes, bvRes] = await Promise.all([
        fetch("/api/content-types?activeOnly=true"),
        fetch("/api/brand-voices"),
      ]);
      if (ctRes.ok) setContentTypes(await ctRes.json());
      if (bvRes.ok) setBrandVoices(await bvRes.json());
    } catch {
      // Non-critical: filters will still work without meta
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filters.statuses.size) params.set("status", Array.from(filters.statuses).join(","));
      if (filters.contentTypeIds.size) params.set("content_type_id", Array.from(filters.contentTypeIds).join(","));
      if (filters.platforms.size) params.set("platforms", Array.from(filters.platforms).join(","));
      if (filters.brandVoiceId) params.set("brand_voice_id", filters.brandVoiceId);
      if (filters.creatorId) params.set("created_by", filters.creatorId);
      if (filters.dateFrom) params.set("date_from", filters.dateFrom);
      if (filters.dateTo) params.set("date_to", filters.dateTo);
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);

      const res = await fetch(`/api/posts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch posts");
      const data = await res.json();
      setPosts(data);

      const allRes = await fetch("/api/posts?sort_by=created_at&sort_dir=desc");
      if (allRes.ok) setAllPosts(await allRes.json());

      const creatorMap = new Map<string, TeamMember>();
      data.forEach((p: ContentPostWithRelations) => {
        if (p.created_by_member && !creatorMap.has(p.created_by_member.id)) {
          creatorMap.set(p.created_by_member.id, p.created_by_member);
        }
      });
      setCreators(Array.from(creatorMap.values()));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [search, filters, sortBy, sortDir]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  const handleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts?id=${id}`, { method: "DELETE" });
    fetchPosts();
  };

  const runBulkOp = async (requests: Promise<Response>[]) => {
    const results = await Promise.allSettled(requests);
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok));
    if (failed.length > 0) {
      setError(`${failed.length} of ${requests.length} items could not be updated. Please try again.`);
    }
    fetchPosts();
  };

  const handleBulkSubmit = async (ids: string[]) => {
    await runBulkOp(ids.map((id) => fetch("/api/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "pending_approval" }) })));
  };

  const handleBulkArchive = async (ids: string[]) => {
    await runBulkOp(ids.map((id) => fetch("/api/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: "archived" }) })));
  };

  const handleBulkDelete = async (ids: string[]) => {
    await runBulkOp(ids.map((id) => fetch(`/api/posts?id=${id}`, { method: "DELETE" })));
  };

  const handleBulkChangeType = async (ids: string[], contentTypeId: string) => {
    await runBulkOp(ids.map((id) => fetch("/api/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, content_type_id: contentTypeId }) })));
  };

  return (
    <PageShell>
      <div className="space-y-5 max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Content Library</h1>
            <p className="text-sm text-slate-400 mt-0.5">Browse, search, and manage all posts and drafts.</p>
          </div>
          <Button onClick={() => router.push("/social-media/content-studio")}>+ New Post</Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <LibrarySearch value={search} onChange={setSearch} />
          <ViewToggle view={view} onChange={setView} />
        </div>

        <LibraryFilters
          filters={filters}
          onChange={(partial) => setFilters((f) => ({ ...f, ...partial }))}
          onClear={() => setFilters(EMPTY_FILTERS)}
          contentTypes={contentTypes}
          brandVoices={brandVoices}
          creators={creators}
          totalCount={allPosts.length}
          filteredCount={posts.length}
        />

        <BulkActions
          selectedIds={selected}
          onClear={() => setSelected(new Set())}
          onSubmitForApproval={handleBulkSubmit}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onChangeContentType={handleBulkChangeType}
          contentTypes={contentTypes}
        />

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-surface p-3 h-48 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-900/20 border border-red-800/40 px-4 py-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="ghost" onClick={fetchPosts} className="mt-3">Retry</Button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="rounded-xl border border-white/[0.06] bg-surface px-4 py-12 text-center">
            <p className="text-slate-400 text-sm">No posts found.</p>
            <p className="text-slate-500 text-xs mt-1">Try adjusting your filters or create a new post.</p>
            <Button onClick={() => router.push("/social-media/content-studio")} className="mt-4">Create Post</Button>
          </div>
        )}

        {!loading && !error && posts.length > 0 && view === "grid" && (
          <PostGrid posts={posts} onPostClick={(id) => router.push(`/social-media/library/${id}`)} />
        )}

        {!loading && !error && posts.length > 0 && view === "list" && (
          <PostList
            posts={posts}
            selected={selected}
            onSelect={handleSelect}
            onPostClick={(id) => router.push(`/social-media/library/${id}`)}
            onDeletePost={handleDeletePost}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>
    </PageShell>
  );
}
