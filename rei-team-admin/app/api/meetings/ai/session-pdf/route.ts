import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const admin = supabaseAdmin();
    const pdfBucket = requireEnv("MINUTES_PDF_BUCKET");

    const s = await admin.from("meeting_minutes_sessions").select("id,pdf_path").eq("id", sessionId).single();
    if (s.error) throw s.error;

    const pdfPath = s.data?.pdf_path as string | null;
    if (!pdfPath) return NextResponse.json({ error: "No PDF saved for this session" }, { status: 404 });

    const signed = await admin.storage.from(pdfBucket).createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
    if (signed.error) throw signed.error;

    return NextResponse.json({ url: signed.data?.signedUrl });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Failed to get PDF" }, { status: 500 });
  }
}
