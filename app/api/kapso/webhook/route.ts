import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/kapso";
import {
  getPendingAction,
  processUserResponse,
  buildActionableMessage,
} from "@/lib/whatsapp-actions";

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
 */
function extractMessageFromPayload(payload: unknown): { from: string; text: string } | null {
  if (!payload || typeof payload !== "object") return null;

  const p = payload as Record<string, unknown>;

  // Format 1: Kapso v2 event format
  if (p.event && p.data) {
    const data = p.data as Record<string, unknown>;

    if (data.message) {
      const msg = data.message as Record<string, unknown>;
      const from = (msg.from as string) || (data.contact as { wa_id?: string })?.wa_id || "";
      const text = (msg.text as { body?: string })?.body || (msg.body as string) || "";
      if (from && text) {
        return { from, text };
      }
    }

    const from = (data.from as string) || (data.contact as { wa_id?: string })?.wa_id || "";
    const text = (data.body as string) || (data.text as string) ||
                 (data.text as { body?: string })?.body || "";
    if (from && text) {
      return { from, text };
    }
  }

  // Format 2: Meta/WhatsApp standard format
  try {
    const entry = (p.entry as Array<{ changes?: Array<{ value?: { messages?: Array<{ from?: string; text?: { body?: string } }> } }> }>)?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (message?.from && message?.text?.body) {
      return { from: message.from, text: message.text.body };
    }
  } catch { /* ignore */ }

  // Format 3: Direct message format
  if (p.from) {
    const from = p.from as string;
    const text = (p.text as { body?: string })?.body || (p.body as string) || "";
    if (from && text) {
      return { from, text };
    }
  }

  // Format 4: Message wrapper
  if (p.message) {
    const msg = p.message as Record<string, unknown>;
    const from = msg.from as string || "";
    const text = (msg.text as { body?: string })?.body || (msg.body as string) || "";
    if (from && text) {
      return { from, text };
    }
  }

  return null;
}

/**
 * Parse user response to action (1, 2, 3 or text variants)
 */
function parseActionResponse(text: string): "1" | "2" | "3" | null {
  const trimmed = text.trim().toLowerCase();

  // Direct numbers
  if (trimmed === "1" || trimmed.startsWith("1 ") || trimmed.startsWith("1.")) return "1";
  if (trimmed === "2" || trimmed.startsWith("2 ") || trimmed.startsWith("2.")) return "2";
  if (trimmed === "3" || trimmed.startsWith("3 ") || trimmed.startsWith("3.")) return "3";

  // Text variants for "1" (done)
  if (
    trimmed.includes("listo") ||
    trimmed.includes("hecho") ||
    trimmed.includes("done") ||
    trimmed.includes("si") ||
    trimmed.includes("sí") ||
    trimmed === "ok" ||
    trimmed === "ya"
  ) {
    return "1";
  }

  // Text variants for "2" (later)
  if (
    trimmed.includes("mañana") ||
    trimmed.includes("luego") ||
    trimmed.includes("después") ||
    trimmed.includes("later") ||
    trimmed.includes("no puedo")
  ) {
    return "2";
  }

  // Text variants for "3" (alternative)
  if (
    trimmed.includes("otra") ||
    trimmed.includes("diferente") ||
    trimmed.includes("alternativa") ||
    trimmed.includes("cambiar") ||
    trimmed.includes("dificil") ||
    trimmed.includes("difícil")
  ) {
    return "3";
  }

  return null;
}

/**
 * POST /api/kapso/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log("[Webhook] Raw payload:", rawBody.substring(0, 1000));

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      console.error("[Webhook] Invalid JSON");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Save to debug_logs for inspection
    try {
      await getSupabase()
        .from("debug_logs")
        .insert({
          endpoint: "/api/kapso/webhook",
          body: rawBody.substring(0, 5000),
          created_at: new Date().toISOString(),
        });
    } catch { /* ignore */ }

    // Extract message from payload
    const message = extractMessageFromPayload(payload);

    if (!message) {
      console.log("[Webhook] No message found in payload");
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

    const lowerText = message.text.toLowerCase().trim();
    const isGreeting = lowerText.includes("hola") ||
                       lowerText.includes("activar") ||
                       lowerText === "hi" ||
                       lowerText === "hello";

    // Unknown user
    if (!config) {
      console.log(`[Webhook] No config for ${cleanPhone}`);

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

    const userId = config.user_id;
    const userPhone = config.phone_number;

    // Handle greeting
    if (isGreeting) {
      console.log(`[Webhook] Greeting from ${userPhone}`);

      // Send welcome + first actionable message
      const { message: actionMsg } = await buildActionableMessage(userId);

      await sendWhatsAppMessage(userPhone, `¡Hola! 👋 Soy Vicu.

${actionMsg}`);

      return NextResponse.json({ success: true, action: "greeting_with_task" });
    }

    // Check if user has a pending action
    const pendingAction = await getPendingAction(userId);

    if (pendingAction) {
      // Parse response
      const actionResponse = parseActionResponse(message.text);

      if (actionResponse) {
        console.log(`[Webhook] Processing action response: ${actionResponse}`);

        const result = await processUserResponse(userId, actionResponse, pendingAction);

        await sendWhatsAppMessage(userPhone, result.replyMessage);

        return NextResponse.json({
          success: true,
          action: "response_processed",
          response: actionResponse,
          newStreak: result.newStreak,
        });
      }
    }

    // No pending action or unrecognized response - send new task
    console.log(`[Webhook] No pending action or unrecognized, sending new task`);

    const { message: actionMsg, actionSaved } = await buildActionableMessage(userId);

    if (actionSaved) {
      await sendWhatsAppMessage(userPhone, actionMsg);
      return NextResponse.json({ success: true, action: "new_task_sent" });
    }

    // Fallback
    await sendWhatsAppMessage(userPhone, "👍 Recibido. Te escribo en el próximo recordatorio.");
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
