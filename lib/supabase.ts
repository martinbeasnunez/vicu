"use client";

import { createBrowserClient } from "@supabase/ssr";

// Create a singleton Supabase client for the browser
// Using @supabase/ssr ensures proper handling in Next.js client components
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
