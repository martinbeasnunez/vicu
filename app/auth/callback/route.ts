import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error_param = requestUrl.searchParams.get("error");
  const error_description = requestUrl.searchParams.get("error_description");

  console.log("[AUTH CALLBACK] Request URL:", request.url);
  console.log("[AUTH CALLBACK] Code:", code ? "present" : "missing");

  // Handle error from Supabase (e.g., expired link)
  if (error_param) {
    console.error("[AUTH CALLBACK] Error from Supabase:", error_param, error_description);
    const errorMessage = error_description || error_param;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }

  if (!code) {
    console.error("[AUTH CALLBACK] No code provided");
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[AUTH CALLBACK] Error exchanging code:", error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  console.log("[AUTH CALLBACK] Success! User:", data.user?.email);

  // Redirect to the main app
  return NextResponse.redirect(new URL("/hoy", request.url));
}
