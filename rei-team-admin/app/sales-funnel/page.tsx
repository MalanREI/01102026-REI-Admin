"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Textarea, Pill } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import Papa from "papaparse";
import * as XLSX from "xlsx";

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

type SortKey = "created_at" | "full_name" | "company" | "status" | "last_contacted_at";

type ImportRow = {
  full_name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string;
  notes?: string | null;
};

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function normalizeStatus(s: string) {
  const val = cleanStr(s);
  if (!val) return "New";
  const match = STATUS_OPTIONS.find((x) => x.toLowerCase() === val.toLowerCase());
  return match ?? "New";
}

function pick(obj: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const k = keys.find((kk) => kk.toLowerCase() === c.toLowerCase());
    if (k) return obj[k];
  }
  return undefined;
}

function toImportRow(raw: Record<string, any>): ImportRow | null {
  const name = cleanStr(pick(raw, ["full_name", "name", "full name", "lead", "contact"]) ?? "");
  if (!name) return null;
  const company = cleanStr(pick(raw, ["company", "business", "organization", "org"]) ?? "") || null;
  const phone = cleanStr(pick(raw, ["phone", "phone number", "mobile", "cell"]) ?? "") || null;
  const email = cleanStr(pick(raw, ["email", "email address", "e-mail"]) ?? "") || null;
  const status = normalizeStatus(cleanStr(pick(raw, ["status", "stage"]) ?? ""));
  const notes = cleanStr(pick(raw, ["notes", "note", "call notes", "comments"]) ?? "") || null;
  return { full_name: name, company, phone, email, status, notes };
}

