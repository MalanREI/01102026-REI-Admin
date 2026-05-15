import 'server-only';
import { createClient } from "@supabase/supabase-js";

function decodeProjectRefFromJwt(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      ref?: unknown;
    };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function extractProjectRefFromUrl(url: string): string | null {
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] ?? null;
}

/**
 * Server-only Supabase client.
 * Requires SUPABASE_SERVICE_ROLE_KEY (DO NOT expose to browser).
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const urlRef = extractProjectRefFromUrl(url);
  const keyRef = decodeProjectRefFromJwt(key);
  if (urlRef && keyRef && urlRef !== keyRef) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY project mismatch. URL is for '${urlRef}', but service role key is for '${keyRef}'.`
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
