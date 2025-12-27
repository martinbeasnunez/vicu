import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  verifyWebhookSignature,
  parseUserResponse,
  sendWhatsAppMessage,
  KapsoWebhookPayload,
  UserResponseAction,
} from "@/lib/kapso";

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
 * POST /api/kapso/webhook
 *
 * Receives webhook events from Kapso when users respond to WhatsApp messages.
 * Updates the reminder status and optionally the checkin based on response.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature
    const signature = request.headers.get("x-webhook-signature") || "";
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn("[Kapso Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload: KapsoWebhookPayload = JSON.parse(rawBody);

    // Process each entry
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            await handleIncomingMessage(message, value.metadata.phone_number_id);
          }
        }

        // Handle status updates (delivered, read, etc.)
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }

    // Kapso requires 200 OK within 10 seconds
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Kapso Webhook] Error processing webhook:", error);
    // Still return 200 to prevent retries for parsing errors
    return NextResponse.json({ success: false, error: "Processing error" });
  }
}

/**
 * Handle incoming message from user
 */
async function handleIncomingMessage(
  message: NonNullable<KapsoWebhookPayload["entry"][0]["changes"][0]["value"]["messages"]>[0],
  phoneNumberId: string
) {
  const fromNumber = message.from;
  const messageText = message.text?.body || message.button?.text || "";

  if (!messageText) {
    console.log("[Kapso Webhook] Received non-text message, ignoring");
    return;
  }

  console.log(`[Kapso Webhook] Message from ${fromNumber}: ${messageText}`);

  // Find the most recent pending reminder for this phone number
  // First, get the user by phone number
  const { data: config } = await getSupabase()
    .from("whatsapp_config")
    .select("user_id, phone_number")
    .or(`phone_number.eq.${fromNumber},phone_number.eq.+${fromNumber}`)
    .single();

  if (!config) {
    console.log(`[Kapso Webhook] No config found for phone ${fromNumber}`);
    return;
  }

  // Find the most recent reminder that hasn't been responded to
  const { data: reminder, error: reminderError } = await getSupabase()
    .from("whatsapp_reminders")
    .select("*")
    .eq("user_id", config.user_id)
    .in("status", ["sent", "delivered"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (reminderError || !reminder) {
    console.log(`[Kapso Webhook] No pending reminder found for user ${config.user_id}`);
    return;
  }

  // Parse the response - use contextual options if available
  const trimmedResponse = messageText.trim();
  let contextualAction: string | null = null;

  // Check if reminder has response_options (new intensive system)
  if (reminder.response_options && typeof reminder.response_options === "object") {
    // Try to match the numeric response to the options
    const numericResponse = trimmedResponse.charAt(0);
    if (reminder.response_options[numericResponse]) {
      contextualAction = reminder.response_options[numericResponse];
    }
  }

  // Fall back to legacy parsing if no contextual match
  const { action: legacyAction, rawResponse } = parseUserResponse(messageText);
  const action = contextualAction || legacyAction;

  // Update the reminder with the response
  const { error: updateError } = await getSupabase()
    .from("whatsapp_reminders")
    .update({
      status: "responded",
      user_response: rawResponse,
      response_action: action,
      responded_at: new Date().toISOString(),
    })
    .eq("id", reminder.id);

  if (updateError) {
    console.error("[Kapso Webhook] Failed to update reminder:", updateError);
    return;
  }

  // Handle the action based on slot type
  const confirmationMessage = await handleContextualResponse(
    action,
    reminder.slot_type,
    reminder
  );

  // Send confirmation message
  if (confirmationMessage && config.phone_number) {
    await sendWhatsAppMessage(config.phone_number, confirmationMessage);
  }

  console.log(`[Kapso Webhook] Processed response: ${action} (slot: ${reminder.slot_type}) for reminder ${reminder.id}`);
}

/**
 * Handle contextual response based on slot type and action.
 * Returns the confirmation message to send back to the user.
 */
async function handleContextualResponse(
  action: string,
  slotType: string | null,
  reminder: {
    id: string;
    experiment_id: string;
    checkin_id: string | null;
    step_title: string | null;
    step_description: string | null;
  }
): Promise<string | null> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Map contextual actions to database operations
  switch (action) {
    // === MORNING_FOCUS responses ===
    case "commit_today":
      // User committed to doing it today - create pending checkin
      await getSupabase()
        .from("experiment_checkins")
        .insert({
          experiment_id: reminder.experiment_id,
          status: "pending",
          step_title: reminder.step_title,
          step_description: reminder.step_description,
          source: "whatsapp",
          day_date: today,
        });
      return "💪 ¡Vamos! Te escribo más tarde para ver cómo va.";

    case "change_step":
      return "📝 Entendido. En el próximo recordatorio te sugeriré algo diferente.";

    case "pause_objective":
    case "pause_week":
      // Pause the experiment for 1 week
      const pauseUntil = new Date();
      pauseUntil.setDate(pauseUntil.getDate() + 7);
      await getSupabase()
        .from("experiments")
        .update({
          status: "paused",
          paused_until: pauseUntil.toISOString(),
        })
        .eq("id", reminder.experiment_id);
      return "👌 Pausé este objetivo por 1 semana. Podemos retomarlo cuando quieras.";

    // === LATE_MORNING_PUSH responses ===
    case "smaller_step":
      return "🔬 Ok, en el siguiente mensaje te propongo algo más pequeño.";

    case "later":
      return "👍 Sin problema, te escribo más tarde.";

    case "stuck":
      // Mark user as stuck
      await getSupabase()
        .from("experiment_checkins")
        .insert({
          experiment_id: reminder.experiment_id,
          status: "pending",
          user_state: "stuck",
          step_title: reminder.step_title,
          step_description: reminder.step_description,
          source: "whatsapp",
          day_date: today,
        });
      return "🤔 Entiendo. ¿Qué te tiene trabado? (puedes escribirme libremente)";

    // === AFTERNOON_MICRO responses ===
    case "do_now":
      // Create a done checkin immediately
      await getSupabase()
        .from("experiment_checkins")
        .insert({
          experiment_id: reminder.experiment_id,
          status: "done",
          step_title: "Micro-paso completado",
          source: "whatsapp",
          day_date: today,
        });
      await getSupabase()
        .from("experiments")
        .update({ last_checkin_at: now.toISOString() })
        .eq("id", reminder.experiment_id);
      return "✅ ¡Registrado! Cada pequeño paso cuenta.";

    case "skip_today":
      return "👌 Ok, mañana es otro día. Descansa.";

    // === NIGHT_REVIEW responses ===
    case "feeling_good":
      return "🎉 ¡Genial! Mañana seguimos.";

    case "feeling_tired":
      return "😴 Descansa bien. Mañana con energía.";

    case "feeling_meh":
      return "🙂 Está bien. Lo importante es seguir.";

    case "still_priority":
    case "keep_same":
      return "👊 Perfecto, mañana arrancamos temprano.";

    case "maybe_pause":
    case "unsure":
      return "🤔 Piénsalo esta noche. Mañana decidimos si pausar o ajustar.";

    case "rethink_objective":
      return "📝 Buena idea. Mañana te ayudo a replantear el objetivo.";

    // === Legacy actions (backward compatibility) ===
    case "done":
      if (reminder.checkin_id) {
        await getSupabase()
          .from("experiment_checkins")
          .update({ status: "done", source: "whatsapp" })
          .eq("id", reminder.checkin_id);
      } else {
        await getSupabase()
          .from("experiment_checkins")
          .insert({
            experiment_id: reminder.experiment_id,
            status: "done",
            step_title: reminder.step_title,
            step_description: reminder.step_description,
            source: "whatsapp",
            day_date: today,
          });
      }
      await getSupabase()
        .from("experiments")
        .update({ last_checkin_at: now.toISOString() })
        .eq("id", reminder.experiment_id);
      return "✅ Registrado, ¡bien hecho!";

    default:
      console.log(`[Kapso Webhook] Unknown action: ${action}`);
      return "👍 Recibido.";
  }
}

/**
 * Handle message status updates (delivered, read, etc.)
 */
async function handleStatusUpdate(
  status: NonNullable<KapsoWebhookPayload["entry"][0]["changes"][0]["value"]["statuses"]>[0]
) {
  const messageId = status.id;
  const newStatus = status.status;

  // Update reminder status if we have a matching message ID
  if (newStatus === "delivered") {
    await getSupabase()
      .from("whatsapp_reminders")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("kapso_message_id", messageId)
      .eq("status", "sent"); // Only update if still in "sent" status
  }

  console.log(`[Kapso Webhook] Status update: ${messageId} -> ${newStatus}`);
}

/**
 * GET /api/kapso/webhook
 *
 * Webhook verification endpoint (required by some webhook providers)
 */
export async function GET(request: NextRequest) {
  // Handle webhook verification challenge
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // For Meta/WhatsApp webhook verification
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
