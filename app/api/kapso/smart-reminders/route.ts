/**
 * POST /api/kapso/smart-reminders
 *
 * Sistema inteligente de recordatorios WhatsApp para Vicu.
 * Rota entre los objetivos más importantes del usuario.
 *
 * HORARIOS (Lima UTC-5):
 * - 08:00 → MORNING_SUMMARY - Resumen de todos los objetivos
 * - 11:00 → PUSH_1 - Objetivo más urgente
 * - 14:00 → PUSH_2 - Segundo objetivo (o seguimiento del primero)
 * - 17:00 → PUSH_3 - Tercer objetivo o micro-paso
 * - 21:00 → NIGHT_RECAP - Resumen del día + plan mañana
 *
 * Usa ?slot=MORNING_SUMMARY para forzar un slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage, isKapsoConfigured, WhatsAppConfig } from "@/lib/kapso";

// =============================================================================
// Types
// =============================================================================

type SlotType = "MORNING_SUMMARY" | "PUSH_1" | "PUSH_2" | "PUSH_3" | "NIGHT_RECAP";

interface ObjectiveWithContext {
  id: string;
  title: string;
  status: string;
  created_at: string;
  deadline: string | null;
  streak_days: number;
  last_checkin_at: string | null;
  // Computed
  days_without_progress: number;
  urgency_score: number;
  pending_steps: PendingStep[];
  done_today: number;
}

interface PendingStep {
  id: string;
  step_title: string;
  step_description: string | null;
  effort: string | null;
}

interface DayContext {
  objectives: ObjectiveWithContext[];
  total_done_today: number;
  already_pushed_today: string[]; // IDs de objetivos ya empujados hoy
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_USER_ID = "demo-user";

const SLOT_SCHEDULE: Record<SlotType, [number, number]> = {
  MORNING_SUMMARY: [8, 0],
  PUSH_1: [11, 0],
  PUSH_2: [14, 0],
  PUSH_3: [17, 0],
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

function calculateDaysWithoutProgress(lastCheckinAt: string | null): number {
  if (!lastCheckinAt) return 0; // Nuevo objetivo, no "999 días"

  const lastDate = new Date(lastCheckinAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

function calculateUrgencyScore(obj: {
  deadline: string | null;
  days_without_progress: number;
  streak_days: number;
  done_today: number;
}): number {
  let score = 0;

  // Deadline cercano = muy urgente
  if (obj.deadline) {
    const daysUntilDeadline = Math.floor(
      (new Date(obj.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDeadline <= 3) score += 50;
    else if (daysUntilDeadline <= 7) score += 30;
    else if (daysUntilDeadline <= 14) score += 15;
  }

  // Días sin avance = necesita atención
  if (obj.days_without_progress >= 7) score += 40;
  else if (obj.days_without_progress >= 3) score += 25;
  else if (obj.days_without_progress >= 1) score += 10;

  // Racha activa = no perderla
  if (obj.streak_days >= 7) score += 20;
  else if (obj.streak_days >= 3) score += 10;

  // Ya avanzó hoy = menos urgente
  if (obj.done_today > 0) score -= 30;

  return score;
}

async function getDayContext(): Promise<DayContext> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  // Get active objectives
  const { data: experiments } = await supabaseServer
    .from("experiments")
    .select("id, title, status, created_at, deadline, streak_days, last_checkin_at")
    .is("deleted_at", null)
    .in("status", ["queued", "building", "testing", "adjusting"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!experiments || experiments.length === 0) {
    return { objectives: [], total_done_today: 0, already_pushed_today: [] };
  }

  const experimentIds = experiments.map(e => e.id);

  // Get pending steps for each objective
  const { data: pendingSteps } = await supabaseServer
    .from("experiment_checkins")
    .select("id, experiment_id, step_title, step_description, effort")
    .in("experiment_id", experimentIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Get done today
  const { data: doneToday } = await supabaseServer
    .from("experiment_checkins")
    .select("experiment_id")
    .in("experiment_id", experimentIds)
    .eq("status", "done")
    .gte("created_at", todayStr);

  // Get already pushed objectives today
  const { data: todayReminders } = await supabaseServer
    .from("whatsapp_reminders")
    .select("experiment_id, slot_type")
    .eq("user_id", DEFAULT_USER_ID)
    .gte("sent_at", todayStr)
    .in("slot_type", ["PUSH_1", "PUSH_2", "PUSH_3"]);

  // Group data
  const stepsByExp: Record<string, PendingStep[]> = {};
  const doneByExp: Record<string, number> = {};

  pendingSteps?.forEach(s => {
    if (!stepsByExp[s.experiment_id]) stepsByExp[s.experiment_id] = [];
    stepsByExp[s.experiment_id].push({
      id: s.id,
      step_title: s.step_title || "Avanzar en el objetivo",
      step_description: s.step_description,
      effort: s.effort,
    });
  });

  doneToday?.forEach(s => {
    doneByExp[s.experiment_id] = (doneByExp[s.experiment_id] || 0) + 1;
  });

  const alreadyPushed = new Set(
    todayReminders?.map(r => r.experiment_id).filter(Boolean) || []
  );

  // Build objectives with context
  const objectives: ObjectiveWithContext[] = experiments.map(exp => {
    const daysWithout = calculateDaysWithoutProgress(exp.last_checkin_at);
    const doneCount = doneByExp[exp.id] || 0;

    const obj: ObjectiveWithContext = {
      id: exp.id,
      title: exp.title,
      status: exp.status,
      created_at: exp.created_at,
      deadline: exp.deadline,
      streak_days: exp.streak_days || 0,
      last_checkin_at: exp.last_checkin_at,
      days_without_progress: daysWithout,
      urgency_score: 0,
      pending_steps: stepsByExp[exp.id] || [],
      done_today: doneCount,
    };

    obj.urgency_score = calculateUrgencyScore(obj);
    return obj;
  });

  // Sort by urgency
  objectives.sort((a, b) => b.urgency_score - a.urgency_score);

  return {
    objectives,
    total_done_today: doneToday?.length || 0,
    already_pushed_today: Array.from(alreadyPushed),
  };
}

// =============================================================================
// Message Builders
// =============================================================================

function buildMorningSummary(ctx: DayContext): { message: string; targetExp: string | null } {
  if (ctx.objectives.length === 0) {
    return {
      message: `☀️ *Buenos días*

No tienes objetivos activos en Vicu.

Entra a la app y cuéntame qué quieres lograr.`,
      targetExp: null,
    };
  }

  const top5 = ctx.objectives.slice(0, 5);
  const list = top5.map((obj, i) => {
    const emoji = obj.done_today > 0 ? "✅" : obj.days_without_progress >= 3 ? "⚠️" : "📌";
    const steps = obj.pending_steps.length > 0 ? ` (${obj.pending_steps.length} pasos)` : "";
    const streak = obj.streak_days >= 3 ? ` 🔥${obj.streak_days}` : "";
    return `${emoji} ${obj.title}${steps}${streak}`;
  }).join("\n");

  const totalPending = ctx.objectives.reduce((sum, o) => sum + o.pending_steps.length, 0);
  const needsAttention = ctx.objectives.filter(o => o.days_without_progress >= 3).length;

  let footer = "";
  if (needsAttention > 0) {
    footer = `\n⚠️ ${needsAttention} objetivo${needsAttention > 1 ? "s" : ""} necesita${needsAttention > 1 ? "n" : ""} atención`;
  }

  return {
    message: `☀️ *Buenos días*

Tus objetivos activos:

${list}
${footer}
${totalPending > 0 ? `\nTotal: ${totalPending} pasos pendientes` : ""}

Responde:
1️⃣ Empezar con el más urgente
2️⃣ Ver todos mis pasos
3️⃣ Hoy descanso`,
    targetExp: top5[0]?.id || null,
  };
}

function buildPushMessage(ctx: DayContext, pushNumber: 1 | 2 | 3): { message: string; targetExp: string | null } {
  // Filter objectives not yet pushed today (for rotation)
  const notPushedYet = ctx.objectives.filter(
    o => !ctx.already_pushed_today.includes(o.id) && o.done_today === 0
  );

  // If all were pushed, use the most urgent without progress today
  const candidates = notPushedYet.length > 0
    ? notPushedYet
    : ctx.objectives.filter(o => o.done_today === 0);

  if (candidates.length === 0) {
    // All objectives have progress today!
    return {
      message: `💪 *¡Vas increíble!*

Ya avanzaste en todos tus objetivos hoy.

Sigue así 🔥`,
      targetExp: null,
    };
  }

  const target = candidates[0];
  const step = target.pending_steps[0];

  // Build contextual message based on push number and objective state
  let intro = "";
  if (pushNumber === 1) {
    if (target.days_without_progress >= 3) {
      intro = `⚠️ *${target.title}* lleva ${target.days_without_progress} días sin avance.`;
    } else if (target.streak_days >= 3) {
      intro = `🔥 *${target.title}* - Racha de ${target.streak_days} días. ¡No la pierdas!`;
    } else {
      intro = `📌 *${target.title}*`;
    }
  } else if (pushNumber === 2) {
    intro = `🔄 Segundo objetivo del día: *${target.title}*`;
  } else {
    intro = `🌅 Último push: *${target.title}*`;
  }

  const stepText = step
    ? `\nTu siguiente paso:\n➡️ *${step.step_title}*${step.effort ? ` (${step.effort === "muy_pequeno" ? "~5min" : step.effort === "pequeno" ? "~20min" : "~1hr"})` : ""}`
    : "\nAvanza un paso pequeño.";

  return {
    message: `${intro}
${stepText}

Responde:
1️⃣ ✅ Listo, lo hice
2️⃣ 🔄 Dame otro paso
3️⃣ ⏰ Más tarde
4️⃣ ➡️ Siguiente objetivo`,
    targetExp: target.id,
  };
}

function buildNightRecap(ctx: DayContext): { message: string; targetExp: string | null } {
  const withProgress = ctx.objectives.filter(o => o.done_today > 0);
  const withoutProgress = ctx.objectives.filter(o => o.done_today === 0);

  if (ctx.total_done_today === 0) {
    const mostUrgent = ctx.objectives[0];
    return {
      message: `🌙 *Resumen del día*

Hoy no registraste avances.

${mostUrgent ? `Mañana empezamos con *${mostUrgent.title}*` : ""}

No pasa nada - mañana es un nuevo día 💪

Responde:
1️⃣ Mañana sí arranco
2️⃣ Necesito ajustar mis objetivos`,
      targetExp: mostUrgent?.id || null,
    };
  }

  const progressList = withProgress
    .map(o => `✅ ${o.title} (${o.done_today} paso${o.done_today > 1 ? "s" : ""})`)
    .join("\n");

  let message = `🌙 *Resumen del día*

${progressList}

Total: ${ctx.total_done_today} paso${ctx.total_done_today > 1 ? "s" : ""} completado${ctx.total_done_today > 1 ? "s" : ""} 🎉`;

  if (withoutProgress.length > 0 && withoutProgress.length <= 3) {
    message += `\n\nSin avance hoy:\n${withoutProgress.map(o => `• ${o.title}`).join("\n")}`;
  }

  // Suggest tomorrow's focus
  const tomorrowFocus = ctx.objectives
    .filter(o => o.done_today === 0)
    .sort((a, b) => b.urgency_score - a.urgency_score)[0];

  if (tomorrowFocus) {
    message += `\n\n🎯 Mañana: *${tomorrowFocus.title}*`;
  }

  message += `\n\nDescansa bien 😴`;

  return {
    message,
    targetExp: tomorrowFocus?.id || withProgress[0]?.id || null,
  };
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

    const { searchParams } = new URL(request.url);
    const forcedSlot = searchParams.get("slot") as SlotType | null;
    const slot = forcedSlot || getCurrentSlot();

    if (!slot) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No slot matches current time",
      });
    }

    console.log(`[Smart Reminders] Processing slot: ${slot}`);

    // Check if already sent (unless forced)
    if (!forcedSlot) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: existing } = await supabaseServer
        .from("whatsapp_reminders")
        .select("id")
        .eq("user_id", DEFAULT_USER_ID)
        .eq("slot_type", slot)
        .gte("sent_at", today.toISOString())
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Slot ${slot} already sent today`,
        });
      }
    }

    // Get WhatsApp config
    const { data: config } = await supabaseServer
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", DEFAULT_USER_ID)
      .eq("is_active", true)
      .single();

    if (!config) {
      return NextResponse.json({
        success: false,
        error: "No active WhatsApp configuration",
      }, { status: 404 });
    }

    const whatsappConfig = config as WhatsAppConfig;

    // Get context
    const ctx = await getDayContext();

    // Build message
    let result: { message: string; targetExp: string | null };

    switch (slot) {
      case "MORNING_SUMMARY":
        result = buildMorningSummary(ctx);
        break;
      case "PUSH_1":
        result = buildPushMessage(ctx, 1);
        break;
      case "PUSH_2":
        result = buildPushMessage(ctx, 2);
        break;
      case "PUSH_3":
        result = buildPushMessage(ctx, 3);
        break;
      case "NIGHT_RECAP":
        result = buildNightRecap(ctx);
        break;
    }

    // Send message
    const sendResult = await sendWhatsAppMessage(whatsappConfig.phone_number, result.message);

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error,
      }, { status: 500 });
    }

    // Get the target objective's first pending step for webhook context
    const targetObj = ctx.objectives.find(o => o.id === result.targetExp);
    const firstStep = targetObj?.pending_steps[0];

    // Record reminder
    await supabaseServer
      .from("whatsapp_reminders")
      .insert({
        user_id: DEFAULT_USER_ID,
        experiment_id: result.targetExp,
        message_content: result.message,
        step_title: firstStep?.step_title || null,
        step_description: firstStep?.step_description || null,
        status: "sent",
        kapso_message_id: sendResult.messageId,
        slot_type: slot,
        response_options: {
          "1": slot === "MORNING_SUMMARY" ? "start_urgent" : "mark_done",
          "2": slot === "MORNING_SUMMARY" ? "list_steps" : "different_step",
          "3": slot === "MORNING_SUMMARY" ? "rest_today" : "later",
          "4": "next_objective",
        },
      });

    return NextResponse.json({
      success: true,
      slot,
      message_id: sendResult.messageId,
      target_objective: result.targetExp,
      objectives_count: ctx.objectives.length,
    });
  } catch (error) {
    console.error("[Smart Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const ctx = await getDayContext();
  const currentSlot = getCurrentSlot();

  const now = new Date();
  const limaOffset = -5 * 60;
  const limaTime = new Date(now.getTime() + (limaOffset - now.getTimezoneOffset()) * 60000);

  return NextResponse.json({
    current_slot: currentSlot,
    lima_time: limaTime.toISOString(),
    schedule: SLOT_SCHEDULE,
    objectives: ctx.objectives.map(o => ({
      id: o.id,
      title: o.title,
      urgency_score: o.urgency_score,
      days_without_progress: o.days_without_progress,
      streak_days: o.streak_days,
      pending_steps: o.pending_steps.length,
      done_today: o.done_today,
    })),
    already_pushed_today: ctx.already_pushed_today,
    total_done_today: ctx.total_done_today,
  });
}
