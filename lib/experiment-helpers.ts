import { supabase } from "./supabase";

// Experiment type (the 3 main types)
export type ExperimentType = "clientes" | "validacion" | "equipo";

export const EXPERIMENT_TYPE_LABELS: Record<ExperimentType, string> = {
  clientes: "Conseguir clientes o usuarios",
  validacion: "Validar una idea con personas",
  equipo: "Mover a mi equipo o comunidad",
};

export const EXPERIMENT_TYPE_SHORT: Record<ExperimentType, string> = {
  clientes: "Clientes",
  validacion: "Validación",
  equipo: "Equipo",
};

export const EXPERIMENT_TYPE_CTA: Record<ExperimentType, string> = {
  clientes: "Quiero mi propuesta",
  validacion: "Quiero dar feedback",
  equipo: "Quiero participar",
};

// Surface type (where the experiment happens)
export type SurfaceType = "landing" | "messages" | "ritual";

export const SURFACE_TYPE_LABELS: Record<SurfaceType, string> = {
  landing: "Landing",
  messages: "Mensajes",
  ritual: "Ritual",
};

export const SURFACE_TYPE_DESCRIPTIONS: Record<SurfaceType, { title: string; subtitle: string }> = {
  landing: {
    title: "Con gente nueva",
    subtitle: "Necesito una página para que se apunten",
  },
  messages: {
    title: "Con gente que ya tengo",
    subtitle: "Lista de WhatsApp, email, equipo, comunidad",
  },
  ritual: {
    title: "Es algo recurrente",
    subtitle: "Un reto, un hábito, un proceso que debemos hacer varias veces",
  },
};

export const SURFACE_TYPE_COLORS: Record<SurfaceType, { bg: string; text: string }> = {
  landing: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400" },
  messages: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-700 dark:text-cyan-400" },
  ritual: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400" },
};

// Check-in cadence types
export type CheckinCadence = "daily" | "twice_weekly" | "weekly";

export const CHECKIN_CADENCE_LABELS: Record<CheckinCadence, string> = {
  daily: "Diario",
  twice_weekly: "2-3x por semana",
  weekly: "Semanal",
};

// ============================================
// RHYTHM / CADENCE SYSTEM
// ============================================

export type ActionCadence = "daily" | "2-3/week" | "weekly";
export type MetricsCadence = "daily" | "2-3/week" | "weekly" | "none";

export const ACTION_CADENCE_LABELS: Record<ActionCadence, string> = {
  daily: "Diario",
  "2-3/week": "2-3x por semana",
  weekly: "Semanal",
};

export const METRICS_CADENCE_LABELS: Record<MetricsCadence, string> = {
  daily: "Diario",
  "2-3/week": "2-3x por semana",
  weekly: "Semanal",
  none: "Sin métricas",
};

export interface ExperimentRhythm {
  action_cadence: ActionCadence;
  metrics_cadence: MetricsCadence;
  decision_cadence_days: number;
}

export type EffortLevel = "low" | "medium" | "high";

/**
 * Estimates effort level based on experiment characteristics.
 * This is a heuristic based on surface type and context.
 */
export function estimateEffortLevel(
  surfaceType: SurfaceType,
  context?: string,
  totalActions?: number
): EffortLevel {
  // If we have action count, use it as a signal
  if (totalActions !== undefined) {
    if (totalActions <= 3) return "low";
    if (totalActions <= 7) return "medium";
    return "high";
  }

  // Heuristics based on surface type
  if (surfaceType === "ritual") {
    // Rituals vary - assume medium unless context says otherwise
    return context === "personal" ? "low" : "medium";
  }

  if (surfaceType === "messages") {
    // Messages typically medium effort
    return "medium";
  }

  // Landing pages are usually higher effort
  return "high";
}

/**
 * Computes the default rhythm for an experiment based on its characteristics.
 *
 * Heuristics:
 * - Ritual (personal): action_cadence based on effort, metrics_cadence = none, decision = 28 days
 * - Ritual (business/team): action_cadence = 2-3/week, metrics_cadence = weekly, decision = 28 days
 * - Landing: action_cadence = 2-3/week, metrics_cadence = 2-3/week, decision = 14 days
 * - Messages: action_cadence = weekly, metrics_cadence = weekly, decision = 14 days
 */
