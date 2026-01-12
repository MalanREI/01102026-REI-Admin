import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function bufToFile(buf: ArrayBuffer, filename: string, mime: string) {
  // Node 20+ supports File
  // eslint-disable-next-line no-undef
  return new File([buf], filename, { type: mime });
}

export async function POST(req: Request) {
  try {
    const { meetingId, sessionId, recordingPath } = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      recordingPath?: string;
    };

    if (!meetingId || !sessionId || !recordingPath) {
      return NextResponse.json({ error: "meetingId + sessionId + recordingPath required" }, { status: 400 });
    }

    const openaiKey = requireEnv("OPENAI_API_KEY");
    const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

    const admin = supabaseAdmin();

    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });
    if (agendaRes.error) throw agendaRes.error;

    const agenda = (agendaRes.data ?? []).map((a: any) => ({
      id: String(a.id),
      code: a.code ? String(a.code) : null,
      title: String(a.title ?? ""),
      description: a.description ? String(a.description) : null,
    }));

    if (!agenda.length) return NextResponse.json({ ok: true, skipped: "No agenda items" });

    const dl = await admin.storage.from(recordingsBucket).download(recordingPath);
    if (dl.error) throw dl.error;

    const arrBuf = await dl.data.arrayBuffer();

    const client = new OpenAI({ apiKey: openaiKey });

    const transcription = await client.audio.transcriptions.create({
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      file: bufToFile(arrBuf, "recording.webm", "audio/webm"),
    });

    const transcriptText = (transcription as any)?.text ? String((transcription as any).text) : "";
    if (!transcriptText.trim()) return NextResponse.json({ ok: true, skipped: "Empty transcript" });

    const schema = {
      name: "AgendaNotes",
      schema: { type: "object", additionalProperties: { type: "string" } },
      strict: true,
    } as const;

    const agendaList = agenda
      .map((a) => `${a.id} | ${a.code ? a.code + " - " : ""}${a.title}${a.description ? " — " + a.description : ""}`)
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
        { role: "user", content: `Agenda items (id | label):\n${agendaList}\n\nTranscript:\n${transcriptText}` },
      ],
    });

    const content = completion.choices?.[0]?.message?.content ?? "{}";

    let notesObj: Record<string, string> = {};
    try {
      notesObj = JSON.parse(content);
    } catch {
      notesObj = {};
    }

    const upRows = agenda.map((a) => ({
      session_id: sessionId,
      agenda_item_id: a.id,
      notes: String(notesObj[a.id] ?? "").trim(),
      updated_at: new Date().toISOString(),
    }));

    const up = await admin.from("meeting_agenda_notes").upsert(upRows, { onConflict: "session_id,agenda_item_id" });
    if (up.error) throw up.error;

    try {
      await admin.from("meeting_minutes_sessions").update({ transcript: transcriptText }).eq("id", sessionId);
    } catch {
      // no-op if column doesn't exist yet
    }

    return NextResponse.json({ ok: true, agendaItemsUpdated: upRows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "AI processing failed" }, { status: 500 });
  }
}

  }
}
