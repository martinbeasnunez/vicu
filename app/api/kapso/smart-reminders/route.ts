/**
 * POST /api/kapso/smart-reminders
 *
 * Sistema de recordatorios WhatsApp para Vicu.
 * 3 resúmenes diarios con contexto de todos los objetivos.
 *
 * HORARIOS (Bogotá/Lima UTC-5):
 * - 08:00 → MORNING - Plan del día
 * - 15:00 → AFTERNOON - Check-in de mitad de día
 * - 21:00 → NIGHT - Resumen del día
 *
 * Usa ?slot=MORNING para forzar un slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWhatsAppMessage, isKapsoConfigured, WhatsAppConfig } from "@/lib/kapso";

// =============================================================================
// Types
// =============================================================================

type SlotType = "MORNING" | "AFTERNOON" | "NIGHT";

interface ObjectiveWithContext {
  id: string;
  title: string;
  status: string;
  created_at: string;
  deadline: string | null;
  streak_days: number;
  last_checkin_at: string | null;
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
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_USER_ID = "demo-user";

const SLOT_SCHEDULE: Record<SlotType, [number, number]> = {
  MORNING: [8, 0],
  AFTERNOON: [15, 0],
  NIGHT: [21, 0],
};

// =============================================================================
// Helpers
// =============================================================================

function getCurrentSlot(): SlotType | null {
  const now = new Date();
  const bogotaOffset = -5 * 60;
  const bogotaTime = new Date(now.getTime() + (bogotaOffset - now.getTimezoneOffset()) * 60000);
  const currentHour = bogotaTime.getHours();
  const currentMinute = bogotaTime.getMinutes();
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
  if (!lastCheckinAt) return 0;

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

  if (obj.deadline) {
    const daysUntilDeadline = Math.floor(
      (new Date(obj.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDeadline <= 3) score += 50;
    else if (daysUntilDeadline <= 7) score += 30;
    else if (daysUntilDeadline <= 14) score += 15;
  }

  if (obj.days_without_progress >= 7) score += 40;
  else if (obj.days_without_progress >= 3) score += 25;
  else if (obj.days_without_progress >= 1) score += 10;

  if (obj.streak_days >= 7) score += 20;
  else if (obj.streak_days >= 3) score += 10;

  if (obj.done_today > 0) score -= 30;

  return score;
}

async function getDayContext(): Promise<DayContext> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const { data: experiments } = await supabaseServer
    .from("experiments")
    .select("id, title, status, created_at, deadline, streak_days, last_checkin_at")
    .is("deleted_at", null)
    .in("status", ["queued", "building", "testing", "adjusting"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!experiments || experiments.length === 0) {
    return { objectives: [], total_done_today: 0 };
  }

  const experimentIds = experiments.map(e => e.id);

  const { data: pendingSteps } = await supabaseServer
    .from("experiment_checkins")
    .select("id, experiment_id, step_title, step_description, effort")
    .in("experiment_id", experimentIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: doneToday } = await supabaseServer
    .from("experiment_checkins")
    .select("experiment_id")
    .in("experiment_id", experimentIds)
    .eq("status", "done")
    .gte("created_at", todayStr);

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

  objectives.sort((a, b) => b.urgency_score - a.urgency_score);

  return {
    objectives,
    total_done_today: doneToday?.length || 0,
  };
}

// =============================================================================
// Message Builders
// =============================================================================

function buildMorningMessage(ctx: DayContext): { message: string; targetExp: string | null } {
  if (ctx.objectives.length === 0) {
    return {
      message: `☀️ *Buenos días*

No tienes objetivos activos en Vicu.

¿Qué te gustaría lograr? Entra a la app y cuéntame.`,
      targetExp: null,
    };
  }

  // Build list with status indicators
  const list = ctx.objectives.slice(0, 5).map(obj => {
    let emoji = "📌";
    let extra = "";

    if (obj.days_without_progress >= 7) {
      emoji = "🔴";
      extra = ` (${obj.days_without_progress} días)`;
    } else if (obj.days_without_progress >= 3) {
      emoji = "🟡";
      extra = ` (${obj.days_without_progress} días)`;
    } else if (obj.streak_days >= 3) {
      emoji = "🔥";
      extra = ` (racha ${obj.streak_days}d)`;
    }

    return `${emoji} ${obj.title}${extra}`;
  }).join("\n");

  const needsAttention = ctx.objectives.filter(o => o.days_without_progress >= 3);
  const withStreaks = ctx.objectives.filter(o => o.streak_days >= 3);

  let insight = "";
  if (needsAttention.length > 0) {
    insight = `\n\n⚠️ ${needsAttention.length} objetivo${needsAttention.length > 1 ? "s necesitan" : " necesita"} atención`;
  } else if (withStreaks.length > 0) {
    insight = `\n\n🔥 ${withStreaks.length} racha${withStreaks.length > 1 ? "s" : ""} activa${withStreaks.length > 1 ? "s" : ""}`;
  }

  // Suggest where to start
  const suggested = ctx.objectives[0];
  const suggestedStep = suggested?.pending_steps[0];

  let suggestion = "";
  if (suggested) {
    suggestion = `\n\n💡 *Empieza por:* ${suggested.title}`;
    if (suggestedStep) {
      suggestion += `\n→ ${suggestedStep.step_title}`;
    }
  }

  return {
    message: `☀️ *Buenos días*

Tus ${ctx.objectives.length} objetivos activos:

${list}${insight}${suggestion}

¡Hoy es un buen día para avanzar!`,
    targetExp: suggested?.id || null,
  };
}

function buildAfternoonMessage(ctx: DayContext): { message: string; targetExp: string | null } {
  if (ctx.objectives.length === 0) {
    return {
      message: `🌤️ *Check-in de la tarde*

No tienes objetivos activos.

¿Hay algo que quieras lograr? Entra a Vicu.`,
      targetExp: null,
    };
  }

  const withProgress = ctx.objectives.filter(o => o.done_today > 0);
  const withoutProgress = ctx.objectives.filter(o => o.done_today === 0);

  let message = `🌤️ *Check-in de la tarde*\n`;

  if (withProgress.length > 0) {
    // Some progress made
    const progressList = withProgress
      .map(o => `✅ ${o.title} (${o.done_today} paso${o.done_today > 1 ? "s" : ""})`)
      .join("\n");

    message += `\n¡Buen trabajo! Ya avanzaste en:\n${progressList}`;

    if (withoutProgress.length > 0) {
      const remaining = withoutProgress.slice(0, 3);
      message += `\n\nAún puedes avanzar en:\n${remaining.map(o => `• ${o.title}`).join("\n")}`;

      if (withoutProgress.length > 3) {
        message += `\n...y ${withoutProgress.length - 3} más`;
      }
    } else {
      message += `\n\n🎉 ¡Avanzaste en todos! Sigue así.`;
    }
  } else {
    // No progress yet
    message += `\nAún no registras avances hoy.`;

    const mostUrgent = ctx.objectives[0];
    const step = mostUrgent?.pending_steps[0];

    if (mostUrgent) {
      message += `\n\nAún hay tiempo. ¿Qué tal *${mostUrgent.title}*?`;
      if (step) {
        message += `\n→ ${step.step_title}`;
      }
    }

    message += `\n\nUn paso pequeño cuenta 💪`;
  }

  return {
    message,
    targetExp: withoutProgress[0]?.id || withProgress[0]?.id || null,
  };
}

function buildNightMessage(ctx: DayContext): { message: string; targetExp: string | null } {
  if (ctx.objectives.length === 0) {
    return {
      message: `🌙 *Buenas noches*

No tienes objetivos activos en Vicu.

Mañana es un buen día para empezar algo nuevo.

Descansa bien 😴`,
      targetExp: null,
    };
  }

  const withProgress = ctx.objectives.filter(o => o.done_today > 0);
  const withoutProgress = ctx.objectives.filter(o => o.done_today === 0);

  let message = `🌙 *Resumen del día*\n`;

  if (ctx.total_done_today > 0) {
    const progressList = withProgress
      .map(o => `✅ ${o.title} (${o.done_today} paso${o.done_today > 1 ? "s" : ""})`)
      .join("\n");
    message += `\nHoy avanzaste en ${withProgress.length} objetivo${withProgress.length > 1 ? "s" : ""}:\n${progressList}`;

    // Celebrate streaks
    const newStreaks = withProgress.filter(o => o.streak_days > 1);
    if (newStreaks.length > 0) {
      const best = newStreaks.sort((a, b) => b.streak_days - a.streak_days)[0];
      message += `\n\n🔥 Racha en *${best.title}*: ${best.streak_days} días`;
    }
  } else {
    message += `\nHoy fue un día de descanso.`;
  }

  // Show what didn't get attention
  if (withoutProgress.length > 0) {
    const withoutList = withoutProgress.slice(0, 4).map(o => {
      const days = o.days_without_progress;
      const daysText = days === 0 ? "" : days === 1 ? " · 1 día" : ` · ${days} días`;
      return `• ${o.title}${daysText}`;
    }).join("\n");

    message += `\n\nSin avance hoy:\n${withoutList}`;
    if (withoutProgress.length > 4) {
      message += `\n...y ${withoutProgress.length - 4} más`;
    }
  }

  // Tomorrow suggestion
  const tomorrowFocus = withoutProgress
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

    // Build message based on slot
    let result: { message: string; targetExp: string | null };

    switch (slot) {
      case "MORNING":
        result = buildMorningMessage(ctx);
        break;
      case "AFTERNOON":
        result = buildAfternoonMessage(ctx);
        break;
      case "NIGHT":
        result = buildNightMessage(ctx);
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

    // Record reminder
    await supabaseServer
      .from("whatsapp_reminders")
      .insert({
        user_id: DEFAULT_USER_ID,
        experiment_id: result.targetExp,
        message_content: result.message,
        status: "sent",
        kapso_message_id: sendResult.messageId,
        slot_type: slot,
      });

    return NextResponse.json({
      success: true,
      slot,
      message_id: sendResult.messageId,
      target_objective: result.targetExp,
      objectives_count: ctx.objectives.length,
      done_today: ctx.total_done_today,
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
  const bogotaOffset = -5 * 60;
  const bogotaTime = new Date(now.getTime() + (bogotaOffset - now.getTimezoneOffset()) * 60000);

  return NextResponse.json({
    current_slot: currentSlot,
    bogota_time: bogotaTime.toISOString(),
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
    total_done_today: ctx.total_done_today,
  });
}
