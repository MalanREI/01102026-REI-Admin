import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseServer } from '@/src/lib/supabase/server';
import { decrypt } from '@/src/lib/crypto/settings-encryption';

export type AnthropicClientResult = {
  client: Anthropic;
  source: 'user' | 'env';
};

/**
 * Resolves the Anthropic API key for the current authenticated user.
 * Tries (1) the user's encrypted BYO key, (2) ANTHROPIC_API_KEY env var.
 */
export async function getAnthropicClient(): Promise<AnthropicClientResult> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from('user_settings')
      .select('anthropic_api_key_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.anthropic_api_key_encrypted) {
      try {
        const apiKey = decrypt(data.anthropic_api_key_encrypted);
        return { client: new Anthropic({ apiKey }), source: 'user' };
      } catch (e) {
        console.error('Failed to decrypt user Anthropic key, falling back to env:', e);
      }
    }
  }

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) {
    throw new Error('No Anthropic API key available. Configure one in settings or set ANTHROPIC_API_KEY env var.');
  }
  return { client: new Anthropic({ apiKey: envKey }), source: 'env' };
}

/** For cron jobs without user context. Always uses env var. */
export function getAnthropicClientServer(): Anthropic {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) throw new Error('ANTHROPIC_API_KEY env var not set');
  return new Anthropic({ apiKey: envKey });
}

export const ANTHROPIC_MODELS = {
  SONNET: 'claude-sonnet-4-6' as const,
  HAIKU: 'claude-haiku-4-5-20251001' as const,
} as const;
