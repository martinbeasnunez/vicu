import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const error_param = requestUrl.searchParams.get("error");
  const error_description = requestUrl.searchParams.get("error_description");

  console.log("[AUTH CALLBACK] Request URL:", request.url);
  console.log("[AUTH CALLBACK] Code:", code ? "present" : "missing");
  console.log("[AUTH CALLBACK] Token hash:", token_hash ? "present" : "missing");
  console.log("[AUTH CALLBACK] Type:", type);

  // Handle error from Supabase (e.g., expired link)
  if (error_param) {
    console.error("[AUTH CALLBACK] Error from Supabase:", error_param, error_description);
    const errorMessage = error_description || error_param;
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMessage)}`, request.url)
    );
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

  // Handle token_hash (from email links without PKCE)
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink" | "signup" | "recovery",
    });

    if (error) {
      console.error("[AUTH CALLBACK] Error verifying token:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    console.log("[AUTH CALLBACK] Token verified! User:", data.user?.email);
    return NextResponse.redirect(new URL("/hoy", request.url));
  }

  // Handle code (from OAuth or PKCE flow)
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[AUTH CALLBACK] Error exchanging code:", error.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
      );
    }

    console.log("[AUTH CALLBACK] Code exchanged! User:", data.user?.email);
    return NextResponse.redirect(new URL("/hoy", request.url));
  }

  // No code or token_hash provided
  console.error("[AUTH CALLBACK] No code or token_hash provided");
  return NextResponse.redirect(new URL("/login?error=no_code", request.url));
}
