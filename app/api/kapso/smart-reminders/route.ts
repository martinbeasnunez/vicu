/**
 * POST /api/kapso/smart-reminders
 *
 * Sistema de recordatorios WhatsApp para Vicu - COACH INTELIGENTE CON MEMORIA
 *
 * FILOSOFÍA:
 * - 3 mensajes máximo por día (menos spam, más impacto)
 * - AI genera mensajes personalizados Y ÚNICOS (nunca repite)
 * - Rotación de objetivos por día (lunes=obj1, martes=obj2, etc.)
 * - Aprende del usuario: hora de respuesta, palabras que usa, patrones
 * - Varía estilos: motivacional, táctico, reflexivo, celebratorio
 * - MEMORIA: revisa últimos 10 mensajes para no repetir
 *
 * HORARIOS (Bogotá/Lima UTC-5):
 * - 08:00 → MORNING - Mensaje accionable del día (objetivo rotativo)
 * - 14:00 → MIDDAY - Follow-up si no respondió en la mañana
 * - 20:00 → EVENING - Cierre del día + celebración o gentle nudge
 *
 * Usa ?slot=MORNING para forzar un slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendVicuActionTemplate, isKapsoConfigured, WhatsAppConfig } from "@/lib/kapso";
import {
  getAllActionableObjectives,
  generateMicroAction,
  savePendingAction
} from "@/lib/whatsapp-actions";
import OpenAI from "openai";

// =============================================================================
// Types
// =============================================================================

type SlotType = "MORNING" | "MIDDAY" | "EVENING";

/**
 * Message styles to create variety and avoid repetition
 */
type MessageStyle =
  | "motivational"  // Energético, inspirador
  | "tactical"      // Específico, paso a paso
  | "reflective"    // Pregunta, hace pensar
  | "celebratory"   // Celebra logros/rachas
  | "gentle"        // Suave, sin presión (para usuarios que no responden)
  | "curious";      // Muestra interés genuino en el progreso

/**
 * Focus areas for objectives - used when user has few objectives
 * to create variety in messaging even with the same objective
 */
type ObjectiveFocus =
  | "execution"     // Enfocarse en hacer la tarea principal
  | "planning"      // Enfocarse en planificar el siguiente paso
  | "reflection"    // Enfocarse en reflexionar sobre el progreso
  | "learning"      // Enfocarse en aprender algo nuevo relacionado
  | "networking"    // Enfocarse en conectar con otros (si aplica)
  | "celebration"   // Enfocarse en celebrar pequeños logros
  | "obstacle"      // Enfocarse en identificar/superar obstáculos

interface MessageHistoryItem {
  message_content: string;
  sent_at: string;
  user_response: string | null;
  style_used?: MessageStyle;
}

interface UserEngagementProfile {
  user_id: string;
  preferred_response_hour: number | null;
  response_words: string[];
  avg_response_time_minutes: number | null;
  total_responses: number;
  total_completions: number;
  consecutive_no_response: number;
  last_response_at: string | null;
  // Message history for variety
  recent_messages: MessageHistoryItem[];
  styles_used_recently: MessageStyle[];
  // Focus areas used recently (for users with few objectives)
  focuses_used_recently: ObjectiveFocus[];
  total_objectives: number;
}

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

const SLOT_SCHEDULE: Record<SlotType, [number, number]> = {
  MORNING: [8, 0],
  MIDDAY: [14, 0],
  EVENING: [20, 0],
};

// OpenAI client for AI-powered messages
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if today is a weekend day and apply weekend rules:
 * - Sunday (0): No messages at all
 * - Saturday (6): Only MORNING slot
 */
