import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Get authenticated user ID from the request
// Returns null if not authenticated
export async function getAuthUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();

    // Get the auth token from cookies
    // Supabase stores the session in cookies with the project ref
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[AUTH] Missing Supabase credentials");
      return null;
    }

    // Create client with the cookies
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          cookie: cookieStore.toString(),
        },
      },
    });

    // Try to get the session
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