export function computeDefaultRhythm(experiment: {
  surface_type?: SurfaceType | null;
  context?: string | null;
  experiment_type?: string | null;
  total_actions?: number;
}): ExperimentRhythm {
  const surfaceType = experiment.surface_type || "ritual";
  const context = experiment.context || "personal";
  const effortLevel = estimateEffortLevel(surfaceType, context, experiment.total_actions);

  // Default values
  let action_cadence: ActionCadence = "2-3/week";
  let metrics_cadence: MetricsCadence = "weekly";
  let decision_cadence_days = 14;

  if (surfaceType === "ritual") {
    // Rituals: decision point at 28 days
    decision_cadence_days = 28;

    if (context === "personal") {
      // Personal rituals: effort-based action cadence, no metrics
      action_cadence = effortLevel === "low" ? "daily" : effortLevel === "medium" ? "2-3/week" : "weekly";
      metrics_cadence = "none";
    } else {
      // Business/team rituals
      action_cadence = "2-3/week";
      metrics_cadence = "weekly";
    }
  } else if (surfaceType === "landing") {
    // Landing pages: focus on traffic and conversion
    action_cadence = "2-3/week";
    metrics_cadence = "2-3/week";
    decision_cadence_days = 14;
  } else if (surfaceType === "messages") {
    // Messages: weekly rhythm
    action_cadence = "weekly";
    metrics_cadence = "weekly";
    decision_cadence_days = 14;
  }

  return {
    action_cadence,
    metrics_cadence,
    decision_cadence_days,
  };
}

/**
 * Returns human-readable description of the rhythm.
 */
export function formatRhythmDescription(rhythm: ExperimentRhythm): string {
  const actionText = ACTION_CADENCE_LABELS[rhythm.action_cadence];
  const metricsText = rhythm.metrics_cadence !== "none"
    ? `Revisar métricas ${METRICS_CADENCE_LABELS[rhythm.metrics_cadence].toLowerCase()}`
    : "";
  const decisionText = `Decidir cada ${rhythm.decision_cadence_days} días`;

  const parts = [`Ejecutar ${actionText.toLowerCase()}`];
  if (metricsText) parts.push(metricsText);
  parts.push(decisionText);

  return parts.join(" · ");
}

/**
 * Calculates the suggested check-in cadence based on experiment metadata
 */
