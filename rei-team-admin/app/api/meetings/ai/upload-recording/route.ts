import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

/**
 * Max upload size (bytes)
 * Default: 4MB
 * Can be overridden with env var
 */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_RECORDING_UPLOAD_BYTES || 4_000_000);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const meetingId = (formData.get("meetingId") as string | null) ?? null;
    const sessionId = (formData.get("sessionId") as string | null) ?? null;
    const durationSeconds = (formData.get("durationSeconds") as string | null) ?? null;
    const createdBy = (formData.get("createdBy") as string | null) ?? null;
    const file = (formData.get("file") as File | null) ?? null;

    if (!meetingId || !sessionId || !file) {
      return NextResponse.json({ error: "Missing meetingId, sessionId, or file" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Recording too large (${file.size} bytes). Max allowed is ${MAX_UPLOAD_BYTES} bytes.`,
        },
        { status: 413 }
      );
    }

    const admin = supabaseAdmin();
    const recordingsBucket = process.env.RECORDINGS_BUCKET || "meeting-recordings";
    const storagePath = `${meetingId}/${sessionId}/recording_${Date.now()}.webm`;

    // Upload to Supabase storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(recordingsBucket)
      .upload(storagePath, buffer, {
        contentType: "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Failed to upload recording to storage", uploadError);
      return NextResponse.json({ error: "Failed to upload recording" }, { status: 500 });
    }

    // Save record in meeting_recordings table
    const { error: dbError } = await admin
      .from("meeting_recordings")
      .insert({
        session_id: sessionId,
        storage_path: storagePath,
        duration_seconds: durationSeconds ? Number(durationSeconds) : null,
        created_by: createdBy,
      });

    if (dbError) {
      console.error("Failed to save recording record", dbError);
      return NextResponse.json({ error: "Failed to save recording record" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      recordingPath: storagePath,
    });
  } catch (err: any) {
    console.error("Upload recording error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload recording" },
      { status: 500 }
    );
  }
}
