/// <reference lib="deno.ns" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const DEFAULT_SUMMARY_MODEL = Deno.env.get("OPENAI_SUMMARY_MODEL") || "gpt-4o-mini";
const DEFAULT_TRANSCRIBE_MODEL = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";

// These are kept conservative to avoid token/timeout blowups on long meetings.
// They can be overridden via env without code changes.
const TRANSCRIPT_CHUNK_CHARS = Math.max(2000, Number(Deno.env.get("TRANSCRIPT_CHUNK_CHARS") || "12000"));
const MAX_CHUNKS = Math.max(1, Number(Deno.env.get("TRANSCRIPT_MAX_CHUNKS") || "10"));

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Basic, non-cryptographic constant-time-ish compare to avoid accidental logs / subtle timing.
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let ok = 0;
  for (let i = 0; i < a.length; i++) {
    ok |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return ok === 0;
}

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: any;
  old_record?: any;
};

async function json(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function splitTranscript(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];

  // Prefer splitting on paragraph boundaries for cleaner chunk semantics.
  const paras = t.replace(/\r\n/g, "\n").split("\n\n");
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    const next = cur ? cur + "\n\n" + p : p;
    if (next.length <= TRANSCRIPT_CHUNK_CHARS) {
      cur = next;
      continue;
    }
    if (cur) chunks.push(cur);
    cur = p;
    if (chunks.length >= MAX_CHUNKS) break;
  }
  if (cur && chunks.length < MAX_CHUNKS) chunks.push(cur);

  // Fallback if we ended up with a single enormous paragraph.
  if (chunks.length === 1 && chunks[0]!.length > TRANSCRIPT_CHUNK_CHARS) {
    const s = chunks[0]!;
    const out: string[] = [];
    for (let i = 0; i < s.length && out.length < MAX_CHUNKS; i += TRANSCRIPT_CHUNK_CHARS) {
      out.push(s.slice(i, i + TRANSCRIPT_CHUNK_CHARS));
    }
    return out;
  }

  return chunks;
}

