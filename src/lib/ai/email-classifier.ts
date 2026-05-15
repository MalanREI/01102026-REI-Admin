import 'server-only';
import { supabaseAdmin } from '@/src/lib/supabase/admin';
import { getAnthropicClientServer, ANTHROPIC_MODELS } from './anthropic-client';

const CONFIDENCE_AUTO_THRESHOLD = 0.7;

type ProjectContext = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  people: string[];
};

async function loadProjectsForUser(userId: string): Promise<ProjectContext[]> {
  const admin = supabaseAdmin();
  const { data: projects } = await admin.from('projects').select('id, name, description').eq('user_id', userId).eq('is_active', true);
  if (!projects || projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const [{ data: keywords }, { data: people }] = await Promise.all([
    admin.from('project_keywords').select('project_id, keyword').in('project_id', projectIds),
    admin.from('project_people').select('project_id, email_address').in('project_id', projectIds),
  ]);

  return projects.map((p) => ({
    id: p.id, name: p.name, description: p.description,
    keywords: (keywords ?? []).filter((k) => k.project_id === p.id).map((k) => k.keyword),
    people: (people ?? []).filter((pp) => pp.project_id === p.id).map((pp) => pp.email_address),
  }));
}

export async function classifyEmail(emailId: string, userId: string) {
  const admin = supabaseAdmin();

  const { data: existing } = await admin.from('email_project_assignments').select('email_id').eq('email_id', emailId).maybeSingle();
  if (existing) return null;

  const { data: email } = await admin.from('emails').select('id, subject, from_name, from_address, body_text, snippet').eq('id', emailId).maybeSingle();
  if (!email) return null;

  const projects = await loadProjectsForUser(userId);
  if (projects.length === 0) return null;

  const projectListText = projects.map((p) =>
    `- "${p.name}" (id: ${p.id})\n  Description: ${p.description ?? '(none)'}\n  Keywords: ${p.keywords.join(', ') || '(none)'}\n  People: ${p.people.join(', ') || '(none)'}`
  ).join('\n\n');

  const emailText = [
    `From: ${email.from_name ?? email.from_address ?? '(unknown)'} <${email.from_address ?? ''}>`,
    `Subject: ${email.subject ?? '(no subject)'}`, '',
    (email.body_text ?? email.snippet ?? '').slice(0, 4000),
  ].join('\n');

  const systemPrompt = `You classify emails into projects. Output JSON:
{"projectId": "<id or null>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}

Projects:
${projectListText}

Be conservative. >0.7 only for clear matches. JSON only.`;

  const client = getAnthropicClientServer();
  let response;
  try {
    response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU, max_tokens: 300, system: systemPrompt,
      messages: [{ role: 'user', content: emailText }],
    });
  } catch (err) {
    console.error('[classifier] Anthropic error:', err);
    return null;
  }

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return null;

  let parsed: { projectId: string | null; confidence: number; reasoning: string };
  try {
    parsed = JSON.parse(textBlock.text.trim().replace(/^```json\n?|\n?```$/g, ''));
  } catch { return null; }

  if (parsed.projectId && parsed.confidence > 0) {
    await admin.from('email_project_assignments').insert({
      email_id: emailId, user_id: userId, project_id: parsed.projectId,
      confidence_score: parsed.confidence, assigned_by: 'ai',
      needs_review: parsed.confidence < CONFIDENCE_AUTO_THRESHOLD,
    });
  }

  return parsed;
}

export async function runClassificationBatch(userId: string, limit = 10) {
  const admin = supabaseAdmin();

  // Find unclassified emails for this user
  const { data: accounts } = await admin.from('connected_accounts').select('id').eq('user_id', userId);
  if (!accounts?.length) return { classified: 0, errors: 0 };

  const accountIds = accounts.map((a) => a.id);
  const { data: assignedIds } = await admin.from('email_project_assignments').select('email_id');
  const assignedSet = new Set((assignedIds ?? []).map((r) => r.email_id));

  const { data: emails } = await admin.from('emails').select('id')
    .in('account_id', accountIds).order('received_at', { ascending: false }).limit(200);

  const candidates = (emails ?? []).filter((e) => !assignedSet.has(e.id)).slice(0, limit);

  let classified = 0;
  let errors = 0;
  for (const email of candidates) {
    try {
      const result = await classifyEmail(email.id, userId);
      if (result) classified++;
    } catch { errors++; }
  }
  return { classified, errors };
}
