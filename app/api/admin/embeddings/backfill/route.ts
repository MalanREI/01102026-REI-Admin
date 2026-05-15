import { NextResponse } from 'next/server';
import { supabaseServer } from '@/src/lib/supabase/server';
import { runEmbeddingsBatch } from '@/src/lib/ai/embeddings-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const result = await runEmbeddingsBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
