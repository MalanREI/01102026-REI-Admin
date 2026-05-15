import { NextResponse } from 'next/server';
import { supabaseServer } from '@/src/lib/supabase/server';
import { encrypt, lastFour } from '@/src/lib/crypto/settings-encryption';
import { logAuditEvent } from '@/src/lib/audit/log';

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('anthropic_api_key_last_four, preferences, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    anthropicApiKeyLastFour: data?.anthropic_api_key_last_four ?? null,
    preferences: data?.preferences ?? {},
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { anthropicApiKey?: string | null; preferences?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
  if (body.anthropicApiKey === null) {
    updates.anthropic_api_key_encrypted = null;
    updates.anthropic_api_key_last_four = null;
  } else if (typeof body.anthropicApiKey === 'string' && body.anthropicApiKey.length > 0) {
    updates.anthropic_api_key_encrypted = encrypt(body.anthropicApiKey);
    updates.anthropic_api_key_last_four = lastFour(body.anthropicApiKey);
  }
  if (body.preferences && typeof body.preferences === 'object') {
    updates.preferences = body.preferences;
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(updates, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAuditEvent({
    userId: user.id,
    action: 'settings.update',
    resourceType: 'user_settings',
    resourceId: user.id,
    metadata: { keys: Object.keys(updates).filter((k) => k !== 'user_id' && k !== 'updated_at') },
    request,
  });

  return NextResponse.json({ ok: true });
}
