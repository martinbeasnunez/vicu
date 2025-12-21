import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client for API routes
// This uses the service role key for full access, or anon key for public access

let _supabaseServer: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (_supabaseServer) return _supabaseServer;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }

  _supabaseServer = createClient(url, key);
  return _supabaseServer;
}

// Export a proxy for lazy initialization (prevents build-time errors)
export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseServer();
    const value = (client as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
