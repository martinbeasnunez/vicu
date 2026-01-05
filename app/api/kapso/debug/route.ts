import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Debug endpoint to see exactly what Kapso sends
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const headers: Record<string, string> = {};

    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Log to Supabase for persistence (ignore errors if table doesn't exist)
    try {
      await supabaseServer
        .from("debug_logs")
        .insert({
          endpoint: "/api/kapso/debug",
          headers: JSON.stringify(headers),
          body: rawBody,
          created_at: new Date().toISOString(),
        });
    } catch {
      // Table might not exist, ignore
    }

    console.log("[DEBUG] Headers:", JSON.stringify(headers, null, 2));
    console.log("[DEBUG] Body:", rawBody);

    return NextResponse.json({
      received: true,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 500),
      headers
    });
  } catch (error) {
    console.error("[DEBUG] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Debug endpoint active",
    hint: "POST to see what data is received"
  });
}
