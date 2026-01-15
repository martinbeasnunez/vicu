/**
 * WhatsApp Action System
 *
 * Handles the interactive loop:
 * 1. Send actionable message with one clear task
 * 2. User responds 1/2/3
 * 3. Process response and update Vicu
 * 4. Send confirmation
 */

import OpenAI from "openai";
import { supabaseServer } from "@/lib/supabase-server";

// =============================================================================
// Types
// =============================================================================

export interface PendingAction {
  id: string;
  user_id: string;
  experiment_id: string;
  checkin_id: string | null; // null if AI-generated micro-action
  action_text: string;
  is_ai_generated: boolean;
  created_at: string;
  expires_at: string;
  status: "pending" | "done" | "skipped" | "alternative_requested";
}

export interface ActionableObjective {
  id: string;
  title: string;
  days_without_progress: number;
  streak_days: number;
  pending_step: {
    id: string;
    title: string;
    description: string | null;
  } | null;
}

// =============================================================================
// OpenAI
// =============================================================================

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Generate a micro-action for an objective that has no pending steps
 */
export async function generateMicroAction(
  objectiveTitle: string,
  context?: string
): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Genera UNA micro-acción de máximo 2 minutos para avanzar en un objetivo.

REGLAS:
- Acción específica y concreta (no vaga)
- Que se pueda hacer AHORA MISMO
- Máximo 10 palabras
- Sin emojis
- Empezar con verbo en infinitivo

EJEMPLOS:
- Objetivo: "Bajar de peso" → "Hacer 10 sentadillas"
- Objetivo: "Aprender inglés" → "Ver un video de 2 min en inglés"
- Objetivo: "Reducir redes sociales" → "Desinstalar una app de tu celular"
- Objetivo: "Ahorrar dinero" → "Transferir $10 a tu cuenta de ahorros"`
      },
      {
        role: "user",
        content: `Objetivo: "${objectiveTitle}"${context ? `\nContexto: ${context}` : ""}`
      }
    ],
    temperature: 0.7,
    max_tokens: 50,
  });

  return completion.choices[0]?.message?.content?.trim() || "Dedicar 5 minutos a este objetivo";
}

/**
 * Generate an alternative micro-action (easier than the original)
 */
export async function generateAlternativeAction(
  objectiveTitle: string,
  originalAction: string
): Promise<string> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `El usuario dijo que no puede hacer la acción sugerida. Genera una alternativa MÁS FÁCIL.

REGLAS:
- Acción más pequeña/fácil que la original
- Que se pueda hacer en 1 minuto
- Máximo 10 palabras
- Sin emojis
- Empezar con verbo en infinitivo`
      },
      {
        role: "user",
        content: `Objetivo: "${objectiveTitle}"
Acción original que no pudo hacer: "${originalAction}"

