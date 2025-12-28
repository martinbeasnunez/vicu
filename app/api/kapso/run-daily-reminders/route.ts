/**
 * POST /api/kapso/run-daily-reminders
 *
 * Improved WhatsApp reminder system that covers ALL active experiments.
 * Sends 4 different types of reminders throughout the day.
 *
 * CRON CONFIGURATION (vercel.json):
 * - 08:00 Lima (13:00 UTC) → MORNING_KICKOFF - Resumen del día
 * - 12:00 Lima (17:00 UTC) → MIDDAY_NUDGE - Recordatorio si no has avanzado
 * - 17:00 Lima (22:00 UTC) → AFTERNOON_PUSH - Último empujón del día
 * - 21:00 Lima (02:00 UTC+1) → NIGHT_RECAP - Resumen de lo logrado
 *
 * Use ?slot=MORNING_KICKOFF to force a specific slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage, isKapsoConfigured, WhatsAppConfig } from "@/lib/kapso";

// =============================================================================
// Types
// =============================================================================

type SlotType = "MORNING_KICKOFF" | "MIDDAY_NUDGE" | "AFTERNOON_PUSH" | "NIGHT_RECAP";

interface ActiveExperiment {
  id: string;
  title: string;
  status: string;
  pending_steps: number;
  done_today: number;
}

interface DailyStats {
  total_active: number;
  experiments: ActiveExperiment[];
  total_pending_steps: number;
  total_done_today: number;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_USER_ID = "demo-user";

// Lima is UTC-5
const SLOT_SCHEDULE: Record<SlotType, [number, number]> = {
  MORNING_KICKOFF: [8, 0],
  MIDDAY_NUDGE: [12, 0],
  AFTERNOON_PUSH: [17, 0],
  NIGHT_RECAP: [21, 0],
};

// =============================================================================
// Helpers
// =============================================================================

function getCurrentSlot(): SlotType | null {
  const now = new Date();
  const limaOffset = -5 * 60;
  const limaTime = new Date(now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000);
  const currentHour = limaTime.getHours();
  const currentMinute = limaTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  let matchedSlot: SlotType | null = null;
  let matchedTime = -1;

  for (const [slot, [hour, minute]] of Object.entries(SLOT_SCHEDULE)) {
    const slotTimeMinutes = hour * 60 + minute;
    if (slotTimeMinutes <= currentTimeMinutes && slotTimeMinutes > matchedTime) {
      matchedSlot = slot as SlotType;
      matchedTime = slotTimeMinutes;
    }
  }

  return matchedSlot;
}

async function getDailyStats(): Promise<DailyStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Get all active experiments
  const { data: experiments } = await supabaseServer
    .from("experiments")
    .select("id, title, status")
    .is("deleted_at", null)
    .in("status", ["queued", "building", "testing", "adjusting"])
    .order("created_at", { ascending: false });

  if (!experiments || experiments.length === 0) {
    return { total_active: 0, experiments: [], total_pending_steps: 0, total_done_today: 0 };
  }

  const experimentIds = experiments.map(e => e.id);

  // Get pending steps count per experiment
  const { data: pendingSteps } = await supabaseServer
    .from("experiment_checkins")
    .select("experiment_id")
    .in("experiment_id", experimentIds)
    .eq("status", "pending");

  // Get done today per experiment
  const { data: doneToday } = await supabaseServer
    .from("experiment_checkins")
    .select("experiment_id")
    .in("experiment_id", experimentIds)
    .eq("status", "done")
    .gte("created_at", todayStr);

  // Count per experiment
  const pendingByExp: Record<string, number> = {};
  const doneByExp: Record<string, number> = {};

  pendingSteps?.forEach(s => {
    pendingByExp[s.experiment_id] = (pendingByExp[s.experiment_id] || 0) + 1;
  });

  doneToday?.forEach(s => {
    doneByExp[s.experiment_id] = (doneByExp[s.experiment_id] || 0) + 1;
  });

  const enrichedExperiments: ActiveExperiment[] = experiments.map(exp => ({
    id: exp.id,
    title: exp.title,
    status: exp.status,
    pending_steps: pendingByExp[exp.id] || 0,
    done_today: doneByExp[exp.id] || 0,
  }));

  return {
    total_active: experiments.length,
    experiments: enrichedExperiments,
    total_pending_steps: pendingSteps?.length || 0,
    total_done_today: doneToday?.length || 0,
  };
}

async function wasSlotSentToday(slot: SlotType): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await supabaseServer
    .from("whatsapp_reminders")
    .select("id")
    .eq("user_id", DEFAULT_USER_ID)
    .eq("slot_type", slot)
    .gte("sent_at", today.toISOString())
    .limit(1);

  return !!(data && data.length > 0);
}

// =============================================================================
// Message Builders
// =============================================================================

function buildMorningKickoff(stats: DailyStats): string {
  if (stats.total_active === 0) {
    return `☀️ *Buenos días*

No tienes objetivos activos.

¿Quieres empezar uno nuevo? Entra a Vicu y cuéntame qué quieres lograr.`;
  }

  const experimentList = stats.experiments
    .slice(0, 5) // Max 5 experiments
    .map((exp, i) => {
      const emoji = exp.pending_steps > 0 ? "📌" : "✅";
      return `${emoji} ${exp.title}${exp.pending_steps > 0 ? ` (${exp.pending_steps} pasos)` : ""}`;
    })
    .join("\n");

  return `☀️ *Buenos días*

Tienes ${stats.total_active} objetivo${stats.total_active > 1 ? "s" : ""} activo${stats.total_active > 1 ? "s" : ""}:

${experimentList}

${stats.total_pending_steps > 0 ? `Total: ${stats.total_pending_steps} pasos pendientes.` : "¡Todo al día!"}

Responde:
1️⃣ Ver mi primer paso
2️⃣ Hoy no puedo`;
}

function buildMiddayNudge(stats: DailyStats): string {
  const noProgress = stats.experiments.filter(e => e.done_today === 0);

  if (noProgress.length === 0) {
    return `💪 *¡Vas muy bien!*

Ya avanzaste en todos tus objetivos hoy.

Sigue así 🔥`;
  }

  if (noProgress.length === 1) {
    const exp = noProgress[0];
    return `⏰ *Recordatorio de mediodía*

Aún no avanzas en *${exp.title}*.

${exp.pending_steps > 0 ? `Tienes ${exp.pending_steps} paso${exp.pending_steps > 1 ? "s" : ""} pendiente${exp.pending_steps > 1 ? "s" : ""}.` : ""}

Responde:
1️⃣ Lo hago ahora
2️⃣ Más tarde
3️⃣ Hoy no puedo`;
  }

  const list = noProgress
    .slice(0, 3)
    .map(exp => `• ${exp.title}`)
    .join("\n");

  return `⏰ *Recordatorio de mediodía*

Objetivos sin avance hoy:
${list}

Responde:
1️⃣ Elijo uno para avanzar
2️⃣ Más tarde
3️⃣ Hoy no puedo`;
}

function buildAfternoonPush(stats: DailyStats): string {
  const noProgress = stats.experiments.filter(e => e.done_today === 0);

  if (noProgress.length === 0) {
    return `🌅 *Último check del día*

¡Excelente! Avanzaste en todos tus objetivos.

Descansa tranquilo 😌`;
  }

  // Pick the most "urgent" one (most pending steps)
  const mostUrgent = noProgress.sort((a, b) => b.pending_steps - a.pending_steps)[0];

  return `🌅 *Último empujón del día*

*${mostUrgent.title}* sigue sin avance.

¿5 minutos para un micro-paso?

Responde:
1️⃣ Sí, lo hago
2️⃣ Mañana será`;
}

function buildNightRecap(stats: DailyStats): string {
  const withProgress = stats.experiments.filter(e => e.done_today > 0);
  const withoutProgress = stats.experiments.filter(e => e.done_today === 0);

  if (stats.total_done_today === 0) {
    return `🌙 *Resumen del día*

Hoy no registraste avances.

No pasa nada - mañana es un nuevo día.

Responde:
1️⃣ Mañana arranco temprano
2️⃣ Necesito replantear mis objetivos`;
  }

  const progressList = withProgress
    .map(exp => `✅ ${exp.title} (${exp.done_today} avance${exp.done_today > 1 ? "s" : ""})`)
    .join("\n");

  let message = `🌙 *Resumen del día*

Avanzaste en ${withProgress.length} objetivo${withProgress.length > 1 ? "s" : ""}:
${progressList}

Total: ${stats.total_done_today} paso${stats.total_done_today > 1 ? "s" : ""} completado${stats.total_done_today > 1 ? "s" : ""} 🎉`;

  if (withoutProgress.length > 0) {
    message += `

Sin avance:
${withoutProgress.map(e => `• ${e.title}`).join("\n")}`;
  }

  message += `

Responde:
1️⃣ Bien
2️⃣ Podría ser mejor`;

  return message;
}

// =============================================================================
// Main Handler
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    if (!isKapsoConfigured()) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: "KAPSO_API_KEY not configured",
      });
    }

    // Determine slot
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

    console.log(`[Daily Reminders] Processing slot: ${slot}`);

    // Check if slot already sent
    if (!forcedSlot) {
      const alreadySent = await wasSlotSentToday(slot);
      if (alreadySent) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Slot ${slot} already sent today`,
        });
      }
    }

    // Get WhatsApp config
    const { data: config, error: configError } = await supabaseServer
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json({
        success: false,
        error: "No active WhatsApp configuration found",
      }, { status: 404 });
    }

    const whatsappConfig = config as WhatsAppConfig;

    // Get stats
    const stats = await getDailyStats();

    // Build message based on slot
    let message: string;
    switch (slot) {
      case "MORNING_KICKOFF":
        message = buildMorningKickoff(stats);
        break;
      case "MIDDAY_NUDGE":
        message = buildMiddayNudge(stats);
        break;
      case "AFTERNOON_PUSH":
        message = buildAfternoonPush(stats);
        break;
      case "NIGHT_RECAP":
        message = buildNightRecap(stats);
        break;
    }

    // Send message
    const sendResult = await sendWhatsAppMessage(whatsappConfig.phone_number, message);

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error,
      }, { status: 500 });
    }

    // Record the reminder
    await supabaseServer
      .from("whatsapp_reminders")
      .insert({
        user_id: DEFAULT_USER_ID,
        experiment_id: stats.experiments[0]?.id || null,
        message_content: message,
        status: "sent",
        kapso_message_id: sendResult.messageId,
        slot_type: slot,
      });

    return NextResponse.json({
      success: true,
      slot,
      message_id: sendResult.messageId,
      stats: {
        total_active: stats.total_active,
        total_pending_steps: stats.total_pending_steps,
        total_done_today: stats.total_done_today,
      },
    });
  } catch (error) {
    console.error("[Daily Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const currentSlot = getCurrentSlot();
  const stats = await getDailyStats();

  const now = new Date();
  const limaOffset = -5 * 60;
  const limaTime = new Date(now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000);

  return NextResponse.json({
    current_slot: currentSlot,
    lima_time: limaTime.toISOString(),
    schedule: SLOT_SCHEDULE,
    stats,
    hint: "POST to send reminder. Use ?slot=MORNING_KICKOFF to force.",
  });
}
