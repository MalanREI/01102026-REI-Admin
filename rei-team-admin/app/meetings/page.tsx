"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Textarea, Pill, Modal } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Column = { id: string; name: string; position: number };
type CardRow = {
  id: string;
  title: string;
  notes: string | null;
  column_id: string;
  position: number;
  updated_at: string;
};

export default function MeetingsPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newColName, setNewColName] = useState("");
  const [newCardTitle, setNewCardTitle] = useState("");
  const [selectedColId, setSelectedColId] = useState<string>("");

  const [activeCard, setActiveCard] = useState<CardRow | null>(null);
  const [activeNotes, setActiveNotes] = useState("");
  const [savingCard, setSavingCard] = useState(false);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [colRes, cardRes] = await Promise.all([
      sb.from("kanban_columns").select("*").order("position"),
      sb.from("kanban_cards").select("*").order("position"),
    ]);
    if (colRes.error) setError(colRes.error.message);
    if (cardRes.error) setError(cardRes.error.message);
    const cols = (colRes.data as any[]) ?? [];
    setColumns(cols);
    setSelectedColId((prev) => prev || cols?.[0]?.id || "");
    setCards((cardRes.data as any[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function cardsFor(colId: string) {
    return cards
      .filter((c) => c.column_id === colId)
      .sort((a, b) => a.position - b.position);
  }

  async function addColumn() {
    if (!newColName.trim()) return;
    const nextPos = columns.length ? Math.max(...columns.map((c) => c.position)) + 1 : 1;
    const { error } = await sb.from("kanban_columns").insert([{ name: newColName.trim(), position: nextPos }]);
    if (error) setError(error.message);
    setNewColName("");
    await load();
  }

  async function renameColumn(col: Column) {
    const name = prompt("Column name:", col.name);
    if (!name) return;
    const { error } = await sb.from("kanban_columns").update({ name }).eq("id", col.id);
    if (error) setError(error.message);
    await load();
  }

  async function addCard() {
    if (!newCardTitle.trim() || !selectedColId) return;
    const inCol = cardsFor(selectedColId);
    const nextPos = inCol.length ? Math.max(...inCol.map((c) => c.position)) + 1 : 1;
    const { error } = await sb
      .from("kanban_cards")
      .insert([{ title: newCardTitle.trim(), column_id: selectedColId, position: nextPos }]);
    if (error) setError(error.message);
    setNewCardTitle("");
    await load();
  }

  function openCard(c: CardRow) {
    setActiveCard(c);
    setActiveNotes(c.notes ?? "");
  }

  async function saveCard() {
    if (!activeCard) return;
    setSavingCard(true);
    try {
      const { error } = await sb
        .from("kanban_cards")
        .update({ notes: activeNotes, updated_at: new Date().toISOString() })
        .eq("id", activeCard.id);
      if (error) throw error;
      setActiveCard(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save card");
    } finally {
      setSavingCard(false);
    }
  }

  async function deleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    const { error } = await sb.from("kanban_cards").delete().eq("id", cardId);
    if (error) setError(error.message);
    await load();
  }

  function findCard(cardId: string) {
    return cards.find((c) => c.id === cardId) || null;
  }

  function findColumnByCardId(cardId: string) {
    const c = findCard(cardId);
    return c ? c.column_id : null;
  }

  async function persistColumnOrder(colId: string, orderedCardIds: string[]) {
    // normalize positions to 10,20,30... to keep room for future inserts
    const updates = orderedCardIds.map((id, idx) => ({ id, position: (idx + 1) * 10, column_id: colId }));
    const { error } = await sb.from("kanban_cards").upsert(updates, { onConflict: "id" });
    if (error) throw error;
  }

  async function onDragEnd(evt: DragEndEvent) {
    const { active, over } = evt;
    setDraggingCardId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const fromColId = findColumnByCardId(activeId);
    if (!fromColId) return;

    // If dropped over a column container, add to end of that column.
    const overIsColumn = columns.some((c) => c.id === overId);
    const toColId = overIsColumn ? overId : findColumnByCardId(overId);
    if (!toColId) return;

    const fromCards = cardsFor(fromColId).map((c) => c.id);
    const toCards = cardsFor(toColId).map((c) => c.id);

    const fromIdx = fromCards.indexOf(activeId);
    if (fromIdx === -1) return;

    try {
      if (fromColId === toColId) {
        // reorder within same column
        const toIdx = overIsColumn ? toCards.length - 1 : toCards.indexOf(overId);
        const newOrder = arrayMove(toCards, fromIdx, Math.max(0, toIdx));
        await persistColumnOrder(toColId, newOrder);
      } else {
        // move across columns
        const nextFrom = fromCards.filter((id) => id !== activeId);
        const insertAt = overIsColumn ? toCards.length : Math.max(0, toCards.indexOf(overId));
        const nextTo = [...toCards];
        nextTo.splice(insertAt, 0, activeId);

        await persistColumnOrder(fromColId, nextFrom);
        await persistColumnOrder(toColId, nextTo);
      }

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to move card");
    }
  }

  const aiEnabled = (process.env.NEXT_PUBLIC_FEATURE_MEETING_AI ?? "false") === "true";

  const draggingCard = draggingCardId ? findCard(draggingCardId) : null;

  return (
    <PageShell>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Meetings</h1>
            <div className="text-sm text-gray-600 mt-1">
              Kanban for meeting action items + notes. Drag cards between columns.
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (!aiEnabled) {
                  alert("AI Meeting Recorder is stubbed for now. Turn on NEXT_PUBLIC_FEATURE_MEETING_AI=true later.");
                  return;
                }
                alert("AI module enabled, but not implemented yet.");
              }}
            >
              Record meeting {aiEnabled ? <Pill>AI</Pill> : <Pill>stub</Pill>}
            </Button>
          </div>
        </div>

        <Card title="Quick Add">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">New Column</label>
              <div className="flex gap-2">
                <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="e.g., In Progress" />
                <Button onClick={addColumn} disabled={!newColName.trim()}>
                  Add
                </Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">New Card</label>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={selectedColId}
                  onChange={(e) => setSelectedColId(e.target.value)}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={newCardTitle}
                  onChange={(e) => setNewCardTitle(e.target.value)}
                  placeholder="Action item title..."
                  className="flex-1 min-w-[240px]"
                />
                <Button onClick={addCard} disabled={!newCardTitle.trim() || !selectedColId}>
                  Add
                </Button>
              </div>
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </Card>

        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(evt) => setDraggingCardId(String(evt.active.id))}
            onDragEnd={onDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {columns.map((col) => {
                const colCardIds = cardsFor(col.id).map((c) => c.id);
                return (
                  <div key={col.id} className="rounded-2xl border bg-white shadow-sm p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <button className="font-semibold text-sm hover:underline" onClick={() => renameColumn(col)}>
                        {col.name}
                      </button>
                      <Pill>{colCardIds.length}</Pill>
                    </div>

                    <SortableContext items={colCardIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2 min-h-[40px]" data-col={col.id}>
                        {/* Column drop zone */}
                        <ColumnDropZone id={col.id} />
                        {cardsFor(col.id).map((c) => (
                          <KanbanCard key={c.id} card={c} onOpen={openCard} onDelete={deleteCard} />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>

            <DragOverlay>
              {draggingCard ? (
                <div className="rounded-xl border bg-gray-50 p-3 shadow-lg w-64">
                  <div className="text-sm font-medium">{draggingCard.title}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <Modal
          open={!!activeCard}
          title={activeCard?.title ?? ""}
          onClose={() => setActiveCard(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setActiveCard(null)}>
                Cancel
              </Button>
              <Button onClick={saveCard} disabled={savingCard}>
                {savingCard ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <div className="text-xs text-gray-500">Updated: {activeCard ? new Date(activeCard.updated_at).toLocaleString() : ""}</div>
          <div className="mt-3">
            <label className="text-xs text-gray-600">Notes</label>
            <Textarea
              rows={10}
              value={activeNotes}
              onChange={(e) => setActiveNotes(e.target.value)}
              placeholder="Type meeting notes, action details, owners, dates..."
            />
          </div>
        </Modal>
      </div>
    </PageShell>
  );
}

function KanbanCard({ card, onOpen, onDelete }: { card: CardRow; onOpen: (c: CardRow) => void; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as React.CSSProperties;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      <div className="rounded-xl border bg-gray-50 p-3">
        <div className="flex items-start justify-between gap-2">
          <button className="text-sm font-medium hover:underline text-left" onClick={() => onOpen(card)}>
            {card.title}
          </button>
          <button
            className="text-xs text-gray-500 hover:text-gray-900"
            {...attributes}
            {...listeners}
            title="Drag"
          >
            Drag
          </button>
        </div>
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" onClick={() => onDelete(card.id)}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColumnDropZone({ id }: { id: string }) {
  const { setNodeRef } = useDroppable({ id });
  // We treat an `over.id` that matches a column id as dropping into that column.
  return <div ref={setNodeRef} className="h-2" />;
}