function isWeekendRestricted(slot: SlotType): { skip: boolean; reason?: string } {
  const now = new Date();
  const bogotaOffset = -5 * 60;
  const bogotaTime = new Date(now.getTime() + (bogotaOffset - now.getTimezoneOffset()) * 60000);
  const dayOfWeek = bogotaTime.getDay(); // 0=Sunday, 6=Saturday

  // Sunday: No messages
  if (dayOfWeek === 0) {
    return { skip: true, reason: "Sunday - rest day, no messages" };
  }

  // Saturday: Only MORNING
  if (dayOfWeek === 6 && slot !== "MORNING") {
    return { skip: true, reason: "Saturday - only MORNING message" };
  }

  return { skip: false };
}

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

  // Deadline proximity (reduced weights to allow more rotation)
  if (obj.deadline) {
    const daysUntilDeadline = Math.floor(
      (new Date(obj.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilDeadline <= 3) score += 35;
    else if (daysUntilDeadline <= 7) score += 20;
    else if (daysUntilDeadline <= 14) score += 10;
  }

  // Days without progress (reduced weights)
  if (obj.days_without_progress >= 7) score += 25;
  else if (obj.days_without_progress >= 3) score += 15;
  else if (obj.days_without_progress >= 1) score += 5;

  // Streak bonus (keep same)
  if (obj.streak_days >= 7) score += 20;
  else if (obj.streak_days >= 3) score += 10;

  // Already done today penalty
  if (obj.done_today > 0) score -= 30;

  return score;
}

/**
 * Get objective for today using day-based rotation
 * Monday = objective 0, Tuesday = objective 1, etc.
 */
function getObjectiveIndexForToday(totalObjectives: number): number {
  if (totalObjectives === 0) return 0;
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
  // Shift so Monday=0, Sunday=6
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return adjustedDay % totalObjectives;
}

/**
 * Get focus area for today - rotates through different aspects
 * This creates variety even when user has only 1-2 objectives
 *
 * Each day focuses on a different aspect of the objective:
 * - Monday: execution (hacer)
 * - Tuesday: planning (planificar)
 * - Wednesday: reflection (reflexionar)
 * - Thursday: learning (aprender)
 * - Friday: networking (conectar)
 * - Saturday: celebration (celebrar)
 * - Sunday: obstacle (superar obstáculos)
 */
function getFocusForToday(recentFocuses: string[]): ObjectiveFocus {
  const allFocuses: ObjectiveFocus[] = [
    "execution", "planning", "reflection", "learning",
    "networking", "celebration", "obstacle"
  ];

  // Get day of week for base rotation
  const dayOfWeek = new Date().getDay();
  const baseFocus = allFocuses[dayOfWeek];

  // If base focus was used recently, pick next available
  if (recentFocuses.slice(0, 2).includes(baseFocus)) {
    const available = allFocuses.filter(f => !recentFocuses.slice(0, 2).includes(f));
    return available.length > 0 ? available[0] : baseFocus;
  }

  return baseFocus;
}

/**
 * Detect focus from message content (for historical analysis)
 */
function detectFocusFromMessage(content: string): ObjectiveFocus {
  const lower = content.toLowerCase();
  if (lower.includes("planifica") || lower.includes("siguiente paso") || lower.includes("organiza")) {
    return "planning";
  }
  if (lower.includes("reflexion") || lower.includes("piensa") || lower.includes("cómo te fue")) {
    return "reflection";
  }
  if (lower.includes("aprende") || lower.includes("investiga") || lower.includes("lee sobre")) {
    return "learning";
  }
  if (lower.includes("conecta") || lower.includes("habla con") || lower.includes("comparte")) {
    return "networking";
  }
  if (lower.includes("celebra") || lower.includes("logro") || lower.includes("felicidades")) {
    return "celebration";
  }
  if (lower.includes("obstáculo") || lower.includes("bloqueo") || lower.includes("difícil")) {
    return "obstacle";
  }
  return "execution"; // default
}

/**
 * Detect message style from content (for historical messages without explicit style)
 */
function detectMessageStyle(content: string): MessageStyle {
  const lower = content.toLowerCase();
  if (lower.includes("felicidades") || lower.includes("racha") || lower.includes("increíble") || lower.includes("genial")) {
    return "celebratory";
  }
  if (lower.includes("?") && (lower.includes("cómo") || lower.includes("qué tal") || lower.includes("has pensado"))) {
    return "reflective";
  }
  if (lower.includes("paso") || lower.includes("primero") || lower.includes("empieza") || lower.includes("específico")) {
    return "tactical";
  }
  if (lower.includes("sin presión") || lower.includes("cuando puedas") || lower.includes("tranquilo")) {
    return "gentle";
  }
  if (lower.includes("curioso") || lower.includes("me pregunto") || lower.includes("cuéntame")) {
    return "curious";
  }
  return "motivational"; // default
}

/**
 * Get user engagement profile from past interactions INCLUDING message history
 */
async function getUserEngagementProfile(userId: string): Promise<UserEngagementProfile> {
  // Get recent responses from pending actions
  const { data: recentActions } = await supabaseServer
    .from("whatsapp_pending_actions")
    .select("status, created_at, action_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  // Get recent reminders INCLUDING message content for history
  const { data: recentReminders } = await supabaseServer
    .from("whatsapp_reminders")
    .select("sent_at, status, responded_at, user_response, message_content")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false })
    .limit(15); // Last 15 messages for context

  const totalResponses = recentActions?.filter(a => a.status !== "pending").length || 0;
  const totalCompletions = recentActions?.filter(a => a.status === "done").length || 0;

  // Calculate consecutive no-responses
  let consecutiveNoResponse = 0;
  for (const action of recentActions || []) {
    if (action.status === "pending") {
      consecutiveNoResponse++;
    } else {
      break;
    }
  }

  // Extract common response words from user_response
  const responseWords: string[] = [];
  recentReminders?.forEach(r => {
    if (r.user_response) {
      const words = r.user_response.toLowerCase().split(/\s+/);
      words.forEach((w: string) => {
        if (["listo", "hecho", "ya", "ok", "si", "no", "mañana"].includes(w)) {
          if (!responseWords.includes(w)) responseWords.push(w);
        }
      });
    }
  });

  // Calculate preferred response hour
  let preferredHour: number | null = null;
  const respondedReminders = recentReminders?.filter(r => r.responded_at);
  if (respondedReminders && respondedReminders.length >= 3) {
    const hours = respondedReminders.map(r => new Date(r.responded_at!).getHours());
    preferredHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
  }

  // BUILD MESSAGE HISTORY for AI context
  const recentMessages: MessageHistoryItem[] = (recentReminders || []).map(r => ({
    message_content: r.message_content,
    sent_at: r.sent_at,
    user_response: r.user_response,
    style_used: detectMessageStyle(r.message_content),
  }));

  // Detect which styles were used recently (last 5 messages)
  const stylesUsedRecently = recentMessages
    .slice(0, 5)
    .map(m => m.style_used)
    .filter((s): s is MessageStyle => s !== undefined);

  // Detect which focuses were used recently (for variety with few objectives)
  const focusesUsedRecently = recentMessages
    .slice(0, 5)
    .map(m => detectFocusFromMessage(m.message_content));

  // Count user's total objectives
  const { count: objectiveCount } = await supabaseServer
    .from("experiments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["queued", "building", "testing", "adjusting"]);

  return {
    user_id: userId,
    preferred_response_hour: preferredHour,
    response_words: responseWords.length > 0 ? responseWords : ["listo"],
    avg_response_time_minutes: null,
    total_responses: totalResponses,
    total_completions: totalCompletions,
    consecutive_no_response: consecutiveNoResponse,
    last_response_at: recentActions?.find(a => a.status !== "pending")?.created_at || null,
    recent_messages: recentMessages,
    styles_used_recently: stylesUsedRecently,
    focuses_used_recently: focusesUsedRecently,
    total_objectives: objectiveCount || 0,
  };
}

/**
 * Select the best message style based on context and history
 */
function selectMessageStyle(
  profile: UserEngagementProfile,
  slot: SlotType,
  objective: { streak_days: number; days_without_progress: number },
  respondedToday: boolean
): MessageStyle {
  const recentStyles = profile.styles_used_recently;

  // Available styles
  const allStyles: MessageStyle[] = ["motivational", "tactical", "reflective", "celebratory", "gentle", "curious"];

  // Filter out recently used styles to ensure variety
  let availableStyles = allStyles.filter(s => !recentStyles.slice(0, 2).includes(s));
  if (availableStyles.length === 0) availableStyles = allStyles;

  // Context-based preference
  if (profile.consecutive_no_response >= 3) {
    // User hasn't responded - use gentle or curious
    return availableStyles.includes("gentle") ? "gentle" : "curious";
  }

  if (objective.streak_days >= 3 && respondedToday) {
    // Has streak and responded today - celebrate!
    return availableStyles.includes("celebratory") ? "celebratory" : "motivational";
  }

  if (objective.days_without_progress >= 5) {
    // Long pause - be gentle
    return availableStyles.includes("gentle") ? "gentle" : "reflective";
  }

  if (slot === "MORNING") {
    // Morning - prefer motivational or tactical
    return availableStyles.includes("motivational") ? "motivational" : "tactical";
  }

  if (slot === "MIDDAY") {
    // Midday follow-up - reflective or curious
    return availableStyles.includes("reflective") ? "reflective" : "curious";
  }

  if (slot === "EVENING") {
    // Evening - wrap up, celebratory if did something, gentle if not
    return respondedToday
      ? (availableStyles.includes("celebratory") ? "celebratory" : "motivational")
      : (availableStyles.includes("gentle") ? "gentle" : "reflective");
  }

  // Random from available for variety
  return availableStyles[Math.floor(Math.random() * availableStyles.length)];
}

/**
 * Generate AI-powered personalized message WITH MEMORY AND FOCUS ROTATION
 *
 * Key improvements:
 * 1. Includes history of recent messages to avoid repetition
 * 2. Varies message style (motivational, tactical, reflective, etc.)
 * 3. Adapts based on user response patterns
 * 4. NEW: For users with few objectives, rotates FOCUS AREAS to create variety
 */
async function generatePersonalizedMessage(
  objective: { title: string; streak_days: number; days_without_progress: number },
  microAction: string,
  slot: SlotType,
  profile: UserEngagementProfile,
  respondedToday: boolean
): Promise<{ objectiveText: string; actionText: string; style: MessageStyle; focus: ObjectiveFocus }> {
  // Select message style based on context and history
  const selectedStyle = selectMessageStyle(profile, slot, objective, respondedToday);

  // For users with FEW objectives (1-2), rotate focus areas to create variety
  const hasFewObjectives = profile.total_objectives <= 2;
  const selectedFocus = hasFewObjectives
    ? getFocusForToday(profile.focuses_used_recently)
    : "execution"; // Default to execution if many objectives

  // Build recent messages summary for AI to avoid repetition
  const recentMessagesContext = profile.recent_messages
    .slice(0, 8)
    .map((m, i) => `${i + 1}. "${m.message_content}" ${m.user_response ? `(respondió: ${m.user_response})` : "(sin respuesta)"}`)
    .join("\n");

  // Build context for AI
  const streakContext = objective.streak_days >= 3
    ? `racha de ${objective.streak_days} días consecutivos`
    : objective.days_without_progress >= 3
    ? `${objective.days_without_progress} días sin avance`
    : "objetivo activo";

  const userContext = profile.consecutive_no_response >= 3
    ? "Usuario no ha respondido en varios días - SER MUY GENTIL, sin presionar"
    : profile.total_completions > 5
    ? "Usuario comprometido con historial de completar tareas"
    : "Usuario nuevo o con poca interacción";

  const styleInstructions: Record<MessageStyle, string> = {
    motivational: "Tono energético e inspirador. Ejemplo: 'Hoy es el día para avanzar' o 'Tu futuro yo te agradecerá'",
    tactical: "Tono práctico y específico. Dar un paso concreto. Ejemplo: 'Empieza con solo 5 minutos' o 'El primer paso es...'",
    reflective: "Hacer una pregunta que invite a reflexionar. Ejemplo: '¿Qué pasaría si hoy avanzas?' o '¿Cómo te sentirías al completar esto?'",
    celebratory: "Celebrar logros o racha. Ejemplo: 'Increíble racha!' o 'Vas muy bien!'",
    gentle: "Sin ninguna presión. Ejemplo: 'Cuando puedas' o 'Sin presión, pero aquí estoy' o 'Solo un recordatorio amable'",
    curious: "Mostrar interés genuino. Ejemplo: 'Cuéntame cómo va' o 'Me pregunto si ya avanzaste' o '¿Qué tal te fue?'",
  };

  // Focus instructions - ONLY used when user has few objectives
  const focusInstructions: Record<ObjectiveFocus, string> = {
    execution: "Enfócate en HACER una acción específica del objetivo. Ejemplo: 'Haz X ahora'",
    planning: "Enfócate en PLANIFICAR. Ejemplo: 'Define los 3 pasos para...' o 'Organiza tu siguiente movimiento'",
    reflection: "Enfócate en REFLEXIONAR sobre el progreso. Ejemplo: '¿Qué aprendiste esta semana?' o 'Piensa en qué te falta'",
    learning: "Enfócate en APRENDER algo nuevo relacionado. Ejemplo: 'Investiga sobre...' o 'Lee un artículo de...'",
    networking: "Enfócate en CONECTAR con otros. Ejemplo: 'Habla con alguien que ya hizo esto' o 'Comparte tu progreso'",
    celebration: "Enfócate en CELEBRAR pequeños logros. Ejemplo: 'Reconoce lo que ya lograste' o 'Date un momento para apreciar tu avance'",
    obstacle: "Enfócate en IDENTIFICAR obstáculos. Ejemplo: '¿Qué te está frenando?' o 'Piensa en cómo superar ese bloqueo'",
  };

  const preferredWord = profile.response_words[0] || "listo";

  // Build focus context for AI (only if user has few objectives)
  const focusContext = hasFewObjectives
    ? `\n\nENFOQUE DEL DÍA: ${selectedFocus.toUpperCase()}\n${focusInstructions[selectedFocus]}\nIMPORTANTE: El usuario tiene solo ${profile.total_objectives} objetivo(s), así que varía el ENFOQUE para crear frescura.`
    : "";

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Eres Vicu, un coach de objetivos por WhatsApp. Genera mensajes ÚNICOS y personalizados.

REGLAS CRÍTICAS:
- Máximo 50 caracteres para el objetivo (parámetro 1)
- Máximo 80 caracteres para la acción (parámetro 2)
- Sin emojis (el template ya los tiene)
- NUNCA repetir frases de mensajes anteriores
- Tono conversacional, como un amigo cercano
- Terminar con invitación a responder usando: "${preferredWord}"

ESTILO A USAR: ${selectedStyle.toUpperCase()}
${styleInstructions[selectedStyle]}
${focusContext}

CONTEXTO DEL USUARIO:
- Objetivo actual: ${objective.title}
- Estado: ${streakContext}
- Micro-acción sugerida: ${microAction}
- Perfil: ${userContext}
- Momento del día: ${slot}
- Respondió hoy: ${respondedToday ? "Sí" : "No"}

MENSAJES ANTERIORES (NO REPETIR ESTAS FRASES):
${recentMessagesContext || "Sin historial previo - puedes ser creativo"}

FORMATO DE RESPUESTA (JSON):
{
  "objective": "título corto del objetivo (máx 50 chars)",
  "action": "acción única y creativa + invitación a responder (máx 80 chars)"
}`
        },
        {
          role: "user",
          content: `Genera un mensaje ${selectedStyle}${hasFewObjectives ? ` con enfoque en ${selectedFocus}` : ""} para el slot ${slot}. Recuerda: NO repetir nada de los mensajes anteriores.`
        }
      ],
      temperature: 0.9, // Higher temperature for more creativity
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const response = JSON.parse(completion.choices[0]?.message?.content || "{}");

    return {
      objectiveText: (response.objective || objective.title).slice(0, 50),
      actionText: (response.action || `${microAction}. ¿${preferredWord.charAt(0).toUpperCase() + preferredWord.slice(1)}?`).slice(0, 80),
      style: selectedStyle,
      focus: selectedFocus,
    };
  } catch (error) {
    console.error("[Smart Reminders] AI generation failed:", error);

    // Smart fallback with style variation
    const fallbackMessages: Record<MessageStyle, { objective: string; action: string }> = {
      motivational: {
        objective: objective.title,
        action: `Hoy es buen día para avanzar. ¿${preferredWord}?`,
      },
      tactical: {
        objective: objective.title,
        action: `Paso simple: ${microAction.slice(0, 40)}. ¿${preferredWord}?`,
      },
      reflective: {
        objective: objective.title,
        action: `¿Qué tal si hoy avanzas un poco? Responde ${preferredWord}`,
      },
      celebratory: {
        objective: objective.streak_days >= 3 ? `${objective.title} (racha ${objective.streak_days}d!)` : objective.title,
        action: `Sigue así! ${microAction.slice(0, 35)}. ¿${preferredWord}?`,
      },
      gentle: {
        objective: objective.title,
        action: `Sin presión, pero aquí estoy. ¿${preferredWord} cuando puedas?`,
      },
      curious: {
        objective: objective.title,
        action: `Cuéntame cómo va. Responde ${preferredWord} si avanzaste`,
      },
    };

    const fallback = fallbackMessages[selectedStyle];
    return {
      objectiveText: fallback.objective.slice(0, 50),
      actionText: fallback.action.slice(0, 80),
      style: selectedStyle,
      focus: selectedFocus,
    };
  }
}

/**
 * Add rotation factor to prevent always selecting the same objective
 * Uses current hour to shift urgency scores
 */
function addRotationFactor(objectives: ObjectiveWithContext[]): void {
  const hour = new Date().getHours();
  objectives.forEach((obj, index) => {
    // Add small rotation bonus based on hour and position
    // This creates variety across different time slots
    const rotationBonus = ((hour + index) % objectives.length) * 2;
    obj.urgency_score += rotationBonus;
  });
}

async function getDayContext(userId: string): Promise<DayContext> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const { data: experiments } = await supabaseServer
    .from("experiments")
    .select("id, title, status, created_at, deadline, streak_days, last_checkin_at")
    .eq("user_id", userId)
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

  // Use completed_at (not created_at) because a step might have been created days ago
  // but completed today via WhatsApp response
  const { data: doneToday } = await supabaseServer
    .from("experiment_checkins")
    .select("experiment_id")
    .in("experiment_id", experimentIds)
    .eq("status", "done")
    .gte("completed_at", todayStr);

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

  // Apply rotation factor to create variety across time slots
  addRotationFactor(objectives);

  objectives.sort((a, b) => b.urgency_score - a.urgency_score);

  return {
    objectives,
    total_done_today: doneToday?.length || 0,
  };
}


// =============================================================================
// Main Handler - AI-Powered Coach System
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
        reason: "No slot matches current time (slots: MORNING 8am, MIDDAY 2pm, EVENING 8pm)",
      });
    }

    // Check weekend restrictions (Sunday=no messages, Saturday=only MORNING)
    const weekendCheck = isWeekendRestricted(slot);
    if (weekendCheck.skip && !forcedSlot) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: weekendCheck.reason,
      });
    }

    console.log(`[Smart Reminders] Processing slot: ${slot}`);

    // Get ALL users with WhatsApp enabled
    const { data: activeConfigs } = await supabaseServer
      .from("whatsapp_config")
      .select("*")
      .eq("is_active", true);

    if (!activeConfigs || activeConfigs.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No users with active WhatsApp configuration",
      });
    }

    console.log(`[Smart Reminders] Found ${activeConfigs.length} users with WhatsApp enabled`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const results: Array<{
      user_id: string;
      success: boolean;
      skipped?: boolean;
      reason?: string;
      message_id?: string;
    }> = [];

    // Process each user
    for (const config of activeConfigs) {
      const userId = config.user_id;
      const whatsappConfig = config as WhatsAppConfig;

      // Check if already sent this slot today (unless forced)
      if (!forcedSlot) {
        const { data: existing } = await supabaseServer
          .from("whatsapp_reminders")
          .select("id")
          .eq("user_id", userId)
          .eq("slot_type", slot)
          .gte("sent_at", todayStr)
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({
            user_id: userId,
            success: true,
            skipped: true,
            reason: `Slot ${slot} already sent today`,
          });
          continue;
        }
      }

      // Get user's objectives with day-based rotation
      const objectives = await getAllActionableObjectives(userId);

      if (objectives.length === 0) {
        results.push({
          user_id: userId,
          success: true,
          skipped: true,
          reason: "No active objectives",
        });
        continue;
      }

      // Select objective based on day rotation (Monday=0, Tuesday=1, etc.)
      const objectiveIndex = getObjectiveIndexForToday(objectives.length);
      const selectedObjective = objectives[objectiveIndex];

      // Get user engagement profile for personalization
      const profile = await getUserEngagementProfile(userId);

      // Check if user already responded today (for MIDDAY/EVENING skip logic)
      const { data: todayActions } = await supabaseServer
        .from("whatsapp_pending_actions")
        .select("status")
        .eq("user_id", userId)
        .gte("created_at", todayStr)
        .in("status", ["done", "skipped"]);

      const respondedToday = (todayActions?.length || 0) > 0;

      // MIDDAY: Skip if user already responded to morning message
      if (slot === "MIDDAY" && respondedToday) {
        results.push({
          user_id: userId,
          success: true,
          skipped: true,
          reason: "User already responded today, skipping MIDDAY follow-up",
        });
        continue;
      }

      // Generate micro-action for the objective
      const microAction = selectedObjective.pending_step
        ? selectedObjective.pending_step.title
        : await generateMicroAction(selectedObjective.title);

      // Generate AI-personalized message with style and focus
      const { objectiveText, actionText, style, focus } = await generatePersonalizedMessage(
        {
          title: selectedObjective.title,
          streak_days: selectedObjective.streak_days,
          days_without_progress: selectedObjective.days_without_progress,
        },
        microAction,
        slot,
        profile,
        respondedToday
      );

      // Save pending action for tracking responses
      await savePendingAction(
        userId,
        selectedObjective.id,
        selectedObjective.pending_step?.id || null,
        microAction,
        !selectedObjective.pending_step // is AI generated
      );

      // Send via vicu_action template
      const sendResult = await sendVicuActionTemplate(
        whatsappConfig.phone_number,
        objectiveText,
        actionText
      );

      if (!sendResult.success) {
        console.error(`[Smart Reminders] Failed to send to user ${userId}:`, sendResult.error);
        results.push({
          user_id: userId,
          success: false,
          reason: sendResult.error,
        });
        continue;
      }

      // Record reminder with style and focus for future reference
      const focusTag = profile.total_objectives <= 2 ? `|${focus}` : "";
      await supabaseServer
        .from("whatsapp_reminders")
        .insert({
          user_id: userId,
          experiment_id: selectedObjective.id,
          message_content: `[${style}${focusTag}] ${objectiveText} | ${actionText}`,
          status: "sent",
          kapso_message_id: sendResult.messageId,
          slot_type: slot,
        });

      results.push({
        user_id: userId,
        success: true,
        message_id: sendResult.messageId,
      });

      const focusLog = profile.total_objectives <= 2 ? ` focus:${focus}` : "";
      console.log(`[Smart Reminders] Sent ${slot} [${style}${focusLog}] to user ${userId} (${profile.total_objectives} obj) - "${objectiveText}" | "${actionText}"`);
    }

    const sent = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      slot,
      total_users: activeConfigs.length,
      sent,
      skipped,
      failed,
      results,
    });
  } catch (error) {
    console.error("[Smart Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  const currentSlot = getCurrentSlot();
  const now = new Date();
  const bogotaOffset = -5 * 60;
  const bogotaTime = new Date(now.getTime() + (bogotaOffset - now.getTimezoneOffset()) * 60000);

  // Get all active WhatsApp users
  const { data: activeConfigs } = await supabaseServer
    .from("whatsapp_config")
    .select("user_id, phone_number")
    .eq("is_active", true);

  // If user_id provided, show their objectives
  if (userId) {
    const ctx = await getDayContext(userId);
    return NextResponse.json({
      current_slot: currentSlot,
      bogota_time: bogotaTime.toISOString(),
      schedule: SLOT_SCHEDULE,
      user_id: userId,
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

  // Otherwise show summary of all active users
  return NextResponse.json({
    current_slot: currentSlot,
    bogota_time: bogotaTime.toISOString(),
    schedule: SLOT_SCHEDULE,
    active_whatsapp_users: activeConfigs?.length || 0,
    users: activeConfigs?.map(c => ({
      user_id: c.user_id,
      phone: c.phone_number?.slice(-4) ? `***${c.phone_number.slice(-4)}` : "unknown",
    })) || [],
  });
}
