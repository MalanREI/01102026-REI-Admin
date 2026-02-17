"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Modal, Textarea } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type LinkRow = {
  id: string;
  title: string;
  url: string;
  purpose: string | null;
  created_at: string;
};

export default function HomePage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await sb.from("links").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems(data ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [load]);

  // -------- Widgets (sortable)
  type WidgetId = "links" | "kpis";
  const defaultOrder: WidgetId[] = ["links", "kpis"];
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(defaultOrder);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const raw = window.localStorage.getItem("rei_home_widgets");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((x) => defaultOrder.includes(x));
        if (cleaned.length) setWidgetOrder(cleaned as WidgetId[]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem("rei_home_widgets", JSON.stringify(widgetOrder));
  }, [widgetOrder, defaultOrder]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = widgetOrder.indexOf(active.id as WidgetId);
    const newIndex = widgetOrder.indexOf(over.id as WidgetId);
    setWidgetOrder(arrayMove(widgetOrder, oldIndex, newIndex));
  }

  async function addLink() {
    setSaving(true);
    setError(null);
    try {
      const { error } = await sb.from("links").insert([{ title, url, purpose: purpose || null }]);
      if (error) throw error;
      setTitle(""); setUrl(""); setPurpose("");
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this link?")) return;
    const { error } = await sb.from("links").delete().eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  return (
    <PageShell>
      <div className="max-w-6xl space-y-6">
        <h1 className="text-2xl font-semibold">Home</h1>

        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {widgetOrder.map((id) => (
                <Widget key={id} id={id}>
                  {id === "links" ? (
                    <Card
                      title="Links"
                      right={
                        <Button onClick={() => setModalOpen(true)}>
                          Add Link
                        </Button>
                      }
                    >
                      {loading ? (
                        <div className="text-sm text-gray-600">Loading...</div>
                      ) : items.length === 0 ? (
                        <div className="text-sm text-gray-600">No links yet.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map((l) => (
                            <div key={l.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <a href={l.url} target="_blank" className="font-medium hover:underline break-words">
                                    {l.title}
                                  </a>
                                  {l.purpose && <div className="text-sm text-gray-600 mt-1 break-words">{l.purpose}</div>}
                                  <div className="text-xs text-gray-400 mt-2">{new Date(l.created_at).toLocaleString()}</div>
                                </div>
                                <Button variant="ghost" onClick={() => remove(l.id)}>
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  ) : (
                    <KpiWidget sb={sb} />
                  )}
                </Widget>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Modal
          open={modalOpen}
          title="Add Link"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addLink} disabled={saving || !title || !url}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Team Drive Folder" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Link</label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Purpose</label>
              <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} placeholder="Why this link matters..." />
            </div>
          </div>
        </Modal>
      </div>
    </PageShell>
  );
}

function Widget({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <div className="mb-2 flex items-center justify-end">
        <button
          className="text-xs text-gray-500 hover:text-gray-900"
          {...attributes}
          {...listeners}
          title="Drag to move"
        >
          Drag
        </button>
      </div>
      {children}
    </div>
  );
}

function KpiWidget({ sb }: { sb: ReturnType<typeof supabaseBrowser> }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ links: number; leads: number; cards: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const [links, leads, cards] = await Promise.all([
          sb.from("links").select("id", { count: "exact", head: true }),
          sb.from("leads").select("id", { count: "exact", head: true }),
          sb.from("kanban_cards").select("id", { count: "exact", head: true }),
        ]);
        if (links.error) throw links.error;
        if (leads.error) throw leads.error;
        if (cards.error) throw cards.error;

        setStats({
          links: links.count ?? 0,
          leads: leads.count ?? 0,
          cards: cards.count ?? 0,
        });
      } catch (e: unknown) {
        setErr((e as Error)?.message ?? "Failed to load KPIs");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [sb]);

  return (
    <Card
      title="KPIs"
      right={
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      }
    >
      <div className="text-sm text-gray-600">
        This widget is the foundation for a full dashboard (filters, hide/show, views). Next step: break down by status, owners, dates, and funnel stage.
      </div>
      {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{err}</div>}
      {loading ? (
        <div className="mt-4 text-sm text-gray-600">Loading...</div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Links" value={stats?.links ?? 0} />
          <Stat label="Leads" value={stats?.leads ?? 0} />
          <Stat label="Meeting Cards" value={stats?.cards ?? 0} />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
