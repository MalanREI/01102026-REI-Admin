import 'server-only';
import { supabaseAdmin } from '@/src/lib/supabase/admin';
import { getOpenAIClient, OPENAI_MODELS } from './openai-client';

const MAX_EMAILS_PER_RUN = 20;
const EMBEDDING_INPUT_MAX_CHARS = 8000;

function buildEmbeddingText(email: {
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  from_address: string | null;
  from_name: string | null;
}): string {
  const parts = [
    email.subject ? `Subject: ${email.subject}` : '',
    email.from_name || email.from_address
      ? `From: ${email.from_name ?? ''} <${email.from_address ?? ''}>`
      : '',
    email.body_text || email.snippet || '',
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, EMBEDDING_INPUT_MAX_CHARS);
}

export async function runEmbeddingsBatch(): Promise<{
  processed: number;
  errors: number;
}> {
  const admin = supabaseAdmin();

  // Find emails that don't yet have an embedding row
  const { data: existingSourceIds } = await admin
    .from('embeddings')
    .select('source_id')
    .eq('source_type', 'email');

  const embeddedIds = new Set((existingSourceIds ?? []).map((r) => r.source_id));

  const { data: allEmails, error: queryError } = await admin
    .from('emails')
    .select('id, subject, snippet, body_text, from_address, from_name, received_at, account_id, user_id')
    .order('received_at', { ascending: false })
    .limit(500);

  if (queryError) {
    console.error('[embeddings] query error:', queryError);
    return { processed: 0, errors: 1 };
  }

  const candidates = (allEmails ?? []).filter((e) => !embeddedIds.has(e.id)).slice(0, MAX_EMAILS_PER_RUN);

  if (candidates.length === 0) {
    return { processed: 0, errors: 0 };
  }

  const openai = getOpenAIClient();
  const texts = candidates.map(buildEmbeddingText);

  let embeddings: number[][];
  try {
    const response = await openai.embeddings.create({
      model: OPENAI_MODELS.EMBEDDING,
      input: texts,
    });
    embeddings = response.data.map((d) => d.embedding);
  } catch (err) {
    console.error('[embeddings] OpenAI batch error:', err);
    return { processed: 0, errors: candidates.length };
  }

  // Insert into embeddings table using the polymorphic schema
  const rows = candidates.map((email, i) => ({
    user_id: email.user_id,
    account_id: email.account_id,
    source_type: 'email',
    source_id: email.id,
    chunk_index: 0,
    chunk_text: texts[i],
    embedding: JSON.stringify(embeddings[i]),
    metadata: {},
  }));

  const { error: insertError } = await admin.from('embeddings').insert(rows);
  if (insertError) {
    console.error('[embeddings] insert error:', insertError);
    return { processed: 0, errors: candidates.length };
  }

  return { processed: rows.length, errors: 0 };
}
