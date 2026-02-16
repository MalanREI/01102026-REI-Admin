import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/**
 * Convert ArrayBuffer to File (Node 20+ supports global File).
 */
function bufToFile(buf: ArrayBuffer, filename: string, mime: string) {
  // eslint-disable-next-line no-undef
  return new File([buf], filename, { type: mime });
}

type AgendaItemRow = {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  position: number | null;
};

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  let sessionId: string | undefined;
  
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      recordingPath?: string;
    };

    const meetingId = body.meetingId;
    sessionId = body.sessionId;
    const recordingPath = body.recordingPath;

    if (!meetingId || !sessionId || !recordingPath) {
      return NextResponse.json(
        { error: "meetingId + sessionId + recordingPath required" },
        { status: 400 }
      );
    }

    const openaiKey = requireEnv("OPENAI_API_KEY");
    const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

    // Mark as processing
    await admin
      .from("meeting_minutes_sessions")
      .update({ ai_status: "processing" } as any)
      .eq("id", sessionId);

    // 1) Load agenda items
    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (agendaRes.error) throw agendaRes.error;

    const agendaRows = (agendaRes.data ?? []) as AgendaItemRow[];

    const agenda = agendaRows.map((a) => ({
      id: String(a.id),
      code: a.code ? String(a.code) : null,
      title: String(a.title ?? ""),
      description: a.description ? String(a.description) : null,
    }));

    if (!agenda.length) {
      await admin
        .from("meeting_minutes_sessions")
        .update({ 
          ai_status: "done",
          ai_processed_at: new Date().toISOString(),
        } as any)
        .eq("id", sessionId);
      return NextResponse.json({ ok: true, skipped: "No agenda items" });
    }

    // 2) Download recording from storage
    const dl = await admin.storage.from(recordingsBucket).download(recordingPath);
    if (dl.error) throw dl.error;

    const arrBuf = await dl.data.arrayBuffer();

    // 3) Transcribe
    const client = new OpenAI({ apiKey: openaiKey });

    const transcription = await client.audio.transcriptions.create({
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      file: bufToFile(arrBuf, "recording.webm", "audio/webm"),
    });

    const transcriptText = (transcription as any)?.text
      ? String((transcription as any).text)
      : "";

    if (!transcriptText.trim()) {
      await admin
        .from("meeting_minutes_sessions")
        .update({ 
          ai_status: "done",
          ai_processed_at: new Date().toISOString(),
        } as any)
        .eq("id", sessionId);
      return NextResponse.json({ ok: true, skipped: "Empty transcript" });
    }

    // 4) Ask AI to bucket notes per agenda item id
    // Using JSON Schema response_format for reliability
    const schema = {
      name: "AgendaNotes",
      schema: { type: "object", additionalProperties: { type: "string" } },
      strict: true,
    } as const;

    const agendaList = agenda
      .map(
        (a) =>
          `${a.id} | ${a.code ? a.code + " - " : ""}${a.title}${
            a.description ? " — " + a.description : ""
          }`
      )
      .join("\n");

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content:
            "Turn a meeting transcript into concise, professional meeting minutes. " +
            "Return ONLY JSON mapping agenda_item_id -> notes. Keep notes factual and action-oriented. " +
            "If an agenda item was not discussed, return an empty string for that item.",
        },
        {
          role: "user",
          content: `Agenda items (id | label):\n${agendaList}\n\nTranscript:\n${transcriptText}`,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "{}";

    let notesObj: Record<string, string> = {};
    try {
      notesObj = JSON.parse(content);
    } catch {
      notesObj = {};
    }

    // 5) Upsert agenda notes (one row per agenda item)
    const upRows = agenda.map((a) => ({
      session_id: sessionId,
      agenda_item_id: a.id,
      notes: String(notesObj[a.id] ?? "").trim(),
      updated_at: new Date().toISOString(),
    }));

    const up = await admin
      .from("meeting_agenda_notes")
      .upsert(upRows, { onConflict: "session_id,agenda_item_id" });

    if (up.error) throw up.error;

    // 6) Save transcript onto session (if column exists)
    try {
      await admin
        .from("meeting_minutes_sessions")
        .update({ transcript: transcriptText } as any)
        .eq("id", sessionId);
    } catch {
      // no-op
    }

    // Mark as done
    await admin
      .from("meeting_minutes_sessions")
      .update({ 
        ai_status: "done",
        ai_processed_at: new Date().toISOString(),
      } as any)
      .eq("id", sessionId);

    return NextResponse.json({ ok: true, agendaItemsUpdated: upRows.length });
  } catch (e: any) {
    // Mark as error
    if (sessionId) {
      await admin
        .from("meeting_minutes_sessions")
        .update({ 
          ai_status: "error",
          ai_error: e?.message ?? "AI processing failed",
        } as any)
        .eq("id", sessionId);
    }
    
    return NextResponse.json(
      { error: e?.message ?? "AI processing failed" },
      { status: 500 }
    );
  }
}
