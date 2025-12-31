import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Get authenticated user ID from the request
// Returns null if not authenticated
export async function getAuthUserId(): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AUTH] Missing Supabase credentials");
      return null;
    }

    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In route handlers, we can set cookies
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // This can fail in middleware/server components
          }
        },
      },
    });

    // Try to get the user
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error("[AUTH] Error getting user:", error.message);
      return null;
    }

    return user?.id ?? null;
  } catch (err) {
    console.error("[AUTH] Exception getting user:", err);
    return null;
  }
}

// Get user ID or fallback to demo-user for backwards compatibility
export async function getAuthUserIdOrDemo(): Promise<string> {
  const userId = await getAuthUserId();
  return userId ?? "demo-user";
}
