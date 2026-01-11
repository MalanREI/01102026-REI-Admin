"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Textarea, Pill } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

type Column = { id: string; name: string; position: number; };
type CardRow = { id: string; title: string; notes: string | null; column_id: string; position: number; updated_at: string; };

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

  useEffect(() => { void load(); }, []);

  function cardsFor(colId: string) {
    return cards.filter(c => c.column_id === colId).sort((a,b)=>a.position-b.position);
  }

  async function addColumn() {
    if (!newColName.trim()) return;
    const nextPos = columns.length ? Math.max(...columns.map(c=>c.position)) + 1 : 1;
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
    const nextPos = inCol.length ? Math.max(...inCol.map(c=>c.position)) + 1 : 1;
    const { error } = await sb.from("kanban_cards").insert([{ title: newCardTitle.trim(), column_id: selectedColId, position: nextPos }]);
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
      const { error } = await sb.from("kanban_cards").update({ notes: activeNotes, updated_at: new Date().toISOString() }).eq("id", activeCard.id);
      if (error) throw error;
      setActiveCard(null);
      await load();
    } catch (e:any) {
      setError(e?.message ?? "Failed to save card");
    } finally {
      setSavingCard(false);
    }
  }

  async function moveCard(cardId: string, direction: -1 | 1) {
    const card = cards.find(c=>c.id===cardId);
    if (!card) return;
    const colIdx = columns.findIndex(c=>c.id===card.column_id);
    const targetCol = columns[colIdx + direction];
    if (!targetCol) return;

    const targetCards = cardsFor(targetCol.id);
    const nextPos = targetCards.length ? Math.max(...targetCards.map(c=>c.position)) + 1 : 1;

    const { error } = await sb.from("kanban_cards").update({ column_id: targetCol.id, position: nextPos }).eq("id", cardId);
    if (error) setError(error.message);
    await load();
  }

  async function deleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    const { error } = await sb.from("kanban_cards").delete().eq("id", cardId);
    if (error) setError(error.message);
    await load();
  }

  const aiEnabled = (process.env.NEXT_PUBLIC_FEATURE_MEETING_AI ?? "false") === "true";

  return (
    <PageShell>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Meetings</h1>
            <div className="text-sm text-gray-600 mt-1">
              Kanban for meeting action items + notes. Columns are editable in-app.
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
                alert("AI module enabled, but not implemented yet in this starter. Next step: add transcription + summarization.");
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
                <Input value={newColName} onChange={(e)=>setNewColName(e.target.value)} placeholder="e.g., In Progress" />
                <Button onClick={addColumn} disabled={!newColName.trim()}>Add</Button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">New Card</label>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={selectedColId}
                  onChange={(e)=>setSelectedColId(e.target.value)}
                >
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Input value={newCardTitle} onChange={(e)=>setNewCardTitle(e.target.value)} placeholder="Action item title..." className="flex-1 min-w-[240px]" />
                <Button onClick={addCard} disabled={!newCardTitle.trim() || !selectedColId}>Add</Button>
              </div>
            </div>
          </div>

          {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </Card>

        {loading ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {columns.map((col) => (
              <div key={col.id} className="rounded-2xl border bg-white shadow-sm p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button className="font-semibold text-sm hover:underline" onClick={()=>renameColumn(col)}>{col.name}</button>
                  <Pill>{cardsFor(col.id).length}</Pill>
                </div>

                <div className="space-y-2">
                  {cardsFor(col.id).map((c) => (
                    <div key={c.id} className="rounded-xl border bg-gray-50 p-3">
                      <button className="text-sm font-medium hover:underline text-left w-full" onClick={()=>openCard(c)}>
                        {c.title}
                      </button>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" onClick={()=>moveCard(c.id, -1)} disabled={columns.findIndex(x=>x.id===col.id)===0}>←</Button>
                        <Button variant="ghost" onClick={()=>moveCard(c.id, 1)} disabled={columns.findIndex(x=>x.id===col.id)===columns.length-1}>→</Button>
                        <Button variant="ghost" onClick={()=>deleteCard(c.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {activeCard && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white border shadow-lg p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{activeCard.title}</div>
                  <div className="text-xs text-gray-500 mt-1">Updated: {new Date(activeCard.updated_at).toLocaleString()}</div>
                </div>
                <Button variant="ghost" onClick={()=>setActiveCard(null)}>Close</Button>
              </div>
              <div className="mt-4">
                <label className="text-xs text-gray-600">Notes</label>
                <Textarea rows={10} value={activeNotes} onChange={(e)=>setActiveNotes(e.target.value)} placeholder="Type meeting notes, action details, owners, dates..." />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={()=>setActiveCard(null)}>Cancel</Button>
                <Button onClick={saveCard} disabled={savingCard}>{savingCard ? "Saving..." : "Save"}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