function mergeNote(a: string, b: string): string {
  const left = (a || "").trim();
  const right = (b || "").trim();
  if (!left) return right;
  if (!right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return left + "\n" + right;
}

async function summarizeChunk(opts: {
  client: OpenAI;
  agendaList: string;
  transcriptChunk: string;
}) {
  const schema = {
    name: "AgendaNotes",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        agenda: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              agenda_item_id: { type: "string" },
              notes: { type: "string" },
            },
            required: ["agenda_item_id", "notes"],
          },
        },
      },
      required: ["agenda"],
    },
    strict: true,
  } as const;

  const completion = await opts.client.chat.completions.create({
    model: DEFAULT_SUMMARY_MODEL,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: schema },
    messages: [
      {
        role: "system",
        content:
          "Turn a meeting transcript chunk into concise, professional meeting minutes. " +
          "Return ONLY valid JSON matching the schema. " +
          "Populate the 'agenda' array with one object per agenda item. " +
          "Each object must include: agenda_item_id and notes. " +
          "Keep notes factual, concise, and action-oriented. " +
          "If an agenda item was not discussed in THIS CHUNK, set notes to an empty string. " +
          "Do not invent details. Do not include markdown.",
      },
      {
        role: "user",
        content: `Agenda items (id | label):\n${opts.agendaList}\n\nTranscript chunk:\n${opts.transcriptChunk}`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content ?? "{}";

  const notesObj: Record<string, string> = {};
  try {
    const parsed: any = JSON.parse(content);
    if (parsed && Array.isArray(parsed.agenda)) {
      for (const item of parsed.agenda) {
        const id = String(item?.agenda_item_id ?? "").trim();
        if (!id) continue;
        notesObj[id] = String(item?.notes ?? "");
      }
    }
  } catch {
    // ignore parse failures; caller can treat as empty
  }

  return notesObj;
}

async function runAi(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  openaiKey: string;
  recordingsBucket: string;
  sessionId: string;
  meetingId: string;
}) {
  const sb = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Mark processing (best-effort)
  await sb
    .from("meeting_minutes_sessions")
    .update({ ai_status: "processing", ai_error: null } as any)
    .eq("id", opts.sessionId);

  // 1) agenda items
  const agendaRes = await sb
    .from("meeting_agenda_items")
    .select("id,code,title,description,position")
    .eq("meeting_id", opts.meetingId)
    .order("position", { ascending: true });
  if (agendaRes.error) throw agendaRes.error;

  const agenda = agendaRes.data ?? [];

  // 2) recordings for session (we may have multiple segments for long meetings)
  const recRes = await sb
    .from("meeting_recordings")
    .select("storage_path,created_at")
    .eq("session_id", opts.sessionId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (recRes.error) throw recRes.error;

  const recordings = (recRes.data ?? []) as Array<{ storage_path: string; created_at: string }>;
  if (!recordings.length) {
    await sb
      .from("meeting_minutes_sessions")
      .update({ ai_status: "skipped", ai_processed_at: new Date().toISOString() } as any)
      .eq("id", opts.sessionId);
    return { skipped: true };
  }

  // 3) transcribe each recording and concatenate
  const client = new OpenAI({ apiKey: opts.openaiKey });
  const transcriptParts: string[] = [];
  for (let i = 0; i < recordings.length; i++) {
    const recordingPath = String(recordings[i]?.storage_path ?? "").trim();
    if (!recordingPath) continue;

    const dl = await sb.storage.from(opts.recordingsBucket).download(recordingPath);
    if (dl.error) throw dl.error;
    const arrBuf = await dl.data.arrayBuffer();

    const file = new File([arrBuf], `recording-${i + 1}.webm`, { type: "audio/webm" });
    const transcription = await client.audio.transcriptions.create({
      model: DEFAULT_TRANSCRIBE_MODEL,
      file,
    });
    const segText = (transcription as any)?.text ? String((transcription as any).text) : "";
    if (segText.trim()) transcriptParts.push(segText.trim());
  }

  const transcriptText = transcriptParts.join("\n\n");

  // 5) summarize into agenda mapping
  const agendaList = agenda
    .map(
      (a: any) =>
        `${a.id} | ${a.code ? a.code + " - " : ""}${a.title}${a.description ? " — " + a.description : ""}`
    )
    .join("\n");

  // Summarize in chunks to avoid token/time blowups on long meetings.
  const chunks = splitTranscript(transcriptText);
  const notesObj: Record<string, string> = {};
  for (const chunkText of chunks) {
    const chunkNotes = await summarizeChunk({ client, agendaList, transcriptChunk: chunkText });
    for (const [id, note] of Object.entries(chunkNotes)) {
      const merged = mergeNote(String(notesObj[id] ?? ""), String(note ?? ""));
      if (merged) notesObj[id] = merged;
    }
  }

  // 6) upsert notes rows
  const upRows = agenda.map((a: any) => ({
    session_id: opts.sessionId,
    agenda_item_id: a.id,
    notes: String(notesObj[String(a.id)] ?? ""),
    updated_at: new Date().toISOString(),
  }));

  const up = await sb.from("meeting_agenda_notes").upsert(upRows, { onConflict: "session_id,agenda_item_id" });
  if (up.error) throw up.error;

  // 7) store transcript on session
  await sb
    .from("meeting_minutes_sessions")
    .update(
      {
        transcript: transcriptText,
        ai_status: "done",
        ai_error: null,
        ai_processed_at: new Date().toISOString(),
      } as any
    )
    .eq("id", opts.sessionId);

  // keep last recording path for debugging/reference
  const lastPath = String(recordings[recordings.length - 1]?.storage_path ?? "").trim();
  return { transcriptText, agendaItemsUpdated: upRows.length, recordingPath: lastPath };
}

async function callFinalize(opts: {
  baseUrl: string;
  token: string;
  meetingId: string;
  sessionId: string;
}) {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/api/meetings/ai/finalize`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": opts.token,
    },
    body: JSON.stringify({ meetingId: opts.meetingId, sessionId: opts.sessionId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(j?.error || `Finalize failed (${res.status})`);
  }
  return j;
}

Deno.serve(async (req) => {
  // Optional webhook secret (recommended)
  const hookSecret = Deno.env.get("MEETING_AI_WEBHOOK_SECRET") || "";
  if (hookSecret) {
    const got = req.headers.get("x-rei-hook") || "";
    if (!safeEq(got, hookSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
  }

  const payload = (await json(req)) as WebhookPayload | null;
  const record = payload?.record ?? payload;

  // Supabase DB webhook payload has { record: {...} }
  const sessionId = String(record?.id ?? record?.session_id ?? "").trim();
  const meetingId = String(record?.meeting_id ?? "").trim();
  const aiStatus = String(record?.ai_status ?? "").trim();

  if (!sessionId || !meetingId) {
    return new Response(JSON.stringify({ ok: true, skipped: "missing ids" }), { status: 200 });
  }

  // Only process when we are queued
  if (aiStatus !== "queued") {
    return new Response(JSON.stringify({ ok: true, skipped: `ai_status=${aiStatus}` }), { status: 200 });
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = requireEnv("OPENAI_API_KEY");
  const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

  const appBaseUrl = requireEnv("APP_BASE_URL");
  const internalToken = requireEnv("INTERNAL_JOB_TOKEN");

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await runAi({
      supabaseUrl,
      serviceRoleKey,
      openaiKey,
      recordingsBucket,
      sessionId,
      meetingId,
    });

    await callFinalize({ baseUrl: appBaseUrl, token: internalToken, meetingId, sessionId });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    const msg = e?.message ?? "AI processing failed";
    // Persist error (best-effort)
    try {
      await sb
        .from("meeting_minutes_sessions")
        .update({ ai_status: "error", ai_error: msg, ai_processed_at: new Date().toISOString() } as any)
        .eq("id", sessionId);
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
