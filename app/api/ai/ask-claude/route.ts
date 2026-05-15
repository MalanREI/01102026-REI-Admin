import { supabaseServer } from '@/src/lib/supabase/server';
import { supabaseAdmin } from '@/src/lib/supabase/admin';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/src/lib/ai/anthropic-client';
import { logAuditEvent } from '@/src/lib/audit/log';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RequestBody = {
  threadId?: string;
  contextType: 'email' | 'conversation' | 'sender' | 'search' | 'project';
  contextId?: string;
  question: string;
  contextText: string;
};

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: RequestBody;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  if (!body.question || !body.contextText || !body.contextType) {
    return new Response(JSON.stringify({ error: 'question, contextText, contextType required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let clientResult;
  try { clientResult = await getAnthropicClient(); }
  catch { return new Response(JSON.stringify({ error: 'no_anthropic_key' }), { status: 503, headers: { 'Content-Type': 'application/json' } }); }

  const admin = supabaseAdmin();
  let threadId = body.threadId;
  if (!threadId) {
    const { data: newThread } = await admin.from('ai_threads').insert({
      user_id: user.id,
      context_type: body.contextType,
      context_id: body.contextId,
      title: body.question.slice(0, 100),
    }).select('id').single();
    if (!newThread) return new Response(JSON.stringify({ error: 'Failed to create thread' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    threadId = newThread.id;
  }

  const { data: existingMessages } = await admin.from('ai_thread_messages').select('role, content').eq('thread_id', threadId).order('created_at', { ascending: true });
  await admin.from('ai_thread_messages').insert({ thread_id: threadId, role: 'user', content: body.question });

  const systemPrompt = `You are an AI assistant helping a busy professional analyze their email and work.

Context:
---
${body.contextText.slice(0, 20000)}
---

Answer directly and concisely. Cite people, dates, and facts from the context. If the context doesn't answer the question, say so.`;

  const messages = [
    ...(existingMessages ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: body.question },
  ];

  let accumulatedText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thread', threadId })}\n\n`));

        const anthropicStream = clientResult.client.messages.stream({
          model: ANTHROPIC_MODELS.SONNET,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        });

        anthropicStream.on('text', (text) => {
          accumulatedText += text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`));
        });

        const finalMessage = await anthropicStream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;

        await admin.from('ai_thread_messages').insert({
          thread_id: threadId,
          role: 'assistant',
          content: accumulatedText,
          model: ANTHROPIC_MODELS.SONNET,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        });

        await admin.from('ai_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);

        await logAuditEvent({
          userId: user.id,
          action: 'ai.ask_claude',
          resourceType: 'ai_thread',
          resourceId: threadId,
          metadata: { model: ANTHROPIC_MODELS.SONNET, input_tokens: inputTokens, output_tokens: outputTokens },
          request,
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
