import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  
  // During build time, these may not be available
  // Return a dummy client that won't be used
  if (!url || !anon) {
    if (typeof window === "undefined") {
      // Server-side during build - return a dummy client
      return createBrowserClient("https://placeholder.supabase.co", "placeholder-key");
    }
    // Client-side - this should have env vars
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  
  return createBrowserClient(url, anon);
}
