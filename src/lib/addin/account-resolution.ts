'use client';

import { supabaseBrowser } from '@/src/lib/supabase/browser';

export type ResolvedAccount = {
  id: string;
  emailAddress: string;
  displayName: string | null;
  isActive: boolean;
};

/**
 * Phase 7: map an Outlook mailbox email address (from Office.js) to the
 * corresponding Supabase connected_accounts row for the signed-in user.
 *
 * Returns null if no matching connected account exists.
 */
export async function resolveAccountByOutlookEmail(
  outlookEmail: string,
): Promise<ResolvedAccount | null> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('id, email_address, display_name, is_active')
    .ilike('email_address', outlookEmail.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    emailAddress: data.email_address,
    displayName: data.display_name,
    isActive: data.is_active,
  };
}