export default function SalesFunnelPage() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [active, setActive] = useState<Lead | null>(null);
  const [activeNotes, setActiveNotes] = useState("");
  const [activeStatus, setActiveStatus] = useState<string>("New");

  // Import
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMode, setImportMode] = useState<"skip" | "upsert">("skip");
  const [importResult, setImportResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await sb.from("leads").select("*").order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const search = q.trim().toLowerCase();
    let rows = items;

    if (statusFilter !== "All") {
      rows = rows.filter((l) => (l.status ?? "") === statusFilter);
    }

    if (search) {
      rows = rows.filter((l) => {
        return (
          l.full_name.toLowerCase().includes(search) ||
          (l.company ?? "").toLowerCase().includes(search) ||
          (l.phone ?? "").toLowerCase().includes(search) ||
          (l.email ?? "").toLowerCase().includes(search) ||
          (l.status ?? "").toLowerCase().includes(search)
        );
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    const get = (l: Lead) => {
      switch (sortKey) {
        case "full_name":
          return (l.full_name ?? "").toLowerCase();
        case "company":
          return (l.company ?? "").toLowerCase();
        case "status":
          return (l.status ?? "").toLowerCase();
        case "last_contacted_at":
          return l.last_contacted_at ? new Date(l.last_contacted_at).getTime() : 0;
        case "created_at":
        default:
          return l.created_at ? new Date(l.created_at).getTime() : 0;
      }
    };

    return [...rows].sort((a, b) => {
      const av = get(a) as any;
      const bv = get(b) as any;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [items, q, statusFilter, sortKey, sortDir]);

  async function handleImportFile(file: File) {
    setError(null);
    setImportResult(null);
    setImportFileName(file.name);

    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    try {
      if (ext === "csv") {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
        if (parsed.errors?.length) {
          throw new Error(parsed.errors[0]?.message || "CSV parse error");
        }
        const rows = (parsed.data ?? []).map(toImportRow).filter(Boolean) as ImportRow[];
        setImportRows(rows);
        return;
      }

      if (ext === "xlsx" || ext === "xls") {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
        const rows = (json ?? []).map(toImportRow).filter(Boolean) as ImportRow[];
        setImportRows(rows);
        return;
      }

      throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
    } catch (e: any) {
      setImportRows([]);
      setImportFileName("");
      setError(e?.message ?? "Failed to parse file");
    }
  }

  async function runImport() {
    if (!importRows.length) return;
    setImportBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const chunkSize = 200;
      let inserted = 0;
      let updatedOrSkipped = 0;

      for (let i = 0; i < importRows.length; i += chunkSize) {
        const batch = importRows.slice(i, i + chunkSize).map((r) => ({
          full_name: r.full_name.trim(),
          company: r.company ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          status: normalizeStatus(r.status ?? "New"),
          notes: r.notes ?? null,
        }));

        if (importMode === "upsert") {
          // Requires the 006 migration (email_lower unique index)
          const res = await sb
            .from("leads")
            .upsert(batch as any, { onConflict: "email_lower", ignoreDuplicates: false });
          if (res.error) throw res.error;
          // NOTE: If your Supabase client is not strongly typed for the "leads" table,
          // Postgrest responses may type `data` as `never`, which breaks builds when
          // accessing `res.data.length`. For our import UX, we track processed rows.
          inserted += batch.length;
        } else {
          const res = await sb.from("leads").insert(batch as any);
          if (res.error) {
            // When a CSV contains duplicates, insert can fail the whole batch.
            // We fall back to row-by-row inserts for that batch.
            for (const row of batch) {
              const one = await sb.from("leads").insert([row as any]);
              if (one.error) {
                updatedOrSkipped += 1;
              } else {
                inserted += 1;
              }
            }
          } else {
            inserted += batch.length;
          }
        }
      }

      setImportResult(`Import complete. Added ${inserted} lead(s)${updatedOrSkipped ? `, skipped ${updatedOrSkipped}.` : "."}`);
      setImportRows([]);
      setImportFileName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

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

        <Card title="View" right={<Pill>Filters</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">Filter by Status</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Sort</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="created_at">Newest / Oldest</option>
                <option value="last_contacted_at">Last Contact</option>
                <option value="full_name">Name</option>
                <option value="company">Company</option>
                <option value="status">Status</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title="Toggle sort direction"
              >
                {sortDir === "asc" ? "Ascending" : "Descending"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStatusFilter("All");
                  setSortKey("created_at");
                  setSortDir("desc");
                  setQ("");
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </Card>

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
          {/* errors are shown in the Import card below to avoid duplication */}
        </Card>

        <Card title="Import Leads" right={<Pill>.CSV / .XLSX</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Upload a spreadsheet</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                }}
              />
              {importFileName && <div className="mt-1 text-xs text-gray-500">Loaded: {importFileName}</div>}
            </div>

            <div>
              <label className="text-xs text-gray-600">Duplicate handling</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as any)}
              >
                <option value="skip">Skip / best effort</option>
                <option value="upsert">Upsert by Email (recommended)</option>
              </select>
            </div>
          </div>

          {importRows.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-700">
                  Ready to import <span className="font-semibold">{importRows.length}</span> lead(s).
                  <span className="text-xs text-gray-500"> (Name is required; Email is strongly recommended.)</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setImportRows([]);
                      setImportFileName("");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    disabled={importBusy}
                  >
                    Clear
                  </Button>
                  <Button onClick={runImport} disabled={importBusy}>
                    {importBusy ? "Importing..." : "Import"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 overflow-auto border rounded-xl">
                <table className="w-full text-xs">
                  <thead className="text-left text-gray-500">
                    <tr className="border-b">
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Company</th>
                      <th className="py-2 px-3">Phone</th>
                      <th className="py-2 px-3">Email</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((r, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="py-2 px-3">{r.full_name}</td>
                        <td className="py-2 px-3">{r.company ?? ""}</td>
                        <td className="py-2 px-3">{r.phone ?? ""}</td>
                        <td className="py-2 px-3">{r.email ?? ""}</td>
                        <td className="py-2 px-3">{normalizeStatus(r.status ?? "New")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 5 && <div className="mt-2 text-xs text-gray-500">Showing first 5 rows.</div>}
            </div>
          )}

          {importResult && (
            <div className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-2">
              {importResult}
            </div>
          )}

          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}
        </Card>

        <Card title={`Leads (${visible.length})`}>
          {loading ? (
            <div className="text-sm text-gray-600">Loading...</div>
          ) : visible.length === 0 ? (
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
                  {visible.map((l)=>(
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
