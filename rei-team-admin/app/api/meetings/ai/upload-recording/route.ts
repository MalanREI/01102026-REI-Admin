import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const admin = supabaseAdmin();

    const form = await req.formData();
    const meetingId = String(form.get("meetingId") ?? "");
    const sessionId = String(form.get("sessionId") ?? "");
    const userId = String(form.get("userId") ?? "");
    const durationSeconds = Number(form.get("durationSeconds") ?? 0);
    const file = form.get("file");

    // NOTE: userId is optional (created_by can be null). We still accept it when provided.
    if (!meetingId || !sessionId || !file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "meetingId, sessionId, durationSeconds, file required" }, { status: 400 });
    }

    const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

    const safeUser = userId || "anon";
    const filename = `${Date.now()}_${safeUser}.webm`;
    const path = `meetings/${meetingId}/sessions/${sessionId}/${filename}`;

    const up = await admin.storage.from(recordingsBucket).upload(path, file, {
      contentType: "audio/webm",
      upsert: false,
    });
    if (up.error) throw up.error;

    const recRow = await admin
      .from("meeting_recordings")
      .insert({
        session_id: sessionId,
        storage_path: path,
        duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        created_by: userId || null,
      } as any)
      .select("id")
      .single();

    if (recRow.error) throw recRow.error;

    return NextResponse.json({ ok: true, recordingPath: path, recordingId: recRow.data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
