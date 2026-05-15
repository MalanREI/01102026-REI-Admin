import { NextResponse } from 'next/server';
import { supabaseServer } from '@/src/lib/supabase/server';
import { supabaseAdmin } from '@/src/lib/supabase/admin';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/src/lib/ai/anthropic-client';
import { logAuditEvent } from '@/src/lib/audit/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CURRENT_SUMMARY_VERSION = 1;

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { emailId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.emailId) return NextResponse.json({ error: 'emailId required' }, { status: 400 });

  // Check cache
  const { data: cached } = await supabase
    .from('ai_summaries')
    .select('summary_text, key_points, created_at')
    .eq('email_id', body.emailId)
    .eq('summary_version', CURRENT_SUMMARY_VERSION)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      summary: cached.summary_text,
      keyPoints: cached.key_points,
      cached: true,
      generatedAt: cached.created_at,
    });
  }

  // Fetch email
  const { data: email } = await supabase
    .from('emails')
    .select('id, subject, from_name, from_address, body_text, snippet, received_at')
    .eq('id', body.emailId)
    .maybeSingle();
  if (!email) return NextResponse.json({ error: 'Email not found' }, { status: 404 });

  const emailContent = [
    `From: ${email.from_name ?? email.from_address ?? '(unknown)'} <${email.from_address ?? ''}>`,
    `Subject: ${email.subject ?? '(no subject)'}`,
    `Date: ${email.received_at}`,
    '',
    email.body_text ?? email.snippet ?? '(no body)',
  ].join('\n').slice(0, 12000);

  const systemPrompt = `You are an assistant analyzing emails for a busy professional. Produce a concise summary.

Output a JSON object:
{
  "summary": "2-3 sentence executive summary",
  "keyPoints": ["specific fact or action item", ...]
}

Max 4 key points. JSON only, no markdown fences.`;

  let client: Awaited<ReturnType<typeof getAnthropicClient>>;
  try { client = await getAnthropicClient(); }
  catch { return NextResponse.json({ error: 'No Anthropic API key configured.' }, { status: 503 }); }

  let response;
  try {
    response = await client.client.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: emailContent }],
    });
  } catch (err) {
    console.error('[summarize-email] Anthropic error:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return NextResponse.json({ error: 'No text response' }, { status: 502 });

  let parsed: { summary: string; keyPoints: string[] };
  try {
    const cleaned = textBlock.text.trim().replace(/^```json\n?|\n?```$/g, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: 'AI returned malformed JSON', raw: textBlock.text }, { status: 502 });
  }

  // Cache
  const admin = supabaseAdmin();
  await admin.from('ai_summaries').insert({
    email_id: email.id,
    user_id: user.id,
    summary_version: CURRENT_SUMMARY_VERSION,
    summary_text: parsed.summary,
    key_points: parsed.keyPoints,
    model: ANTHROPIC_MODELS.SONNET,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  });

  await logAuditEvent({
    userId: user.id,
    action: 'ai.summarize_email',
    resourceType: 'email',
    resourceId: email.id,
    metadata: { model: ANTHROPIC_MODELS.SONNET, key_source: client.source },
    request,
  });

  return NextResponse.json({
    summary: parsed.summary,
    keyPoints: parsed.keyPoints,
    cached: false,
    generatedAt: new Date().toISOString(),
  });
}