export function calculateSuggestedCadence(
  surfaceType: SurfaceType,
  status: ExperimentStatus,
  deadline: string | null
): CheckinCadence {
  // Calculate days until deadline
  let daysUntilDeadline = 30; // Default if no deadline
  if (deadline) {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    daysUntilDeadline = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Ritual / personal experiments
  if (surfaceType === "ritual") {
    if (daysUntilDeadline <= 14) return "daily";
    if (daysUntilDeadline <= 60) return "twice_weekly";
    return "weekly";
  }

  // Landing experiments (client acquisition)
  if (surfaceType === "landing") {
    if (status === "building" || status === "testing") return "twice_weekly";
    if (status === "adjusting") return "weekly";
    return "twice_weekly";
  }

  // Messages experiments
  if (surfaceType === "messages") {
    if (daysUntilDeadline <= 14) return "twice_weekly";
    return "weekly";
  }

  return "twice_weekly";
}

// Status types - MVP cycle states
export type ExperimentStatus = "queued" | "building" | "testing" | "adjusting" | "achieved" | "paused" | "discarded";

export const STATUS_LABELS: Record<ExperimentStatus, string> = {
  queued: "Por empezar",
  building: "Construyendo",
  testing: "Probando",
  adjusting: "Ajustando",
  achieved: "Logrado",
  paused: "Pausado",
  discarded: "Descartado",
};

export const STATUS_COLORS: Record<ExperimentStatus, { bg: string; text: string }> = {
  queued: { bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-400" },
  building: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  testing: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400" },
  adjusting: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  achieved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  paused: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
  discarded: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
};

// Metrics types
export interface ExperimentMetrics {
  visits: number;
  leads: number;
  conversion: number;
  totalActions: number;
  doneActions: number;
}

// Recommendation types - legacy tags for backward compatibility
export type RecommendationTag =
  | "keep_building"
  | "ready_to_test"
  | "keep_testing"
  | "adjust"
  | "achieved"
  | "pause"
  | "discard"
  | "no_data";

export interface VicuRecommendation {
  tag: RecommendationTag;
  tagLabel: string;
  title: string;
  text: string;
  color: { bg: string; text: string };
  steps?: string[]; // 1-3 actionable next steps
}

const RECOMMENDATION_COLORS: Record<RecommendationTag, { bg: string; text: string }> = {
  keep_building: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  ready_to_test: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400" },
  keep_testing: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400" },
  adjust: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  achieved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  pause: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
  discard: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
  no_data: { bg: "bg-zinc-100 dark:bg-zinc-800", text: "text-zinc-600 dark:text-zinc-400" },
};

// Fetch metrics for a single experiment
export async function fetchExperimentMetrics(experimentId: string): Promise<ExperimentMetrics> {
  const [visitsResult, leadsResult, actionsResult] = await Promise.all([
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("experiment_id", experimentId)
      .eq("type", "visit"),
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("experiment_id", experimentId)
      .eq("type", "form_submit"),
    supabase
      .from("experiment_actions")
      .select("status")
      .eq("experiment_id", experimentId),
  ]);

  const visits = visitsResult.count || 0;
  const leads = leadsResult.count || 0;
  const conversion = visits > 0 ? leads / visits : 0;

  const actions = actionsResult.data || [];
  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.status === "done").length;

  return { visits, leads, conversion, totalActions, doneActions };
}

// Fetch metrics for multiple experiments (batch)
export async function fetchAllExperimentsMetrics(
  experimentIds: string[]
): Promise<Record<string, ExperimentMetrics>> {
  if (experimentIds.length === 0) return {};

  const [visitsResult, leadsResult, actionsResult] = await Promise.all([
    supabase
      .from("events")
      .select("experiment_id")
      .in("experiment_id", experimentIds)
      .eq("type", "visit"),
    supabase
      .from("events")
      .select("experiment_id")
      .in("experiment_id", experimentIds)
      .eq("type", "form_submit"),
    supabase
      .from("experiment_actions")
      .select("experiment_id, status")
      .in("experiment_id", experimentIds),
  ]);

  const visitsData = visitsResult.data || [];
  const leadsData = leadsResult.data || [];
  const actionsData = actionsResult.data || [];

  const visitsByExp: Record<string, number> = {};
  const leadsByExp: Record<string, number> = {};
  const actionsByExp: Record<string, { total: number; done: number }> = {};

  for (const v of visitsData) {
    visitsByExp[v.experiment_id] = (visitsByExp[v.experiment_id] || 0) + 1;
  }

  for (const l of leadsData) {
    leadsByExp[l.experiment_id] = (leadsByExp[l.experiment_id] || 0) + 1;
  }

  for (const a of actionsData) {
    if (!actionsByExp[a.experiment_id]) {
      actionsByExp[a.experiment_id] = { total: 0, done: 0 };
    }
    actionsByExp[a.experiment_id].total++;
    if (a.status === "done") {
      actionsByExp[a.experiment_id].done++;
    }
  }

  const result: Record<string, ExperimentMetrics> = {};
  for (const id of experimentIds) {
    const visits = visitsByExp[id] || 0;
    const leads = leadsByExp[id] || 0;
    const actions = actionsByExp[id] || { total: 0, done: 0 };

    result[id] = {
      visits,
      leads,
      conversion: visits > 0 ? leads / visits : 0,
      totalActions: actions.total,
      doneActions: actions.done,
    };
  }

  return result;
}

// Self-result type for non-landing experiments
export type SelfResult = "alto" | "medio" | "bajo" | null;

export const SELF_RESULT_LABELS: Record<string, string> = {
  alto: "Alto impacto",
  medio: "Impacto medio",
  bajo: "Bajo impacto",
};

// Calculate vicu recommendation for LANDING experiments
export function calculateLandingRecommendation(
  metrics: ExperimentMetrics
): VicuRecommendation {
  const { visits, leads, totalActions, doneActions } = metrics;
  const ratio = totalActions > 0 ? doneActions / totalActions : 0;
  const conversion = visits > 0 ? leads / visits : 0;
  const conversionPercent = (conversion * 100).toFixed(1);
  const pendingActions = totalActions - doneActions;

  // Rule 1: Not enough actions executed or very low traffic
  if (ratio < 0.5 || visits < 10) {
    const steps: string[] = [];
    if (doneActions === 0) {
      steps.push("Completa al menos 1 acción del plan hoy");
    } else if (ratio < 0.5) {
      steps.push(`Completa ${Math.ceil(totalActions * 0.5) - doneActions} acciones más`);
    }
    if (visits < 10) {
      steps.push("Comparte tu landing en 2-3 canales distintos");
    }
    steps.push("Revisa las métricas mañana");

    return {
      tag: "keep_building",
      tagLabel: "Seguir construyendo",
      title: "Sigue ejecutando el plan de ataque.",
      text: `Has completado ${doneActions}/${totalActions} acciones y tienes ${visits} visitas.`,
      color: RECOMMENDATION_COLORS.keep_building,
      steps,
    };
  }

  // Rule 2: Plan completed but very low traffic - need more execution
  if (ratio === 1 && visits < 10) {
    return {
      tag: "keep_testing",
      tagLabel: "Traer más tráfico",
      title: "Plan completado, pero falta tráfico.",
      text: `Solo tienes ${visits} visitas. Necesitas más datos.`,
      color: RECOMMENDATION_COLORS.keep_testing,
      steps: [
        "Repite las acciones que mejor funcionaron",
        "Prueba un canal nuevo que no hayas usado",
        "Espera a tener 10-20 visitas antes de decidir",
      ],
    };
  }

  // Rule 3: Have enough data (ratio >= 0.5 AND visits >= 10)
  // Now evaluate based on conversion
  if (conversion >= 0.15 && leads >= 5) {
    return {
      tag: "achieved",
      tagLabel: "Logrado",
      title: "Este objetivo tiene tracción.",
      text: `Conversión de ${conversionPercent}% con ${leads} leads.`,
      color: RECOMMENDATION_COLORS.achieved,
      steps: [
        "Duplica el esfuerzo en el canal que más convirtió",
        "Contacta a tus leads en las próximas 24h",
        "Considera marcar el objetivo como 'Logrado'",
      ],
    };
  }

  if (conversion >= 0.05) {
    return {
      tag: "adjust",
      tagLabel: "Ajustando",
      title: "Conversión media, hay potencial.",
      text: `Conversión de ${conversionPercent}% con ${leads} leads.`,
      color: RECOMMENDATION_COLORS.adjust,
      steps: [
        "Revisa si tu promesa es lo suficientemente clara",
        "Prueba un CTA diferente en tu landing",
        "Corre otra ronda de tráfico con el nuevo copy",
      ],
    };
  }

  // Low conversion
  return {
    tag: "pause",
    tagLabel: "Pausar",
    title: "Conversión baja, considera replantear.",
    text: `Solo ${conversionPercent}% de conversión tras ${visits} visitas.`,
    color: RECOMMENDATION_COLORS.pause,
    steps: [
      "Habla con 3 personas de tu audiencia objetivo",
      "Pregunta si la promesa les parece atractiva",
      "Replantea la propuesta antes de invertir más",
    ],
  };
}

// Calculate vicu recommendation for NON-LANDING experiments (messages, ritual)
export function calculateNonLandingRecommendation(
  metrics: ExperimentMetrics,
  selfResult: SelfResult
): VicuRecommendation {
  const { totalActions, doneActions } = metrics;
  const ratio = totalActions > 0 ? doneActions / totalActions : 0;
  const pendingActions = totalActions - doneActions;

  // Rule 1: Less than half completed
  if (ratio < 0.5) {
    return {
      tag: "keep_building",
      tagLabel: "Seguir construyendo",
      title: "Sigue ejecutando el plan.",
      text: `Has ejecutado ${doneActions}/${totalActions} acciones.`,
      color: RECOMMENDATION_COLORS.keep_building,
      steps: [
        `Completa ${Math.ceil(totalActions * 0.5) - doneActions} acciones más`,
        "Dedica 15-30 minutos hoy a ejecutar",
        "Marca las acciones como 'Hecho' cuando termines",
      ],
    };
  }

  // Rule 2: More than half but not complete
  if (ratio < 1) {
    return {
      tag: "keep_building",
      tagLabel: "Seguir construyendo",
      title: "Ya probaste varias acciones.",
      text: `Te faltan ${pendingActions} acciones para completar el plan.`,
      color: RECOMMENDATION_COLORS.keep_building,
      steps: [
        `Completa las ${pendingActions} acciones restantes`,
        "Evalúa cómo te sientes con los resultados",
        "Indica tu evaluación cuando termines",
      ],
    };
  }

  // Rule 3: Plan completed - check self result
  if (!selfResult) {
    return {
      tag: "no_data",
      tagLabel: "Evalúa tu resultado",
      title: "Plan completado. ¿Cómo te fue?",
      text: "Indica tu percepción del resultado para obtener una recomendación.",
      color: RECOMMENDATION_COLORS.no_data,
      steps: [
        "Reflexiona: ¿lograste lo que querías?",
        "Selecciona Alto/Medio/Bajo impacto arriba",
        "Vicu te dará el siguiente paso",
      ],
    };
  }

  // Based on self result
  switch (selfResult) {
    case "alto":
      return {
        tag: "achieved",
        tagLabel: "Logrado",
        title: "Excelente resultado. Considera marcarlo como logrado.",
        text: "El objetivo tuvo alto impacto.",
        color: RECOMMENDATION_COLORS.achieved,
        steps: [
          "Documenta qué funcionó mejor",
          "Repite el proceso con más personas",
          "Considera crear un sistema para hacerlo recurrente",
        ],
      };
    case "medio":
      return {
        tag: "adjust",
        tagLabel: "Ajustando",
        title: "Resultado medio. Hay oportunidad de mejora.",
        text: "Hay potencial, pero se puede mejorar.",
        color: RECOMMENDATION_COLORS.adjust,
        steps: [
          "Identifica qué acciones tuvieron mejor respuesta",
          "Ajusta el mensaje o enfoque",
          "Corre otra ronda con las mejoras",
        ],
      };
    case "bajo":
      return {
        tag: "pause",
        tagLabel: "Pausar",
        title: "Resultado bajo. Considera cambiar de enfoque.",
        text: "El objetivo no dio los resultados esperados.",
        color: RECOMMENDATION_COLORS.pause,
        steps: [
          "Pregunta a 2-3 personas por qué no funcionó",
          "Considera si el problema era el formato o el contenido",
          "Prueba algo completamente diferente",
        ],
      };
  }
}

// Main function that routes to the appropriate recommendation logic
export function calculateRecommendation(
  metrics: ExperimentMetrics,
  surfaceType: SurfaceType = "landing",
  selfResult: SelfResult = null,
  rhythm?: ExperimentRhythm | null,
  experimentCreatedAt?: string | null
): VicuRecommendation {
  // Calculate days since experiment started
  let daysSinceStart = 0;
  if (experimentCreatedAt) {
    const startDate = new Date(experimentCreatedAt);
    const today = new Date();
    daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Check if we've reached the decision point
  const decisionDays = rhythm?.decision_cadence_days || (surfaceType === "ritual" ? 28 : 14);
  const isDecisionTime = daysSinceStart >= decisionDays;

  if (surfaceType === "landing") {
    const baseRecommendation = calculateLandingRecommendation(metrics);

    // If decision time has come and we're still in "keep_building" or "keep_testing", nudge to decide
    if (isDecisionTime && (baseRecommendation.tag === "keep_building" || baseRecommendation.tag === "keep_testing")) {
      return {
        ...baseRecommendation,
        title: `Han pasado ${decisionDays} días. Es momento de decidir.`,
        text: baseRecommendation.text,
        steps: [
          "Revisa los datos que tienes hasta ahora",
          "Decide si seguir en marcha, ajustar el enfoque o poner en pausa",
          "Si los resultados no son claros, considera otro ciclo de " + decisionDays + " días",
        ],
      };
    }

    return baseRecommendation;
  }

  const baseRecommendation = calculateNonLandingRecommendation(metrics, selfResult);

  // For rituals/messages, if decision time has come, encourage evaluation
  if (isDecisionTime && baseRecommendation.tag === "keep_building") {
    return {
      ...baseRecommendation,
      title: `Han pasado ${decisionDays} días. Evalúa tu progreso.`,
      steps: [
        "Reflexiona: ¿estás viendo los resultados esperados?",
        "Completa las acciones pendientes si puedes",
        "Indica tu evaluación para continuar",
      ],
    };
  }

  return baseRecommendation;
}

/**
 * Returns the next action reminder based on rhythm.
 * Useful for notifications or dashboard display.
 */
export function getNextActionReminder(
  rhythm: ExperimentRhythm,
  lastActionDate?: string | null
): { message: string; urgency: "low" | "medium" | "high" } {
  if (!lastActionDate) {
    return {
      message: "Aún no has ejecutado ninguna acción. ¡Empieza hoy!",
      urgency: "high",
    };
  }

  const lastDate = new Date(lastActionDate);
  const today = new Date();
  const daysSinceLastAction = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  // Determine expected days between actions based on cadence
  let expectedDays: number;
  switch (rhythm.action_cadence) {
    case "daily":
      expectedDays = 1;
      break;
    case "2-3/week":
      expectedDays = 3;
      break;
    case "weekly":
      expectedDays = 7;
      break;
    default:
      expectedDays = 3;
  }

  if (daysSinceLastAction === 0) {
    return {
      message: "¡Buen trabajo hoy! Descansa y vuelve mañana.",
      urgency: "low",
    };
  }

  if (daysSinceLastAction < expectedDays) {
    const daysLeft = expectedDays - daysSinceLastAction;
    return {
      message: `Tu próxima acción es en ${daysLeft} día${daysLeft > 1 ? "s" : ""}.`,
      urgency: "low",
    };
  }

  if (daysSinceLastAction === expectedDays) {
    return {
      message: "Hoy toca ejecutar. ¿Qué acción harás?",
      urgency: "medium",
    };
  }

  // Overdue
  const overdueDays = daysSinceLastAction - expectedDays;
  return {
    message: `Llevas ${overdueDays} día${overdueDays > 1 ? "s" : ""} sin ejecutar. Retoma el ritmo.`,
    urgency: "high",
  };
}

// Update experiment status
export async function updateExperimentStatus(
  experimentId: string,
  status: ExperimentStatus
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("experiments")
    .update({ status })
    .eq("id", experimentId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ============================================
// PROGRESS MESSAGE HELPERS
// ============================================

export type ActionStatus = "pending" | "in_progress" | "done" | "blocked";

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  done: "Hecha",
  blocked: "Bloqueada",
};

export interface ProgressInfo {
  done: number;
  total: number;
  ratio: number;
  message: string;
}

/**
 * Calculates progress and returns the appropriate message based on ratio.
 * Now includes dynamic numbers in the messages.
 */
export function getProgressMessage(doneActions: number, totalActions: number): ProgressInfo {
  const ratio = totalActions > 0 ? doneActions / totalActions : 0;

  let message: string;

  if (doneActions === 0) {
    message = "Aún no empiezas el plan. Ejecuta al menos 1 acción para tener primeras señales.";
  } else if (ratio < 0.5) {
    message = `Has ejecutado ${doneActions}/${totalActions} acciones. Completa al menos la mitad del plan antes de tomar una decisión.`;
  } else if (ratio < 1) {
    message = `Ya probaste varias acciones (${doneActions}/${totalActions}). Termina el plan para poder evaluarlo bien.`;
  } else {
    message = "Plan completado. Usa la recomendación de Vicu para decidir si seguir en marcha, ajustar el enfoque o poner en pausa este objetivo.";
  }

  return {
    done: doneActions,
    total: totalActions,
    ratio,
    message,
  };
}

/**
 * Formats a date string for display.
 * Returns "hoy", "mañana", "esta semana", or the formatted date.
 */
export function formatSuggestedDate(dateString: string | null): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - today.getDay()));

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) {
    return "hoy";
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return "mañana";
  } else if (dateOnly <= endOfWeek) {
    return "esta semana";
  } else {
    // Format as "15 dic" or "15 ene"
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }
}

/**
 * Formats a deadline for display with source indicator.
 * Uses short format like "21 Dic" for compact display.
 */
export function formatDeadline(
  deadline: string | null,
  source: "user" | "ai_suggested" | null
): { text: string; textShort: string; subtext: string } | null {
  if (!deadline) return null;

  const date = new Date(deadline);
  const monthsShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const monthsLong = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const textShort = `${date.getDate()} ${monthsShort[date.getMonth()]}`;
  const text = `${date.getDate()} de ${monthsLong[date.getMonth()]}`;
  const subtext = source === "ai_suggested" ? "(sugerido por Vicu)" : "";

  return { text, textShort, subtext };
}
