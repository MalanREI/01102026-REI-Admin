"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/src/components/PageShell";
import { Button, Card, Input, Modal, Textarea, Pill } from "@/src/components/ui";
import { supabaseBrowser } from "@/src/lib/supabase/browser";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type Stage = { id: string; name: string; position: number };

type Company = {
  id: string;
  name: string;
  stage_id: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  main_contact_id: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from crm_contacts via crm_companies.main_contact_id FK.
  // Supabase returns this join as an array; we normalize it to a single object in loadBoard().
  main_contact: ContactLite | null;
};

type ContactLite = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  is_main?: boolean;
};

type Contact = ContactLite & {
  company_id: string;
  title: string | null;
  notes: string | null;
  last_activity_at: string | null;
  created_at: string;
};

type ActivityKind = "Call" | "Voicemail" | "Text" | "Email" | "Note";

type Activity = {
  id: string;
  company_id: string;
  contact_id: string | null;
  kind: ActivityKind;
  summary: string;
  created_by: string | null;
  created_at: string;
  created_by_profile?: { id: string; full_name: string | null } | null;
};

type ImportRow = Record<string, any>;

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : "";
}

function toKey(s: string) {
  return cleanStr(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function truthy(v: any) {
  const s = cleanStr(v).toLowerCase();
  return ["1", "true", "yes", "y", "main", "primary"].includes(s);
}

function fmtDT(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

function pick(obj: ImportRow, keys: string[]) {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function normalizeHeaderMap(headers: string[]) {
  const map = new Map<string, string>();
  for (const h of headers) map.set(toKey(h), h);
  return map;
}

function findHeader(map: Map<string, string>, wantedKeys: string[]) {
  for (const w of wantedKeys) {
    const hit = map.get(toKey(w));
    if (hit) return hit;
  }
  return null;
}

function makeFullName(first: string, last: string, full: string) {
  const f = cleanStr(full);
  if (f) return f;
  const fn = cleanStr(first);
  const ln = cleanStr(last);
  return cleanStr([fn, ln].filter(Boolean).join(" "));
}

function uniqByLower(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = cleanStr(v).toLowerCase();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(cleanStr(v));
    }
  }
  return out;
}

export default function SalesFunnelPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loading, setLoading] = useState(true);

  const [stages, setStages] = useState<Stage[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");

  // Drag state
  const dragCompanyIdRef = useRef<string | null>(null);

  // Company modal state
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<Company | null>(null);
  const [companyContacts, setCompanyContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityText, setActivityText] = useState("");
  const [activityKind, setActivityKind] = useState<ActivityKind>("Note");

  // Add company (MVP)
  const [newCompany, setNewCompany] = useState({ name: "", website: "", notes: "" });
  const [newMainContact, setNewMainContact] = useState({ full_name: "", phone: "", email: "" });

  // Stage management
  const [newStageName, setNewStageName] = useState("");

  // Import
  const [importFileName, setImportFileName] = useState<string>("");
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importError, setImportError] = useState<string>("");
  const [importDupMode, setImportDupMode] = useState<"skip" | "upsert">("upsert");
  const [importBusy, setImportBusy] = useState(false);

  async function loadBoard() {
    setLoading(true);
    try {
      const stagesRes = await supabase
        .from("crm_stages")
        .select("id,name,position")
        .order("position", { ascending: true });
      if (stagesRes.error) throw stagesRes.error;

      const companiesRes = await supabase
        .from("crm_companies")
        .select(
          "id,name,stage_id,website,phone,email,notes,main_contact_id,last_activity_at,created_at,updated_at,main_contact:crm_contacts!crm_companies_main_contact_fk(id,full_name,first_name,last_name,phone,email,is_main)"
        )
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (companiesRes.error) throw companiesRes.error;

      setStages((stagesRes.data ?? []) as Stage[]);

      // Supabase returns the joined main_contact relation as an array.
      // Normalize it into a single object so the UI + types stay clean.
      const normalized: Company[] = (companiesRes.data ?? []).map((row: any) => {
        const mcArr = Array.isArray(row?.main_contact) ? row.main_contact : [];
        const mc = mcArr.length ? (mcArr[0] as ContactLite) : null;
        return {
          id: String(row.id),
          name: String(row.name ?? ""),
          stage_id: row.stage_id ? String(row.stage_id) : null,
          website: row.website ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          notes: row.notes ?? null,
          main_contact_id: row.main_contact_id ? String(row.main_contact_id) : null,
          last_activity_at: row.last_activity_at ?? null,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          main_contact: mc,
        };
      });

      setCompanies(normalized);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to load CRM board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = cleanStr(search).toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const mc = c.main_contact;
      const blob = [
        c.name,
        c.website ?? "",
        c.phone ?? "",
        c.email ?? "",
        c.notes ?? "",
        mc?.full_name ?? "",
        mc?.email ?? "",
        mc?.phone ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [companies, search]);

  const companiesByStage = useMemo(() => {
    const map = new Map<string, Company[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of filteredCompanies) {
      const sid = c.stage_id ?? "";
      if (sid && map.has(sid)) map.get(sid)!.push(c);
      else {
        // Unstaged bucket: shove into first stage if exists (UI only)
        const first = stages[0]?.id;
        if (first) map.get(first)!.push(c);
      }
    }
    // sort within each stage by last activity then created
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const la = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const lb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        if (la !== lb) return lb - la;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      map.set(k, arr);
    }
    return map;
  }, [filteredCompanies, stages]);

  async function moveCompanyToStage(companyId: string, stageId: string) {
    try {
      const res = await supabase.from("crm_companies").update({ stage_id: stageId }).eq("id", companyId);
      if (res.error) throw res.error;
      // optimistic update
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, stage_id: stageId } : c)));
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to move company.");
    }
  }

  async function openCompany(companyId: string) {
    setOpenCompanyId(companyId);
    setCompanyDetail(null);
    setCompanyContacts([]);
    setSelectedContactId(null);
    setActivities([]);
    setActivityText("");
    setActivityKind("Note");

    try {
      const compRes = await supabase
        .from("crm_companies")
        .select(
          "id,name,stage_id,website,phone,email,notes,main_contact_id,last_activity_at,created_at,updated_at,main_contact:crm_contacts!crm_companies_main_contact_fk(id,full_name,first_name,last_name,phone,email,is_main)"
        )
        .eq("id", companyId)
        .single();
      if (compRes.error) throw compRes.error;

      const contactsRes = await supabase
        .from("crm_contacts")
        .select("id,company_id,first_name,last_name,full_name,title,phone,email,notes,is_main,last_activity_at,created_at")
        .eq("company_id", companyId)
        .order("is_main", { ascending: false })
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (contactsRes.error) throw contactsRes.error;

      const actsRes = await supabase
        .from("crm_contact_activities")
        .select("id,company_id,contact_id,kind,summary,created_by,created_at,created_by_profile:profiles(id,full_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (actsRes.error) throw actsRes.error;

      // Supabase returns the joined main_contact relation as an array.
      // Normalize it into a single object to satisfy our Company type.
      const row: any = compRes.data;
      const mcArr = Array.isArray(row?.main_contact) ? row.main_contact : [];
      const mc = mcArr.length ? (mcArr[0] as ContactLite) : null;

      const normalizedCompany: Company = {
        id: String(row.id),
        name: String(row.name ?? ""),
        stage_id: row.stage_id ? String(row.stage_id) : null,
        website: row.website ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        notes: row.notes ?? null,
        main_contact_id: row.main_contact_id ? String(row.main_contact_id) : null,
        last_activity_at: row.last_activity_at ?? null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        main_contact: mc,
      };

      setCompanyDetail(normalizedCompany);
      setCompanyContacts((contactsRes.data ?? []) as Contact[]);
      // Supabase returns created_by_profile relation as an array. Normalize to single object.
      const actsRaw: any[] = (actsRes.data ?? []) as any[];

      const toActivityKind = (v: any): ActivityKind => {
        const s = String(v ?? "Note");
        return (["Call", "Voicemail", "Text", "Email", "Note"] as const).includes(s as any) ? (s as ActivityKind) : "Note";
      };

      const normalizedActs: Activity[] = actsRaw.map((a: any) => {
        const profArr = Array.isArray(a?.created_by_profile) ? a.created_by_profile : [];
        const prof = profArr.length
          ? { id: String(profArr[0].id), full_name: profArr[0].full_name != null ? String(profArr[0].full_name) : null }
          : null;

        return {
          id: String(a.id),
          company_id: String(a.company_id),
          contact_id: a.contact_id ? String(a.contact_id) : null,
          kind: toActivityKind(a.kind),
          summary: String(a.summary ?? ""),
          created_by: a.created_by ? String(a.created_by) : null,
          created_at: String(a.created_at),
          created_by_profile: prof,
        };
      });

      setActivities(normalizedActs);
// select main contact if present
      const mainId = (compRes.data as any)?.main_contact_id as string | null;
      if (mainId) setSelectedContactId(mainId);
      else if (contactsRes.data?.[0]?.id) setSelectedContactId(contactsRes.data[0].id);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to load company details.");
      setOpenCompanyId(null);
    }
  }

  async function saveCompanyDetail() {
    if (!companyDetail) return;
    try {
      const res = await supabase
        .from("crm_companies")
        .update({
          name: companyDetail.name,
          website: companyDetail.website,
          phone: companyDetail.phone,
          email: companyDetail.email,
          notes: companyDetail.notes,
          stage_id: companyDetail.stage_id,
        })
        .eq("id", companyDetail.id);
      if (res.error) throw res.error;

      await loadBoard();
      alert("Saved.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save company.");
    }
  }

  async function setMainContact(companyId: string, contactId: string) {
    try {
      const res = await supabase.rpc("crm_set_main_contact", { p_company_id: companyId, p_contact_id: contactId });
      if (res.error) throw res.error;

      // refresh detail + board view
      await openCompany(companyId);
      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to set main contact.");
    }
  }

  async function addActivity() {
    if (!companyDetail) return;
    const summary = cleanStr(activityText);
    if (!summary) return;

    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data?.user?.id ?? null;

      const insertRes = await supabase
        .from("crm_contact_activities")
        .insert({
          company_id: companyDetail.id,
          contact_id: selectedContactId,
          kind: activityKind,
          summary,
          created_by: userId,
        })
        .select("id,company_id,contact_id,kind,summary,created_by,created_at,created_by_profile:profiles(id,full_name)")
        .single();

      if (insertRes.error) throw insertRes.error;

      // Supabase returns created_by_profile relation as an array. Normalize it to a single object,
      // and validate kind into our ActivityKind union to satisfy TypeScript.
      const d: any = insertRes.data;
      const profArr = Array.isArray(d?.created_by_profile) ? d.created_by_profile : [];
      const prof =
        profArr.length
          ? {
              id: String(profArr[0].id),
              full_name: profArr[0].full_name != null ? String(profArr[0].full_name) : null,
            }
          : null;

      const kRaw = String(d?.kind ?? "Note");
      const k = (["Call", "Voicemail", "Text", "Email", "Note"] as const).includes(kRaw as any)
        ? (kRaw as ActivityKind)
        : "Note";

      const insertedAct: Activity = {
        id: String(d.id),
        company_id: String(d.company_id),
        contact_id: d.contact_id ? String(d.contact_id) : null,
        kind: k,
        summary: String(d.summary ?? ""),
        created_by: d.created_by ? String(d.created_by) : null,
        created_at: String(d.created_at),
        created_by_profile: prof,
      };

      setActivities((prev) => [insertedAct, ...prev]);
      setActivityText("");

      // refresh board ordering/last activity
      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to add activity.");
    }
  }

  function handleActivityHotkeys(e: React.KeyboardEvent) {
    // only when focused in textarea
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "v") setActivityKind("Voicemail");
    if (k === "c") setActivityKind("Call");
    if (k === "t") setActivityKind("Text");
    if (k === "e") setActivityKind("Email");
    if (k === "n") setActivityKind("Note");
  }

  async function addStage() {
    const name = cleanStr(newStageName);
    if (!name) return;

    try {
      const maxPos = stages.reduce((m, s) => Math.max(m, s.position ?? 0), 0);
      const res = await supabase.from("crm_stages").insert({ name, position: maxPos + 10 });
      if (res.error) throw res.error;

      setNewStageName("");
      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to add stage.");
    }
  }

  async function renameStage(stageId: string, name: string) {
    const val = cleanStr(name);
    if (!val) return;
    try {
      const res = await supabase.from("crm_stages").update({ name: val }).eq("id", stageId);
      if (res.error) throw res.error;
      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to rename stage.");
    }
  }

  async function moveStage(stageId: string, dir: "up" | "down") {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;

    const a = stages[idx];
    const b = stages[swapIdx];

    try {
      // swap positions
      const res1 = await supabase.from("crm_stages").update({ position: b.position }).eq("id", a.id);
      if (res1.error) throw res1.error;
      const res2 = await supabase.from("crm_stages").update({ position: a.position }).eq("id", b.id);
      if (res2.error) throw res2.error;

      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to reorder stage.");
    }
  }

  async function deleteStage(stageId: string) {
    if (!confirm("Delete this stage? Companies in it will become unstaged.")) return;
    try {
      const res = await supabase.from("crm_stages").delete().eq("id", stageId);
      if (res.error) throw res.error;
      await loadBoard();
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to delete stage.");
    }
  }

  async function createCompany() {
    const name = cleanStr(newCompany.name);
    if (!name) return;

    try {
      const firstStageId = stages[0]?.id ?? null;

      const compRes = await supabase
        .from("crm_companies")
        .insert({
          name,
          website: cleanStr(newCompany.website) || null,
          notes: cleanStr(newCompany.notes) || null,
          stage_id: firstStageId,
        })
        .select("id,name,stage_id,website,phone,email,notes,main_contact_id,last_activity_at,created_at,updated_at")
        .single();

      if (compRes.error) throw compRes.error;

      let mainContactId: string | null = null;

      const mcName = cleanStr(newMainContact.full_name);
      const mcPhone = cleanStr(newMainContact.phone);
      const mcEmail = cleanStr(newMainContact.email);

      if (mcName || mcPhone || mcEmail) {
        const cRes = await supabase
          .from("crm_contacts")
          .insert({
            company_id: compRes.data.id,
            full_name: mcName || null,
            phone: mcPhone || null,
            email: mcEmail || null,
            is_main: true,
          })
          .select("id")
          .single();

        if (cRes.error) throw cRes.error;

        mainContactId = cRes.data.id;

        const setRes = await supabase.rpc("crm_set_main_contact", {
          p_company_id: compRes.data.id,
          p_contact_id: mainContactId,
        });
        if (setRes.error) throw setRes.error;
      }

      setNewCompany({ name: "", website: "", notes: "" });
      setNewMainContact({ full_name: "", phone: "", email: "" });
      await loadBoard();

      // open company modal
      await openCompany(compRes.data.id);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to create company.");
    }
  }

  function parseFile(file: File) {
    setImportError("");
    setImportRows([]);
    setImportFileName(file.name);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = (res.data ?? []) as any[];
          setImportRows(rows.filter((r) => Object.values(r).some((v) => cleanStr(v))));
        },
        error: (err) => setImportError(err.message),
      });
      return;
    }

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array((e.target?.result as ArrayBuffer) ?? new ArrayBuffer(0));
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
          setImportRows(json.filter((r) => Object.values(r).some((v) => cleanStr(v))));
        } catch (err: any) {
          setImportError(err?.message ?? "Failed to read Excel file.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    setImportError("Unsupported file type. Please upload .CSV or .XLSX");
  }

  function inferImportMapping(rows: any[]) {
    const first = rows?.[0];
    if (!first) return null;

    const headers = Object.keys(first);
    const map = normalizeHeaderMap(headers);

    return {
      company: findHeader(map, ["company", "companyname", "business", "organization"]) ?? "",
      firstName: findHeader(map, ["firstname", "first", "fname", "givenname"]) ?? "",
      lastName: findHeader(map, ["lastname", "last", "lname", "surname", "familyname"]) ?? "",
      fullName: findHeader(map, ["fullname", "name", "contactname"]) ?? "",
      phone: findHeader(map, ["phone", "phonenumber", "mobile", "cell", "tel"]) ?? "",
      email: findHeader(map, ["email", "emailaddress"]) ?? "",
      notes: findHeader(map, ["notes", "note", "comments", "comment"]) ?? "",
      website: findHeader(map, ["website", "domain", "url"]) ?? "",
      isMain: findHeader(map, ["ismain", "main", "primary", "primarycontact", "maincontact"]) ?? "",
      stage: findHeader(map, ["stage", "status", "funnelstage"]) ?? "",
    };
  }

  async function runImport() {
    if (!importRows.length) return;

    const mapping = inferImportMapping(importRows);
    if (!mapping?.company) {
      alert("Import needs a 'company' column. (Header can be Company / Company Name / Business, etc.)");
      return;
    }

    setImportBusy(true);
    try {
      // Build normalized rows
      const normalized = importRows
        .map((r) => {
          const company = cleanStr(r[mapping.company]);
          const first = mapping.firstName ? cleanStr(r[mapping.firstName]) : "";
          const last = mapping.lastName ? cleanStr(r[mapping.lastName]) : "";
          const full = mapping.fullName ? cleanStr(r[mapping.fullName]) : "";
          const full_name = makeFullName(first, last, full);

          const phone = mapping.phone ? cleanStr(r[mapping.phone]) : "";
          const email = mapping.email ? cleanStr(r[mapping.email]) : "";
          const notes = mapping.notes ? cleanStr(r[mapping.notes]) : "";
          const website = mapping.website ? cleanStr(r[mapping.website]) : "";
          const is_main = mapping.isMain ? truthy(r[mapping.isMain]) : false;

          const stageName = mapping.stage ? cleanStr(r[mapping.stage]) : "";

          return {
            company,
            full_name,
            first_name: first || null,
            last_name: last || null,
            phone: phone || null,
            email: email || null,
            notes: notes || null,
            website: website || null,
            is_main,
            stageName,
          };
        })
        .filter((r) => r.company);

      if (!normalized.length) {
        alert("No valid rows found.");
        return;
      }

      // Stage lookup by name (optional)
      const stageByLower = new Map(stages.map((s) => [cleanStr(s.name).toLowerCase(), s.id]));
      const defaultStageId = stages[0]?.id ?? null;

      // 1) Upsert companies
      const uniqCompanies = uniqByLower(normalized.map((r) => r.company));
      const companyPayload = uniqCompanies.map((name) => {
        // If any row provides a website, keep the first non-empty
        const rowWithWebsite = normalized.find((r) => cleanStr(r.company).toLowerCase() === name.toLowerCase() && r.website);
        const rowWithStage = normalized.find((r) => cleanStr(r.company).toLowerCase() === name.toLowerCase() && r.stageName);
        const stageId = rowWithStage ? stageByLower.get(cleanStr(rowWithStage.stageName).toLowerCase()) ?? defaultStageId : defaultStageId;
        return {
          name,
          website: rowWithWebsite?.website ?? null,
          stage_id: stageId,
        };
      });

      if (importDupMode === "skip") {
        // Insert only those that don't exist already
        const existingRes = await supabase
          .from("crm_companies")
          .select("id,name")
          .in("name", companyPayload.map((c) => c.name));
        if (existingRes.error) throw existingRes.error;

        const existingLower = new Set((existingRes.data ?? []).map((c: any) => cleanStr(c.name).toLowerCase()));
        const toInsert = companyPayload.filter((c) => !existingLower.has(cleanStr(c.name).toLowerCase()));

        if (toInsert.length) {
          const insRes = await supabase.from("crm_companies").insert(toInsert);
          if (insRes.error) throw insRes.error;
        }
      } else {
        const upRes = await supabase.from("crm_companies").upsert(companyPayload, { onConflict: "name_lower" });
        if (upRes.error) throw upRes.error;
      }

      // Get company ids
      const compRes = await supabase
        .from("crm_companies")
        .select("id,name,name_lower,stage_id")
        .in(
          "name_lower",
          companyPayload.map((c) => cleanStr(c.name).toLowerCase())
        );
      if (compRes.error) throw compRes.error;

      const companyIdByLower = new Map((compRes.data ?? []).map((c: any) => [cleanStr(c.name_lower), c.id]));

      // 2) Upsert contacts
      const contactRows = normalized
        .map((r) => ({
          company_id: companyIdByLower.get(cleanStr(r.company).toLowerCase()) ?? null,
          full_name: r.full_name || null,
          first_name: r.first_name,
          last_name: r.last_name,
          phone: r.phone,
          email: r.email,
          notes: r.notes,
          is_main: r.is_main,
        }))
        .filter((r) => r.company_id);

      const withEmail = contactRows.filter((r) => cleanStr(r.email));
      const withPhoneOnly = contactRows.filter((r) => !cleanStr(r.email) && cleanStr(r.phone));
      const noKey = contactRows.filter((r) => !cleanStr(r.email) && !cleanStr(r.phone));

      if (importDupMode === "skip") {
        // Best-effort: insert only
        const ins1 = withEmail.length ? await supabase.from("crm_contacts").insert(withEmail) : { error: null as any };
        if ((ins1 as any).error) throw (ins1 as any).error;
        const ins2 = withPhoneOnly.length ? await supabase.from("crm_contacts").insert(withPhoneOnly) : { error: null as any };
        if ((ins2 as any).error) throw (ins2 as any).error;
        const ins3 = noKey.length ? await supabase.from("crm_contacts").insert(noKey) : { error: null as any };
        if ((ins3 as any).error) throw (ins3 as any).error;
      } else {
        // Upsert keyed
        if (withEmail.length) {
          const u1 = await supabase.from("crm_contacts").upsert(withEmail, { onConflict: "company_id,email_lower" });
          if (u1.error) throw u1.error;
        }
        if (withPhoneOnly.length) {
          const u2 = await supabase.from("crm_contacts").upsert(withPhoneOnly, { onConflict: "company_id,phone_norm" });
          if (u2.error) throw u2.error;
        }
        if (noKey.length) {
          const ins = await supabase.from("crm_contacts").insert(noKey);
          if (ins.error) throw ins.error;
        }
      }

      // 3) Set main contacts (first flagged contact per company wins)
      const mainCandidates = contactRows.filter((r) => r.is_main && r.company_id);

      if (mainCandidates.length) {
        // Query back those contacts by company_id + (email/phone) to get IDs reliably
        // We'll keep it simple: for each company, find a matching contact now and set as main.
        const byCompany = new Map<string, { email?: string | null; phone?: string | null }>();
        for (const r of mainCandidates) {
          const cid = r.company_id as string;
          if (!byCompany.has(cid)) byCompany.set(cid, { email: r.email, phone: r.phone });
        }

        for (const [company_id, key] of byCompany.entries()) {
          let contactId: string | null = null;

          if (cleanStr(key.email)) {
            const q = await supabase
              .from("crm_contacts")
              .select("id")
              .eq("company_id", company_id)
              .eq("email_lower", cleanStr(key.email).toLowerCase())
              .limit(1)
              .maybeSingle();
            if (q.error) throw q.error;
            contactId = (q.data as any)?.id ?? null;
          } else if (cleanStr(key.phone)) {
            const digits = cleanStr(key.phone).replace(/[^0-9]+/g, "");
            if (digits) {
              const q = await supabase
                .from("crm_contacts")
                .select("id")
                .eq("company_id", company_id)
                .eq("phone_norm", digits)
                .limit(1)
                .maybeSingle();
              if (q.error) throw q.error;
              contactId = (q.data as any)?.id ?? null;
            }
          }

          if (contactId) {
            const setRes = await supabase.rpc("crm_set_main_contact", { p_company_id: company_id, p_contact_id: contactId });
            if (setRes.error) throw setRes.error;
          }
        }
      }

      await loadBoard();
      alert("Import complete.");
      setImportRows([]);
      setImportFileName("");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  const preview = useMemo(() => importRows.slice(0, 5), [importRows]);

  return (
    <PageShell title="Sales Funnel" subtitle="Cold-calling CRM: Companies → contacts → activity log + editable stages.">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="w-full max-w-xl">
          <Input placeholder="Search companies / contacts..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={loadBoard} variant="ghost">
          Refresh
        </Button>
      </div>

      {/* Board */}
      <Card
        title="Pipeline"
        right={
          <div className="flex items-center gap-2">
            <Pill>Kanban</Pill>
            {loading ? <Pill>Loading...</Pill> : null}
          </div>
        }
      >
        {stages.length === 0 ? (
          <div className="text-sm text-gray-600">No stages found. Add a stage below.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-[900px]">
              {stages.map((stage) => {
                const list = companiesByStage.get(stage.id) ?? [];
                return (
                  <div
                    key={stage.id}
                    className="w-[320px] shrink-0 rounded-2xl border bg-gray-50 p-3"
                    onDragOver={(e) => {
                      e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const cid = dragCompanyIdRef.current ?? e.dataTransfer.getData("text/plain");
                      if (cid) moveCompanyToStage(cid, stage.id);
                      dragCompanyIdRef.current = null;
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="font-semibold text-sm">{stage.name}</div>
                      <Pill>{list.length}</Pill>
                    </div>

                    <div className="flex flex-col gap-2">
                      {list.map((c) => {
                        const mc = c.main_contact;
                        const mcName =
                          cleanStr(mc?.full_name) ||
                          cleanStr([mc?.first_name, mc?.last_name].filter(Boolean).join(" ")) ||
                          "";
                        const sub = cleanStr(mcName) || cleanStr(c.website) || cleanStr(c.email) || cleanStr(c.phone) || "";
                        return (
                          <button
                            key={c.id}
                            className="text-left rounded-xl border bg-white p-3 shadow-sm hover:shadow transition"
                            draggable
                            onDragStart={(e) => {
                              dragCompanyIdRef.current = c.id;
                              e.dataTransfer.setData("text/plain", c.id);
                            }}
                            onClick={() => openCompany(c.id)}
                          >
                            <div className="font-semibold">{c.name}</div>
                            {sub ? <div className="text-xs text-gray-600 mt-1">{sub}</div> : null}
                            {c.last_activity_at ? (
                              <div className="text-[11px] text-gray-500 mt-2">Last touch: {fmtDT(c.last_activity_at)}</div>
                            ) : (
                              <div className="text-[11px] text-gray-400 mt-2">No activity yet</div>
                            )}
                          </button>
                        );
                      })}
                      {list.length === 0 ? <div className="text-xs text-gray-500">Drop companies here</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Add company */}
        <Card title="Add Company" right={<Pill>MVP</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-600 mb-1">Company name</div>
              <Input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Website (optional)</div>
              <Input value={newCompany.website} onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-600 mb-1">Company notes (optional)</div>
              <Textarea value={newCompany.notes} onChange={(e) => setNewCompany({ ...newCompany, notes: e.target.value })} />
            </div>

            <div className="md:col-span-2 mt-1">
              <div className="text-xs font-semibold text-gray-700 mb-2">Main contact (shows on Kanban card)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Full name</div>
                  <Input
                    value={newMainContact.full_name}
                    onChange={(e) => setNewMainContact({ ...newMainContact, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Phone</div>
                  <Input value={newMainContact.phone} onChange={(e) => setNewMainContact({ ...newMainContact, phone: e.target.value })} />
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Email</div>
                  <Input value={newMainContact.email} onChange={(e) => setNewMainContact({ ...newMainContact, email: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3">
            <Button onClick={createCompany}>Create Company</Button>
          </div>
        </Card>

        {/* Import */}
        <Card title="Import Contacts (CSV / XLSX)" right={<Pill>Must-have</Pill>}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) parseFile(file);
                }}
              />
              {importFileName ? <Pill>{importFileName}</Pill> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Duplicate handling</div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  value={importDupMode}
                  onChange={(e) => setImportDupMode(e.target.value as any)}
                >
                  <option value="upsert">Upsert (recommended)</option>
                  <option value="skip">Skip / best effort</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button onClick={runImport} disabled={!importRows.length || importBusy}>
                  {importBusy ? "Importing..." : `Import ${importRows.length ? `(${importRows.length})` : ""}`}
                </Button>
              </div>
            </div>

            {importError ? <div className="text-sm text-red-600">{importError}</div> : null}

            {importRows.length ? (
              <div className="text-sm text-gray-700">
                <div className="font-semibold mb-1">Preview (first 5 rows)</div>
                <div className="overflow-auto rounded-lg border">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(preview[0] ?? {}).slice(0, 8).map((h) => (
                          <th key={h} className="text-left px-2 py-2 border-b">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          {Object.keys(preview[0] ?? {})
                            .slice(0, 8)
                            .map((h) => (
                              <td key={h} className="px-2 py-2 border-b align-top">
                                {cleanStr(r[h])}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Expected headers include: Company, First Name, Last Name, Phone, Email, Notes. Optional: Website, Main/Primary, Stage.
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                Each row should be a contact. Company is required. If you include a column like <b>Main</b> or <b>Primary</b> with yes/true/1, that
                contact becomes the company’s main contact shown on the Kanban card.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Stage management */}
      <div className="mt-4">
        <Card title="Stages / Status Options" right={<Pill>Editable</Pill>}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <div className="text-xs text-gray-600 mb-1">New stage name</div>
              <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
            </div>
            <div>
              <Button onClick={addStage}>Add Stage</Button>
            </div>
          </div>

          <div className="mt-3 overflow-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 border-b">Stage</th>
                  <th className="text-left px-3 py-2 border-b">Order</th>
                  <th className="text-left px-3 py-2 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.id} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2 border-b">
                      <Input
                        defaultValue={s.name}
                        onBlur={(e) => {
                          const val = cleanStr(e.target.value);
                          if (val && val !== s.name) renameStage(s.id, val);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 border-b">
                      <div className="flex items-center gap-2">
                        <Pill>{s.position}</Pill>
                        <Button variant="ghost" onClick={() => moveStage(s.id, "up")} disabled={stages[0]?.id === s.id}>
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => moveStage(s.id, "down")}
                          disabled={stages[stages.length - 1]?.id === s.id}
                        >
                          ↓
                        </Button>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b">
                      <Button variant="ghost" onClick={() => deleteStage(s.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {stages.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-600" colSpan={3}>
                      No stages found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Company modal */}
      <Modal
        open={!!openCompanyId}
        onClose={() => {
          setOpenCompanyId(null);
          setCompanyDetail(null);
          setCompanyContacts([]);
          setSelectedContactId(null);
          setActivities([]);
          setActivityText("");
          setActivityKind("Note");
        }}
        title={companyDetail ? `Company: ${companyDetail.name}` : "Company"}
        maxWidth="max-w-5xl"
      >
        {!companyDetail ? (
          <div className="text-sm text-gray-600">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: company info */}
            <div className="lg:col-span-1 space-y-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Company name</div>
                <Input value={companyDetail.name} onChange={(e) => setCompanyDetail({ ...companyDetail, name: e.target.value })} />
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Stage</div>
                <select
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                  value={companyDetail.stage_id ?? ""}
                  onChange={(e) => setCompanyDetail({ ...companyDetail, stage_id: e.target.value })}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Website</div>
                <Input
                  value={companyDetail.website ?? ""}
                  onChange={(e) => setCompanyDetail({ ...companyDetail, website: e.target.value || null })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Phone</div>
                  <Input value={companyDetail.phone ?? ""} onChange={(e) => setCompanyDetail({ ...companyDetail, phone: e.target.value || null })} />
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Email</div>
                  <Input value={companyDetail.email ?? ""} onChange={(e) => setCompanyDetail({ ...companyDetail, email: e.target.value || null })} />
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Company notes</div>
                <Textarea
                  value={companyDetail.notes ?? ""}
                  onChange={(e) => setCompanyDetail({ ...companyDetail, notes: e.target.value || null })}
                  rows={5}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={saveCompanyDetail}>Save</Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Delete this company and all contacts/activities?")) return;
                    try {
                      const res = await supabase.from("crm_companies").delete().eq("id", companyDetail.id);
                      if (res.error) throw res.error;
                      setOpenCompanyId(null);
                      await loadBoard();
                    } catch (e: any) {
                      console.error(e);
                      alert(e?.message ?? "Failed to delete company.");
                    }
                  }}
                >
                  Delete
                </Button>
              </div>

              <div className="text-xs text-gray-500">
                Created: {fmtDT(companyDetail.created_at)} <br />
                Updated: {fmtDT(companyDetail.updated_at)} <br />
                Last touch: {companyDetail.last_activity_at ? fmtDT(companyDetail.last_activity_at) : "—"}
              </div>
            </div>

            {/* Middle: contacts */}
            <div className="lg:col-span-1 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Contacts</div>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const full_name = prompt("Contact full name (or First Last)") ?? "";
                    const name = cleanStr(full_name);
                    if (!name) return;

                    try {
                      const res = await supabase
                        .from("crm_contacts")
                        .insert({ company_id: companyDetail.id, full_name: name })
                        .select("id,company_id,first_name,last_name,full_name,title,phone,email,notes,is_main,last_activity_at,created_at")
                        .single();
                      if (res.error) throw res.error;

                      setCompanyContacts((prev) => [res.data as Contact, ...prev]);
                      if (!selectedContactId) setSelectedContactId(res.data.id);

                      await loadBoard();
                    } catch (e: any) {
                      console.error(e);
                      alert(e?.message ?? "Failed to add contact.");
                    }
                  }}
                >
                  + Add
                </Button>
              </div>

              <div className="flex flex-col gap-2 max-h-[520px] overflow-auto pr-1">
                {companyContacts.map((ct) => {
                  const displayName =
                    cleanStr(ct.full_name) || cleanStr([ct.first_name, ct.last_name].filter(Boolean).join(" ")) || "Unnamed Contact";
                  const sub = cleanStr(ct.email) || cleanStr(ct.phone) || "";
                  const isSelected = ct.id === selectedContactId;
                  return (
                    <button
                      key={ct.id}
                      className={[
                        "text-left rounded-xl border bg-white p-3 shadow-sm hover:shadow transition",
                        isSelected ? "ring-2 ring-gray-300" : "",
                      ].join(" ")}
                      onClick={() => setSelectedContactId(ct.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{displayName}</div>
                        <div className="flex items-center gap-2">
                          {ct.id === companyDetail.main_contact_id || ct.is_main ? <Pill>Main</Pill> : null}
                        </div>
                      </div>
                      {sub ? <div className="text-xs text-gray-600 mt-1">{sub}</div> : null}
                      {ct.last_activity_at ? (
                        <div className="text-[11px] text-gray-500 mt-2">Last: {fmtDT(ct.last_activity_at)}</div>
                      ) : (
                        <div className="text-[11px] text-gray-400 mt-2">No activity</div>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMainContact(companyDetail.id, ct.id);
                          }}
                        >
                          Set Main
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("Delete this contact? (Activities remain attached to company)")) return;
                            try {
                              const res = await supabase.from("crm_contacts").delete().eq("id", ct.id);
                              if (res.error) throw res.error;
                              setCompanyContacts((prev) => prev.filter((x) => x.id !== ct.id));
                              if (selectedContactId === ct.id) setSelectedContactId(companyContacts[0]?.id ?? null);
                              await loadBoard();
                            } catch (err: any) {
                              console.error(err);
                              alert(err?.message ?? "Failed to delete contact.");
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </button>
                  );
                })}

                {companyContacts.length === 0 ? <div className="text-sm text-gray-600">No contacts yet.</div> : null}
              </div>
            </div>

            {/* Right: activity log */}
            <div className="lg:col-span-1 space-y-3">
              <div className="font-semibold">Activity Log</div>

              <div className="rounded-xl border p-3 bg-gray-50">
                <div className="text-xs text-gray-600 mb-2">
                  Hotkeys while typing: <b>V</b>=VM, <b>C</b>=Call, <b>T</b>=Text, <b>E</b>=Email, <b>N</b>=Note
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(["Call", "Voicemail", "Text", "Email", "Note"] as ActivityKind[]).map((k) => (
                    <button
                      key={k}
                      className={[
                        "px-2 py-1 rounded-lg border text-xs",
                        activityKind === k ? "bg-white shadow-sm" : "bg-gray-100",
                      ].join(" ")}
                      onClick={() => setActivityKind(k)}
                      type="button"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <Textarea
                  placeholder="Add a note... (then press Add)"
                  value={activityText}
                  onChange={(e) => setActivityText(e.target.value)}
                  onKeyDown={handleActivityHotkeys}
                  rows={3}
                />

                <div className="mt-2 flex items-center gap-2">
                  <Button onClick={addActivity} disabled={!cleanStr(activityText)}>
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setActivityText("");
                      setActivityKind("Note");
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  Posting to:{" "}
                  <b>
                    {(() => {
                      const c = companyContacts.find((x) => x.id === selectedContactId);
                      const nm =
                        cleanStr(c?.full_name) || cleanStr([c?.first_name, c?.last_name].filter(Boolean).join(" ")) || "Company-only";
                      return nm;
                    })()}
                  </b>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-gray-600 mb-1">Move company stage from here</div>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
                    value={companyDetail.stage_id ?? ""}
                    onChange={async (e) => {
                      const sid = e.target.value;
                      setCompanyDetail({ ...companyDetail, stage_id: sid });
                      await moveCompanyToStage(companyDetail.id, sid);
                    }}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="max-h-[420px] overflow-auto pr-1">
                <div className="flex flex-col gap-2">
                  {activities
                    .filter((a) => {
                      // show all, but if a contact is selected, highlight those
                      return true;
                    })
                    .map((a) => {
                      const who = cleanStr(a.created_by_profile?.full_name) || (a.created_by ? "User" : "System");
                      const tag = a.kind;
                      const isForSelected = selectedContactId ? a.contact_id === selectedContactId : !a.contact_id;
                      return (
                        <div key={a.id} className="rounded-xl border bg-white p-3 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Pill>{tag}</Pill>
                              {isForSelected ? <Pill>Selected</Pill> : null}
                            </div>
                            <div className="text-[11px] text-gray-500">{fmtDT(a.created_at)}</div>
                          </div>
                          <div className="mt-2 text-sm">{a.summary}</div>
                          <div className="mt-2 text-[11px] text-gray-500">By: {who}</div>
                        </div>
                      );
                    })}
                  {activities.length === 0 ? <div className="text-sm text-gray-600">No activity yet.</div> : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
