/**
 * POST /api/kapso/run-reminders
 *
 * Intensive WhatsApp reminder system for the focus experiment.
 * Sends up to 4 reminders per day based on time slots.
 *
 * CRON CONFIGURATION (Vercel Cron or external):
 * - 08:00 Lima → MORNING_FOCUS
 * - 11:30 Lima → LATE_MORNING_PUSH
 * - 16:30 Lima → AFTERNOON_MICRO
 * - 21:30 Lima → NIGHT_REVIEW
 *
 * Example cron entries (UTC, Lima is UTC-5):
 * - "0 13 * * *"  → 08:00 Lima (MORNING_FOCUS)
 * - "30 16 * * *" → 11:30 Lima (LATE_MORNING_PUSH)
 * - "30 21 * * *" → 16:30 Lima (AFTERNOON_MICRO)
 * - "30 2 * * *"  → 21:30 Lima (NIGHT_REVIEW)
 *
 * Or call with ?slot=MORNING_FOCUS to force a specific slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage, isKapsoConfigured, WhatsAppConfig } from "@/lib/kapso";
import {
  getFocusExperimentForUser,
  getNextStep,
  hasProgressToday,
  daysWithoutProgress,
  wasSlotSentToday,
  FocusExperiment,
  NextStep,
} from "@/lib/focus-helpers";

// =============================================================================
// Configuration
// =============================================================================

function getSupabase() {
  return supabaseServer;
}

// Slot types
type SlotType = "MORNING_FOCUS" | "LATE_MORNING_PUSH" | "AFTERNOON_MICRO" | "NIGHT_REVIEW";

// Hard-coded schedule for Lima timezone (UTC-5)
// Format: [hour, minute]
const SLOT_SCHEDULE: Record<SlotType, [number, number]> = {
  MORNING_FOCUS: [8, 0],
  LATE_MORNING_PUSH: [11, 30],
  AFTERNOON_MICRO: [16, 30],
  NIGHT_REVIEW: [21, 30],
};

// Hard-coded user ID for now (single-user system)
const DEFAULT_USER_ID = "demo-user";

// =============================================================================
// Slot Detection
// =============================================================================

/**
 * Determine which slot should run based on current Lima time.
 * Returns the most recent slot that should have been triggered.
 */
function getCurrentSlot(): SlotType | null {
  // Get current time in Lima (UTC-5)
  const now = new Date();
  const limaOffset = -5 * 60; // -5 hours in minutes
  const limaTime = new Date(now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000);
  const currentHour = limaTime.getHours();
  const currentMinute = limaTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  // Find the most recent slot
  let matchedSlot: SlotType | null = null;
  let matchedTime = -1;

  for (const [slot, [hour, minute]] of Object.entries(SLOT_SCHEDULE)) {
    const slotTimeMinutes = hour * 60 + minute;
    // Check if this slot's time has passed and is the most recent
    if (slotTimeMinutes <= currentTimeMinutes && slotTimeMinutes > matchedTime) {
      matchedSlot = slot as SlotType;
      matchedTime = slotTimeMinutes;
    }
  }

  return matchedSlot;
}

// =============================================================================
// Message Builders
// =============================================================================

interface MessageResult {
  message: string;
  responseOptions: Record<string, string>;
}

function buildMorningFocusMessage(
  experiment: FocusExperiment,
  nextStep: NextStep | null
): MessageResult {
  const stepText = nextStep?.title || "Avanza un paso";
  return {
    message: `🎯 Hoy tu foco es: *${experiment.title}*

Tu siguiente paso mínimo:
📌 ${stepText}

Responde:
1️⃣ Lo haré hoy
2️⃣ Cambiar paso
3️⃣ Pausar objetivo`,
    responseOptions: {
      "1": "commit_today",
      "2": "change_step",
      "3": "pause_objective",
    },
  };
}

function buildLateMorningPushMessage(
  experiment: FocusExperiment,
  nextStep: NextStep | null
): MessageResult {
  return {
    message: `Aún no avanzas en *${experiment.title}* hoy.

${nextStep ? `Tu paso pendiente: ${nextStep.title}` : ""}

Responde:
1️⃣ Necesito un paso más pequeño
2️⃣ Más tarde
3️⃣ Me trabé`,
    responseOptions: {
      "1": "smaller_step",
      "2": "later",
      "3": "stuck",
    },
  };
}

function buildAfternoonMicroMessage(
  experiment: FocusExperiment
): MessageResult {
  // Suggest a micro-step (≤5 min)
  const microSteps = [
    "Abre el documento/app relacionado",
    "Escribe solo 1 oración sobre el tema",
    "Busca 1 recurso que te ayude",
    "Envía 1 mensaje a alguien que pueda ayudarte",
    "Dedica solo 5 minutos al objetivo",
  ];
  const microStep = microSteps[Math.floor(Math.random() * microSteps.length)];

  return {
    message: `Te propongo un paso ridículamente pequeño para *${experiment.title}*:

📌 *${microStep}* (≤ 5 min)

Responde:
1️⃣ Lo hago ahora
2️⃣ Hoy ya fue`,
    responseOptions: {
      "1": "do_now",
      "2": "skip_today",
    },
  };
}

