import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/kapso";

// Lazy initialization
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

/**
 * Extract phone number and message from any Kapso payload format
 * Kapso v2 uses: { event: "whatsapp.message.received", data: { message: { from, text: { body } } } }
 */
function extractMessageFromPayload(payload: unknown): { from: string; text: string } | null {
  if (!payload || typeof payload !== "object") return null;

  const p = payload as Record<string, unknown>;

  // Try multiple formats that Kapso might use

  // Format 1: Kapso v2 event format (most likely)
  // { event: "whatsapp.message.received", data: { message: { from, text: { body } }, contact: { wa_id } } }
  if (p.event && p.data) {
    const data = p.data as Record<string, unknown>;

    // Kapso v2: data.message contains the actual message
    if (data.message) {
      const msg = data.message as Record<string, unknown>;
      const from = (msg.from as string) || (data.contact as { wa_id?: string })?.wa_id || "";
      const text = (msg.text as { body?: string })?.body || (msg.body as string) || "";
      if (from && text) {
        console.log("[Webhook] Extracted from Kapso v2 message format");
        return { from, text };
      }
    }

    // Kapso v2 alternative: data directly has from/body
    const from = (data.from as string) || (data.contact as { wa_id?: string })?.wa_id || "";
    const text = (data.body as string) || (data.text as string) ||
                 (data.text as { body?: string })?.body || "";
    if (from && text) {
      console.log("[Webhook] Extracted from Kapso v2 direct format");
      return { from, text };
    }
  }

  // Format 2: Meta/WhatsApp standard format (Cloud API passthrough)
  // { entry: [{ changes: [{ value: { messages: [{ from, text: { body } }] } }] }] }
  try {
    const entry = (p.entry as Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; text?: { body?: string } }> } }> }>)?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (message?.from && message?.text?.body) {
      console.log("[Webhook] Extracted from Meta format");
      return { from: message.from, text: message.text.body };
    }
  } catch { /* ignore */ }

  // Format 3: Direct message format
  // { from: "123", text: { body: "hello" } } or { from: "123", body: "hello" }
  if (p.from) {
    const from = p.from as string;
    const text = (p.text as { body?: string })?.body || (p.body as string) || "";
    if (from && text) {
      console.log("[Webhook] Extracted from direct format");
      return { from, text };
    }
  }

  // Format 4: Message wrapper
  // { message: { from: "123", text: { body: "hello" } } }
  if (p.message) {
    const msg = p.message as Record<string, unknown>;
    const from = msg.from as string || "";
    const text = (msg.text as { body?: string })?.body || (msg.body as string) || "";
    if (from && text) {
      console.log("[Webhook] Extracted from message wrapper format");
      return { from, text };
    }
  }

  console.log("[Webhook] Could not extract message, payload keys:", Object.keys(p));
  return null;
}

/**
 * POST /api/kapso/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log("[Webhook] Raw payload:", rawBody.substring(0, 2000));

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[Webhook] Invalid JSON");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Log full payload structure for debugging
    const p = payload as Record<string, unknown>;
    console.log("[Webhook] Payload keys:", Object.keys(p));
    if (p.event) console.log("[Webhook] Event:", p.event);
    if (p.data) console.log("[Webhook] Data keys:", Object.keys(p.data as object));

    // Save to debug_logs for inspection (ignore errors)
    try {
      await getSupabase()
        .from("debug_logs")
        .insert({
          endpoint: "/api/kapso/webhook",
          body: rawBody.substring(0, 5000),
          created_at: new Date().toISOString(),
        });
    } catch { /* ignore if table doesn't exist */ }

    // Extract message from payload
    const message = extractMessageFromPayload(payload);

    if (!message) {
      console.log("[Webhook] No message found in payload, might be status update");
      return NextResponse.json({ success: true, note: "No message to process" });
    }

    console.log(`[Webhook] Message from ${message.from}: ${message.text}`);

    // Clean phone number
    const cleanPhone = message.from.replace(/[\s\-+]/g, "");

    // Find user config
    const { data: config } = await getSupabase()
      .from("whatsapp_config")
      .select("user_id, phone_number")
      .or(`phone_number.eq.${cleanPhone},phone_number.eq.+${cleanPhone},phone_number.ilike.%${cleanPhone.slice(-9)}`)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Check if it's a greeting
    const lowerText = message.text.toLowerCase().trim();
    const isGreeting = lowerText.includes("hola") ||
                       lowerText.includes("activar") ||
                       lowerText === "hi" ||
                       lowerText === "hello";

    if (!config) {
      console.log(`[Webhook] No config for ${cleanPhone}`);

      // Respond to unknown users who say hello
      if (isGreeting) {
        await sendWhatsAppMessage(cleanPhone, `¡Hola! 👋

Para recibir recordatorios, primero activa WhatsApp desde Vicu:

1. Entra a vicu.vercel.app
2. Toca el ícono de WhatsApp
3. Ingresa tu número

¡Te esperamos! 🚀`);
      }
      return NextResponse.json({ success: true });
    }

    // User found - respond to greeting
    if (isGreeting) {
      console.log(`[Webhook] Sending welcome to ${config.phone_number}`);

      const result = await sendWhatsAppMessage(config.phone_number, `¡Hola! 👋 Soy *Vicu*, tu compañero para lograr metas.

✅ *¡Tu WhatsApp está conectado!*

Te enviaré recordatorios para ayudarte a avanzar en tus objetivos.

💡 *Tip:* Responde a mis mensajes para marcar avances.

¡Vamos! 🚀`);

      console.log(`[Webhook] Welcome result:`, result);
      return NextResponse.json({ success: true, sent: result.success });
    }

    // Not a greeting - just acknowledge
    await sendWhatsAppMessage(config.phone_number, "👍 Recibido. Te escribo en el próximo recordatorio.");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json({ success: false, error: String(error) });
  }
}

/**
 * GET /api/kapso/webhook - Verification endpoint
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const verifyToken = process.env.KAPSO_WEBHOOK_VERIFY_TOKEN || "vicu-kapso-webhook";
    if (token === verifyToken) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json({ error: "Invalid verify token" }, { status: 403 });
  }

  return NextResponse.json({
    status: "Webhook endpoint active",
    hint: "POST messages to this endpoint",
  });
}
