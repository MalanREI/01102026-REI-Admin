import 'server-only';
import { supabaseAdmin } from '@/src/lib/supabase/admin';

export type AuditEventInput = {
  userId: string | null;
  organizationId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  request?: Request;
};

function extractClient(request?: Request): { ip: string | null; userAgent: string | null } {
  if (!request) return { ip: null, userAgent: null };
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? null;
  const userAgent = request.headers.get('user-agent');
  return { ip, userAgent };
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  const { ip, userAgent } = extractClient(input.request);
  const admin = supabaseAdmin();
  const { error } = await admin.from('audit_log').insert({
    user_id: input.userId,
    organization_id: input.organizationId ?? null,
    action: input.action,
    resource_type: input.resourceType ?? null,
    resource_id: input.resourceId ?? null,
    metadata: input.metadata ?? {},
    ip_address: ip,
    user_agent: userAgent,
  });
  if (error) {
    console.error('[audit] failed to log event', input.action, error.message);
  }
}