Genera una alternativa más fácil:`
      }
    ],
    temperature: 0.7,
    max_tokens: 50,
  });

  return completion.choices[0]?.message?.content?.trim() || "Pensar en el siguiente paso por 1 minuto";
}

/**
 * Get all actionable objectives for a user, sorted by urgency
 */
export async function getAllActionableObjectives(userId: string): Promise<ActionableObjective[]> {
  // Get active experiments
  const { data: experiments } = await supabaseServer
    .from("experiments")
    .select("id, title, status, streak_days, last_checkin_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["queued", "building", "testing", "adjusting"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!experiments || experiments.length === 0) return [];

  // Get pending steps for all experiments
  const { data: pendingSteps, error: pendingError } = await supabaseServer
    .from("experiment_checkins")
    .select("id, experiment_id, step_title, step_description")
    .in("experiment_id", experiments.map(e => e.id))
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (pendingError) {
    console.error("[WhatsApp] Error fetching pending steps:", pendingError);
  }

  // Build map of first pending step per experiment
  const stepsByExp: Record<string, { id: string; title: string; description: string | null }> = {};
  pendingSteps?.forEach(s => {
    if (!stepsByExp[s.experiment_id]) {
      stepsByExp[s.experiment_id] = {
        id: s.id,
        title: s.step_title || "Avanzar en el objetivo",
        description: s.step_description,
      };
    }
  });

  // Calculate urgency and sort
  const now = new Date();
  const objectives = experiments.map(exp => {
    const lastCheckin = exp.last_checkin_at ? new Date(exp.last_checkin_at) : null;
    const daysWithout = lastCheckin
      ? Math.floor((now.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60 * 24))
      : 999; // Never checked in = very urgent

    return {
      id: exp.id,
      title: exp.title,
      days_without_progress: daysWithout,
      streak_days: exp.streak_days || 0,
      pending_step: stepsByExp[exp.id] || null,
      urgency: daysWithout * 10 + (stepsByExp[exp.id] ? 5 : 0), // More urgent if has steps
    };
  });

  // Sort by urgency (highest first)
  objectives.sort((a, b) => b.urgency - a.urgency);

  return objectives.map(obj => ({
    id: obj.id,
    title: obj.title,
    days_without_progress: obj.days_without_progress,
    streak_days: obj.streak_days,
    pending_step: obj.pending_step,
  }));
}

/**
 * Get the most urgent objective for a user that needs action
 */
export async function getMostUrgentObjective(userId: string): Promise<ActionableObjective | null> {
  const objectives = await getAllActionableObjectives(userId);
  return objectives[0] || null;
}

/**
 * Get objective at specific index (for rotation across slots)
 * Falls back to first objective if index is out of bounds
 */
export async function getObjectiveAtIndex(userId: string, index: number): Promise<ActionableObjective | null> {
  const objectives = await getAllActionableObjectives(userId);
  if (objectives.length === 0) return null;

  // Use modulo to wrap around if index exceeds number of objectives
  const safeIndex = index % objectives.length;
  return objectives[safeIndex];
}

/**
 * Save a pending action so we can process the user's response
 */
export async function savePendingAction(
  userId: string,
  experimentId: string,
  checkinId: string | null,
  actionText: string,
  isAiGenerated: boolean
): Promise<string | null> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Expires in 24h

  // First, mark any existing pending actions as skipped (so user responds to the latest one)
  await supabaseServer
    .from("whatsapp_pending_actions")
    .update({ status: "skipped" })
    .eq("user_id", userId)
    .eq("status", "pending");

  const { data, error } = await supabaseServer
    .from("whatsapp_pending_actions")
    .insert({
      user_id: userId,
      experiment_id: experimentId,
      checkin_id: checkinId,
      action_text: actionText,
      is_ai_generated: isAiGenerated,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[WhatsApp Actions] Error saving pending action:", error);
    return null;
  }

  return data?.id || null;
}

/**
 * Get the most recent pending action for a user
 */
export async function getPendingAction(userId: string): Promise<PendingAction | null> {
  const { data } = await supabaseServer
    .from("whatsapp_pending_actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data as PendingAction | null;
}

/**
 * Process user response (1=done, 2=later, 3=alternative)
 */
export async function processUserResponse(
  userId: string,
  response: "1" | "2" | "3",
  pendingAction: PendingAction
): Promise<{
  success: boolean;
  replyMessage: string;
  newStreak?: number;
  alternativeAction?: string;
}> {
  const { experiment_id, checkin_id, action_text, is_ai_generated } = pendingAction;

  if (response === "1") {
    // DONE - Mark step as complete

    if (checkin_id) {
      // Mark existing checkin as done (connects WhatsApp response to VICU step)
      const { error } = await supabaseServer
        .from("experiment_checkins")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("id", checkin_id);

      if (error) {
        console.error(`[WhatsApp] Error marking checkin ${checkin_id} as done:`, error);
      }
    } else if (is_ai_generated) {
      // Create new checkin for AI-generated action and mark as done
      const { error: insertError } = await supabaseServer
        .from("experiment_checkins")
        .insert({
          experiment_id,
          step_title: action_text,
          step_description: `Micro-paso completado vía WhatsApp`,
          status: "done",
          completed_at: new Date().toISOString(),
          source: "whatsapp",
        });

      if (insertError) {
        console.error(`[WhatsApp] Error creating checkin:`, insertError);
      }
    }

    // Update experiment streak
    const { data: exp } = await supabaseServer
      .from("experiments")
      .select("streak_days, last_checkin_at")
      .eq("id", experiment_id)
      .single();

    let newStreak = 1;
    if (exp) {
      const lastCheckin = exp.last_checkin_at ? new Date(exp.last_checkin_at) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (lastCheckin) {
        lastCheckin.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((today.getTime() - lastCheckin.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff <= 1) {
          newStreak = (exp.streak_days || 0) + 1;
        }
      }
    }

    await supabaseServer
      .from("experiments")
      .update({
        streak_days: newStreak,
        last_checkin_at: new Date().toISOString(),
      })
      .eq("id", experiment_id);

    // Mark pending action as done
    await supabaseServer
      .from("whatsapp_pending_actions")
      .update({ status: "done" })
      .eq("id", pendingAction.id);

    return {
      success: true,
      replyMessage: `✅ ¡Hecho! Paso registrado.\n🔥 Racha: ${newStreak} día${newStreak > 1 ? "s" : ""}\n\nMañana seguimos 💪`,
      newStreak,
    };
  }

  if (response === "2") {
    // LATER - Postpone
    // If AI-generated, save as pending step so it appears in VICU
    if (is_ai_generated && !checkin_id) {
      await supabaseServer
        .from("experiment_checkins")
        .insert({
          experiment_id,
          step_title: action_text,
          step_description: `Micro-paso sugerido vía WhatsApp`,
          status: "pending",
          source: "whatsapp",
        });
    }

    await supabaseServer
      .from("whatsapp_pending_actions")
      .update({ status: "skipped" })
      .eq("id", pendingAction.id);

    return {
      success: true,
      replyMessage: "👍 Te recuerdo mañana temprano.",
    };
  }

  if (response === "3") {
    // ALTERNATIVE - Generate easier action
    const { data: exp } = await supabaseServer
      .from("experiments")
      .select("title")
      .eq("id", experiment_id)
      .single();

    const alternativeAction = await generateAlternativeAction(
      exp?.title || "tu objetivo",
      action_text
    );

    // Update pending action status
    await supabaseServer
      .from("whatsapp_pending_actions")
      .update({ status: "alternative_requested" })
      .eq("id", pendingAction.id);

    // Save new pending action with alternative
    await savePendingAction(userId, experiment_id, null, alternativeAction, true);

    return {
      success: true,
      replyMessage: `Ok, ¿qué tal esto?\n→ ${alternativeAction}\n\n1️⃣ Listo\n2️⃣ Mañana`,
      alternativeAction,
    };
  }

  return {
    success: false,
    replyMessage: "No entendí. Responde 1, 2 o 3.",
  };
}

/**
 * Build actionable WhatsApp message for a user
 * Optimized for single-line template format (no newlines in WhatsApp templates)
 *
 * @param userId - The user ID
 * @param slotIndex - Optional index to select different objectives (0=first, 1=second, etc.)
 *                    This enables rotation across time slots to avoid repetition
 */
export async function buildActionableMessage(userId: string, slotIndex: number = 0): Promise<{
  message: string;
  experimentId: string | null;
  actionSaved: boolean;
  objectiveTitle: string | null;
  actionText: string | null;
  streakInfo: string | null;
}> {
  const objective = await getObjectiveAtIndex(userId, slotIndex);

  if (!objective) {
    return {
      message: `No tienes objetivos activos. ¿Qué quieres lograr? Entra a vicu.vercel.app`,
      experimentId: null,
      actionSaved: false,
      objectiveTitle: null,
      actionText: null,
      streakInfo: null,
    };
  }

  let actionText: string;
  let checkinId: string | null = null;
  let isAiGenerated = false;

  if (objective.pending_step) {
    // Use existing step
    actionText = objective.pending_step.title;
    checkinId = objective.pending_step.id;
  } else {
    // Generate micro-action with AI
    actionText = await generateMicroAction(objective.title);
    isAiGenerated = true;
  }

  // Save pending action for later processing
  await savePendingAction(userId, objective.id, checkinId, actionText, isAiGenerated);

  // Build urgency context (human-friendly)
  let streakInfo: string | null = null;
  if (objective.days_without_progress >= 7 && objective.days_without_progress < 900) {
    streakInfo = `(${objective.days_without_progress} días pausado)`;
  } else if (objective.days_without_progress >= 3 && objective.days_without_progress < 7) {
    streakInfo = "(hace unos días)";
  } else if (objective.streak_days >= 3) {
    streakInfo = `(racha ${objective.streak_days}d)`;
  }

  // Single-line friendly format (for fallback/old template)
  const urgencyHint = streakInfo ? ` - ${streakInfo.replace(/[()]/g, "")}` : "";
  const message = `${objective.title}${urgencyHint}. Hoy: ${actionText}. Responde 1=Listo, 2=Mañana, 3=Otra`;

  return {
    message,
    experimentId: objective.id,
    actionSaved: true,
    objectiveTitle: objective.title,
    actionText,
    streakInfo,
  };
}
