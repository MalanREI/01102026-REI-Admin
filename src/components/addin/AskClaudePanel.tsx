'use client';
import { useEffect, useRef, useState } from 'react';
import { useOfficeItem } from './OfficeItemContext';
import { resolveAccountByOutlookEmail } from '@/src/lib/addin/account-resolution';
import { getConversationByThreadId } from '@/src/lib/supabase/workspace-queries';

type Message = { role: 'user' | 'assistant'; content: string };

export default function AskClaudePanel() {
  const { message, userEmail, refreshNonce } = useOfficeItem();
  const conversationId = message.conversationId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accumRef = useRef('');

  useEffect(() => {
    setMessages([]);
    setThreadId(null);
    setError(null);
  }, [conversationId, refreshNonce]);

  const ask = async () => {
    if (!input.trim() || !userEmail || !conversationId) return;
    const question = input.trim();
    setInput('');
    setError(null);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    try {
      const account = await resolveAccountByOutlookEmail(userEmail);
      if (!account) throw new Error('Workspace account not found');
      const result = await getConversationByThreadId(account.id, conversationId);
      if (!result) throw new Error('Thread not synced yet');

      const contextText = result.emails
        .map((e) => [
          `From: ${e.from_name ?? e.from_address ?? '(unknown)'}`,
          `Date: ${e.received_at ?? e.sent_at}`,
          `Subject: ${e.subject ?? '(no subject)'}`,
          '', e.body_text ?? e.snippet ?? '(no body)',
        ].join('\n')).join('\n\n---\n\n');

      const res = await fetch('/api/ai/ask-claude', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, contextType: 'conversation', contextId: result.conversation.id, question, contextText }),
      });

      if (!res.ok) {
        if (res.status === 503) throw new Error('No Anthropic key. Configure one in Settings.');
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error ?? `${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');
      const decoder = new TextDecoder();
      let buffer = '';

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
      accumRef.current = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === 'thread' && !threadId) setThreadId(payload.threadId);
            else if (payload.type === 'text') {
              accumRef.current += payload.text;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: accumRef.current };
                return copy;
              });
            } else if (payload.type === 'error') throw new Error(payload.error);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
    }
  };

  if (!conversationId) return <p className="text-xs text-gray-500">Open an email to ask Claude about it.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-gray-500">Ask Claude about this thread</p>
      {messages.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {messages.map((m, i) => (
            <div key={i} className={`text-xs ${m.role === 'user' ? 'text-gray-900 font-medium' : 'text-gray-700'}`}>
              <span className="text-gray-400 mr-1">{m.role === 'user' ? 'You:' : 'Claude:'}</span>
              {m.content}
              {streaming && i === messages.length - 1 && m.role === 'assistant' && (
                <span className="inline-block w-2 h-3 ml-1 bg-gray-400 animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className="flex gap-1">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="What does this person need?"
          disabled={streaming} className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100" />
        <button type="submit" disabled={streaming || !input.trim()} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">Ask</button>
      </form>
    </div>
  );
}
