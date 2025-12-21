import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization to avoid build-time errors in Vercel
// The client is created on first use, not at module load time
let _supabase: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      _supabase = createClient(supabaseUrl, supabaseKey);
    }
    return (_supabase as unknown as Record<string, unknown>)[prop as string];
  },
});
