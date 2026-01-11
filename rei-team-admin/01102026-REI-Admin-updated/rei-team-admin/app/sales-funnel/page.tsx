"use client";

import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Textarea, Pill } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

type Lead = {
  id: string;
  full_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  notes: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["New", "Attempted", "Contacted", "Qualified", "Not Interested", "Won", "Lost"] as const;

export default function SalesFunnelPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [active, setActive] = useState<Lead | null>(null);
  const [activeNotes, setActiveNotes] = useState("");
  const [activeStatus, setActiveStatus] = useState<string>("New");

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await sb.from("leads").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = items.filter(l => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      l.full_name.toLowerCase().includes(s) ||
      (l.company ?? "").toLowerCase().includes(s) ||
      (l.phone ?? "").toLowerCase().includes(s) ||
      (l.email ?? "").toLowerCase().includes(s) ||
      (l.status ?? "").toLowerCase().includes(s)
    );
  });

  async function addLead() {
    try {
      const { error } = await sb.from("leads").insert([{
        full_name: fullName.trim(),
        company: company.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        status: "New",
      }]);
      if (error) throw error;
      setFullName(""); setCompany(""); setPhone(""); setEmail("");
      await load();
    } catch (e:any) {
      setError(e?.message ?? "Failed to add lead");
    }
  }

  function openLead(l: Lead) {
    setActive(l);
    setActiveNotes(l.notes ?? "");
    setActiveStatus(l.status ?? "New");
  }

  async function saveLead() {
    if (!active) return;
    try {
      const { error } = await sb.from("leads").update({
        notes: activeNotes || null,
        status: activeStatus,
        last_contacted_at: new Date().toISOString(),
      }).eq("id", active.id);
      if (error) throw error;
      setActive(null);
      await load();
    } catch (e:any) {
      setError(e?.message ?? "Failed to save");
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    const { error } = await sb.from("leads").delete().eq("id", id);
    if (error) setError(error.message);
    await load();
  }

  return (
    <PageShell>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Sales Funnel</h1>
            <div className="text-sm text-gray-600 mt-1">Cold-calling CRM: leads + statuses + call notes.</div>
          </div>

          <div className="w-full max-w-sm">
            <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search leads..." />
          </div>
        </div>

        <Card title="Add Lead" right={<Pill>MVP</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600">Name</label>
              <Input value={fullName} onChange={(e)=>setFullName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Company</label>
              <Input value={company} onChange={(e)=>setCompany(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Phone</label>
              <Input value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Email</label>
              <Input value={email} onChange={(e)=>setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-4">
              <Button onClick={addLead} disabled={!fullName.trim()}>Add Lead</Button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
        </Card>

        <Card title={`Leads (${filtered.length})`}>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-gray-600">No leads found.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Company</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last Contact</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l)=>(
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-3">
                        <button className="font-medium hover:underline" onClick={()=>openLead(l)}>{l.full_name}</button>
                      </td>
                      <td className="py-2 pr-3">{l.company ?? ""}</td>
                      <td className="py-2 pr-3">{l.phone ?? ""}</td>
                      <td className="py-2 pr-3">{l.email ?? ""}</td>
                      <td className="py-2 pr-3"><Pill>{l.status}</Pill></td>
                      <td className="py-2 pr-3">{l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleString() : ""}</td>
                      <td className="py-2 pr-3">
                        <Button variant="ghost" onClick={()=>deleteLead(l.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {active && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white border shadow-lg p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{active.full_name}</div>
                  <div className="text-xs text-gray-500 mt-1">{active.company ?? ""}</div>
                </div>
                <Button variant="ghost" onClick={()=>setActive(null)}>Close</Button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Status</label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={activeStatus}
                    onChange={(e)=>setActiveStatus(e.target.value)}
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Phone</label>
                  <Input value={active.phone ?? ""} disabled />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Notes</label>
                  <Textarea rows={10} value={activeNotes} onChange={(e)=>setActiveNotes(e.target.value)} placeholder="Call notes, objections, follow-up details..." />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={()=>setActive(null)}>Cancel</Button>
                <Button onClick={saveLead}>Save & Mark Contacted</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
