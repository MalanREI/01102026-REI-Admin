import { NextResponse } from 'next/server';
import { runEmbeddingsBatch } from '@/src/lib/ai/embeddings-worker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runEmbeddingsBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/embeddings] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