function buildNightReviewMessage(
  experiment: FocusExperiment,
  hadProgress: boolean,
  consecutiveDaysWithout: number
): MessageResult {
  if (hadProgress) {
    return {
      message: `✅ Hoy avanzaste en *${experiment.title}*.

¿Cómo te sientes?
1️⃣ Bien
2️⃣ Cansado
3️⃣ Meh`,
      responseOptions: {
        "1": "feeling_good",
        "2": "feeling_tired",
        "3": "feeling_meh",
      },
    };
  }

  // No progress today
  if (consecutiveDaysWithout >= 3) {
    return {
      message: `Llevas ${consecutiveDaysWithout} días sin avanzar en *${experiment.title}*.

Responde:
1️⃣ Replantear objetivo
2️⃣ Mantenerlo igual
3️⃣ Pausarlo 1 semana`,
      responseOptions: {
        "1": "rethink_objective",
        "2": "keep_same",
        "3": "pause_week",
      },
    };
  }

  return {
    message: `Hoy no moviste *${experiment.title}*.

Responde:
1️⃣ Sigue siendo prioridad
2️⃣ Quizás pausar una semana
3️⃣ No sé`,
    responseOptions: {
      "1": "still_priority",
      "2": "maybe_pause",
      "3": "unsure",
    },
  };
}

// =============================================================================
// Main Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check if Kapso is configured
    if (!isKapsoConfigured()) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: "KAPSO_API_KEY not configured",
      });
    }

    // Determine slot: from query param or auto-detect
    const { searchParams } = new URL(request.url);
    const forcedSlot = searchParams.get("slot") as SlotType | null;
    const slot = forcedSlot || getCurrentSlot();

    if (!slot) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No slot matches current time (before 08:00 Lima)",
      });
    }

    console.log(`[Run Reminders] Processing slot: ${slot}`);

    // Get WhatsApp config for user
    const { data: config, error: configError } = await getSupabase()
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json({
        success: false,
        error: "No WhatsApp configuration found",
      }, { status: 404 });
    }

    const whatsappConfig = config as WhatsAppConfig;

    // Get focus experiment
    const focusExperiment = await getFocusExperimentForUser(DEFAULT_USER_ID);

    if (!focusExperiment) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No active focus experiment",
      });
    }

    // Check if this slot was already sent today
    const alreadySent = await wasSlotSentToday(focusExperiment.id, slot);
    if (alreadySent) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Slot ${slot} already sent today for this experiment`,
      });
    }

    // Get progress info
    const hadProgressToday = await hasProgressToday(focusExperiment.id);
    const daysWithout = await daysWithoutProgress(focusExperiment.id);
    const nextStep = await getNextStep(focusExperiment.id);

    // Determine if we should send based on slot rules
    let shouldSend = false;
    let messageResult: MessageResult | null = null;

    switch (slot) {
      case "MORNING_FOCUS":
        // Always send if there's a focus experiment
        shouldSend = true;
        messageResult = buildMorningFocusMessage(focusExperiment, nextStep);
        break;

      case "LATE_MORNING_PUSH":
        // Only send if NO progress today
        if (!hadProgressToday) {
          shouldSend = true;
          messageResult = buildLateMorningPushMessage(focusExperiment, nextStep);
        }
        break;

      case "AFTERNOON_MICRO":
        // Only send if still NO progress today
        if (!hadProgressToday) {
          shouldSend = true;
          messageResult = buildAfternoonMicroMessage(focusExperiment);
        }
        break;

      case "NIGHT_REVIEW":
        // Always send, but message varies based on progress
        shouldSend = true;
        messageResult = buildNightReviewMessage(focusExperiment, hadProgressToday, daysWithout);
        break;
    }

    if (!shouldSend || !messageResult) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Slot ${slot} conditions not met (user had progress today)`,
        experiment_id: focusExperiment.id,
      });
    }

    // Send the message
    const sendResult = await sendWhatsAppMessage(
      whatsappConfig.phone_number,
      messageResult.message
    );

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error,
      }, { status: 500 });
    }

    // Record the reminder
    const { error: insertError } = await getSupabase()
      .from("whatsapp_reminders")
      .insert({
        user_id: DEFAULT_USER_ID,
        experiment_id: focusExperiment.id,
        message_content: messageResult.message,
        step_title: nextStep?.title,
        step_description: nextStep?.content,
        status: "sent",
        kapso_message_id: sendResult.messageId,
        slot_type: slot,
        response_options: messageResult.responseOptions,
      });

    if (insertError) {
      console.error("[Run Reminders] Failed to record reminder:", insertError);
      // Don't fail - message was sent successfully
    }

    return NextResponse.json({
      success: true,
      slot,
      message_id: sendResult.messageId,
      experiment: {
        id: focusExperiment.id,
        title: focusExperiment.title,
      },
      had_progress_today: hadProgressToday,
      days_without_progress: daysWithout,
    });
  } catch (error) {
    console.error("[Run Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kapso/run-reminders
 *
 * Check status and current slot
 */
export async function GET() {
  const currentSlot = getCurrentSlot();

  // Get Lima time for display
  const now = new Date();
  const limaOffset = -5 * 60;
  const limaTime = new Date(now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000);

  return NextResponse.json({
    current_slot: currentSlot,
    lima_time: limaTime.toISOString(),
    schedule: SLOT_SCHEDULE,
    hint: "POST to this endpoint to send reminders. Use ?slot=MORNING_FOCUS to force a slot.",
  });
}
