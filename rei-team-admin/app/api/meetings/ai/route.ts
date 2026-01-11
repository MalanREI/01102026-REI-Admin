import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

type Payload = { meetingId: string; sessionId: string; recordingPath: string };

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as Payload | null;
  if (!payload?.meetingId || !payload?.sessionId || !payload?.recordingPath) {
    return NextResponse.json({ ok: false, error: "Missing meetingId/sessionId/recordingPath" }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    // Not configured; still ok.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const admin = supabaseAdmin();

  // 1) Get a signed URL for the audio file
  const signed = await admin.storage.from("recordings").createSignedUrl(payload.recordingPath, 60);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ ok: false, error: signed.error?.message ?? "Could not sign URL" }, { status: 500 });
  }

  // 2) Fetch audio bytes
  const audioRes = await fetch(signed.data.signedUrl);
  if (!audioRes.ok) {
    return NextResponse.json({ ok: false, error: "Could not fetch audio" }, { status: 500 });
  }
  const audioBuf = await audioRes.arrayBuffer();

  // 3) Transcribe
  const openai = new OpenAI({ apiKey: openaiKey });
  const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";
  const file = new File([audioBuf], "meeting.webm", { type: "audio/webm" });

  const transcriptResp = await openai.audio.transcriptions.create({
    file,
    model: transcribeModel,
  });
  const transcript = transcriptResp.text || "";

  // Save transcript onto the recording row
  await admin
    .from("meeting_recordings")
    .update({ transcript })
    .eq("session_id", payload.sessionId)
    .eq("storage_path", payload.recordingPath);

  // 4) Summarize into agenda notes (JSON keyed by agenda_item_id)
  const agenda = await admin
    .from("meeting_agenda_items")
    .select("id,code,title,description,position")
    .eq("meeting_id", payload.meetingId)
    .order("position", { ascending: true });

  if (agenda.error) {
    return NextResponse.json({ ok: true, transcript, summarized: false, error: agenda.error.message });
  }

  const items = agenda.data ?? [];
  const chatModel = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

  const sys =
    "You are an assistant that turns a meeting transcript into agenda-topic minutes. " +
    "Return STRICT JSON only (no markdown). Keys must be agenda_item_id and values must be concise notes. " +
    "If a topic was not discussed, return an empty string for that topic.";

  const user = {
    meetingId: payload.meetingId,
    sessionId: payload.sessionId,
    agenda: items.map((x: any) => ({ id: x.id, code: x.code, title: x.title, description: x.description })),
    transcript,
  };

  const completion = await openai.chat.completions.create({
    model: chatModel,
    temperature: 0.2,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(user) },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices?.[0]?.message?.content || "{}";
  let notesById: Record<string, string> = {};
  try {
    notesById = JSON.parse(content);
  } catch {
    notesById = {};
  }

  // Upsert notes into meeting_agenda_notes
  const upserts = items.map((i: any) => ({
    session_id: payload.sessionId,
    agenda_item_id: i.id,
    notes: typeof notesById[i.id] === "string" ? notesById[i.id] : "",
    updated_at: new Date().toISOString(),
  }));

  await admin.from("meeting_agenda_notes").upsert(upserts, { onConflict: "session_id,agenda_item_id" });

  return NextResponse.json({ ok: true, transcript, summarized: true });
}
