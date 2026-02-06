import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

/**
 * Max upload size (bytes)
 * Default: 4MB
 * Can be overridden with env var
 */
const MAX_UPLOAD_BYTES = Number(process.env.MAX_RECORDING_UPLOAD_BYTES || 4_000_000);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const meetingId = (formData.get("meetingId") as string | null) ?? null;
    const chunkIndex = (formData.get("chunkIndex") as string | null) ?? null;
    const totalChunks = (formData.get("totalChunks") as string | null) ?? null;
    const file = (formData.get("file") as File | null) ?? null;

    if (!meetingId || !file) {
      return NextResponse.json({ error: "Missing meetingId or file" }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Recording chunk too large (${file.size} bytes). Max allowed is ${MAX_UPLOAD_BYTES} bytes.`,
        },
        { status: 413 }
      );
    }

    // Temp directory for chunks
    const tmpDir = path.join(os.tmpdir(), "meeting-recordings", meetingId);
    fs.mkdirSync(tmpDir, { recursive: true });

    const chunkName =
      chunkIndex !== null ? `chunk_${chunkIndex}.webm` : `${randomUUID()}.webm`;

    const chunkPath = path.join(tmpDir, chunkName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(chunkPath, buffer);

    // If all chunks uploaded, assemble final file
    let finalPath: string | null = null;

    const isChunkedUpload =
      chunkIndex !== null && totalChunks !== null && !Number.isNaN(Number(chunkIndex)) && !Number.isNaN(Number(totalChunks));

    if (isChunkedUpload && Number(chunkIndex) === Number(totalChunks) - 1) {
      const finalName = `meeting_${meetingId}.webm`;
      finalPath = path.join(tmpDir, finalName);

      const writeStream = fs.createWriteStream(finalPath);

      for (let i = 0; i < Number(totalChunks); i++) {
        const partPath = path.join(tmpDir, `chunk_${i}.webm`);
        if (!fs.existsSync(partPath)) {
          writeStream.end();
          return NextResponse.json(
            { error: `Missing chunk file: chunk_${i}.webm` },
            { status: 400 }
          );
        }
        const partBuffer = fs.readFileSync(partPath);
        writeStream.write(partBuffer);
      }

      writeStream.end();

      // Save final recording path in DB and mark queued
      const { error } = await supabase
        .from("meetings")
        .update({
          recording_path: finalPath,
          ai_status: "queued",
        })
        .eq("id", meetingId);

      if (error) {
        console.error("Failed to update meeting recording_path", error);
        return NextResponse.json({ error: "Failed to save recording path" }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      chunkIndex,
      totalChunks,
      finalPath,
    });
  } catch (err: any) {
    console.error("Upload recording error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to upload recording" },
      { status: 500 }
    );
  }
}
