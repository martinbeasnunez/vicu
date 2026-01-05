import OpenAI from "openai";
import { LandingCopy } from "./experiment-store";
import { ExperimentType, SurfaceType } from "./experiment-helpers";

// Lazy initialization to avoid build-time errors in Vercel
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable.");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export interface AICopyResponse {
  title: string;
  subtitle: string;
  bullets: [string, string, string];
  placeholders: {
    name: string;
    email: string;
    message: string;
  };
  cta: string;
}

export interface BriefInfo {
  description: string;
  target_audience?: string;
  main_pain?: string;
  main_promise?: string;
  main_cta?: string;
}

export async function generateExternalCopyFromAI(
  brief: BriefInfo
): Promise<LandingCopy> {
  // Construir el prompt del usuario con la info del brief
  let userPrompt = `Proyecto: ${brief.description}`;

  if (brief.target_audience) {
    userPrompt += `\nAudiencia objetivo: ${brief.target_audience}`;
  }
  if (brief.main_pain) {
    userPrompt += `\nDolor principal del cliente: ${brief.main_pain}`;
  }
  if (brief.main_promise) {
    userPrompt += `\nPromesa principal: ${brief.main_promise}`;
  }
  if (brief.main_cta) {
    userPrompt += `\nAcción deseada: ${brief.main_cta}`;
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Eres un experto en marketing B2B y redacción de landings. Devuelves textos listos para una landing con formulario.

Usa la información del brief para crear textos persuasivos y específicos para la audiencia objetivo.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "title": "título principal de la landing (corto y directo)",
  "subtitle": "descripción corta del servicio/producto que aborde el dolor del cliente",
  "bullets": ["beneficio 1", "beneficio 2", "beneficio 3"],
  "placeholders": {
    "name": "placeholder para campo nombre",
    "email": "placeholder para campo email",
    "message": "placeholder para campo mensaje"
  },
  "cta": "texto del botón de acción (basado en la acción deseada)"
}`,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed: AICopyResponse = JSON.parse(content);

  return {
    titulo: parsed.title,
    subtitulo: parsed.subtitle,
    bullets: parsed.bullets,
    placeholders: {
      nombre: parsed.placeholders.name,
      email: parsed.placeholders.email,
      mensaje: parsed.placeholders.message,
    },
    boton: parsed.cta,
  };
}

// ============================================
// ATTACK PLAN GENERATION
// ============================================

export interface ExperimentBrief {
  title: string;
  description: string;
  experiment_type?: ExperimentType;
  surface_type?: SurfaceType;
  target_audience?: string;
  main_pain?: string;
  main_promise?: string;
  main_cta?: string;
  success_goal_number?: number;
  success_goal_unit?: string;
  deadline?: string; // ISO date string (YYYY-MM-DD)
}

export interface ActionItem {
  action_type: string;
  title: string;
  content: string;
  suggested_due_date?: string; // ISO date string (YYYY-MM-DD) - added after generation
}

export interface ChannelPlan {
  channel: string;
  actions: ActionItem[];
}

export interface AttackPlan {
  channels: ChannelPlan[];
}

// System prompts for each experiment type
const ATTACK_PLAN_PROMPTS: Record<ExperimentType, string> = {
  clientes: `Eres un experto en growth hacking y adquisición de primeros clientes para startups y proyectos nuevos.

Tu objetivo es crear un PLAN DE ATAQUE concreto y accionable para conseguir los primeros clientes o usuarios.

Reglas:
- Máximo 3 canales (elige los más relevantes para el proyecto).
- EXACTAMENTE 2 acciones por canal.
- Cada acción debe tener un texto/guion LISTO PARA COPIAR Y PEGAR.
- Los textos deben ser específicos para el proyecto, no genéricos.
- Prioriza acciones de bajo costo y alto impacto (outreach directo, redes sociales, etc.).
- El tono debe ser de VENTA: buscar que el prospecto contrate, compre o agende una demo.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "channels": [
    {
      "channel": "WhatsApp",
      "actions": [
        {
          "action_type": "mensaje_directo",
          "title": "Escribir a contactos que encajan con el perfil",
          "content": "Hola [nombre], ..."
        },
        {
          "action_type": "mensaje_directo",
          "title": "Otra acción de este canal",
          "content": "..."
        }
      ]
    }
  ]
}

Los canales pueden ser: WhatsApp, Email, LinkedIn, Twitter, Instagram, Facebook, Llamada, Evento, Referidos, u otros relevantes.`,

  validacion: `Eres un experto en validación de ideas y customer discovery para startups y proyectos nuevos.

Tu objetivo es crear un PLAN DE ATAQUE concreto y accionable para validar la idea con personas reales y obtener feedback.

Reglas:
- Máximo 3 canales (elige los más relevantes para el proyecto).
- EXACTAMENTE 2 acciones por canal.
- Cada acción debe tener un texto/guion LISTO PARA COPIAR Y PEGAR.
- Los textos deben ser específicos para el proyecto, no genéricos.
- El tono debe ser de CURIOSIDAD y APRENDIZAJE: buscar que la persona dé su opinión honesta, no venderle nada.
- Incluye preguntas abiertas que inviten al feedback.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "channels": [
    {
      "channel": "WhatsApp",
      "actions": [
        {
          "action_type": "mensaje_directo",
          "title": "Pedir feedback a contactos del perfil objetivo",
          "content": "Hola [nombre], estoy trabajando en algo y me encantaría tu opinión..."
        },
        {
          "action_type": "mensaje_directo",
          "title": "Otra acción de este canal",
          "content": "..."
        }
      ]
    }
  ]
}

Los canales pueden ser: WhatsApp, Email, LinkedIn, Twitter, Instagram, Facebook, Llamada, Evento, Formulario, u otros relevantes.`,

  equipo: `Eres un experto en comunicación interna y engagement de equipos y comunidades.

Tu objetivo es crear un PLAN DE ATAQUE concreto y accionable para mover a un equipo o comunidad hacia una acción específica.

Reglas:
- Máximo 3 canales (elige los más relevantes: canales internos de la empresa o comunidad).
- EXACTAMENTE 2 acciones por canal.
- Cada acción debe tener un texto/guion LISTO PARA COPIAR Y PEGAR.
- Los textos deben ser específicos para el proyecto, no genéricos.
- El tono debe ser COLABORATIVO y MOTIVADOR: inspirar participación sin ser autoritario.
- Usa un lenguaje de "nosotros" y apela a objetivos compartidos.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "channels": [
    {
      "channel": "Slack",
      "actions": [
        {
          "action_type": "mensaje_canal",
          "title": "Anunciar la iniciativa en el canal del equipo",
          "content": "¡Hola equipo! Quería compartirles algo en lo que estamos trabajando..."
        },
        {
          "action_type": "mensaje_directo",
          "title": "Otra acción de este canal",
          "content": "..."
        }
      ]
    }
  ]
}

Los canales pueden ser: Slack, Teams, Email interno, Reunión, Notion, WhatsApp grupal, u otros canales internos relevantes.`,
};

// Surface-specific prompt modifiers
const SURFACE_PROMPT_MODIFIERS: Record<SurfaceType, string> = {
  landing: `
CONTEXTO DE SUPERFICIE: Landing Page
- El experimento tiene una página pública donde las personas pueden apuntarse.
- Las acciones deben enfocarse en TRAER TRÁFICO a la landing.
- Cada mensaje debe incluir un llamado a acción que dirija a la landing.
- Menciona "visita nuestra página" o "regístrate aquí" cuando sea apropiado.`,

  messages: `
CONTEXTO DE SUPERFICIE: Pack de Mensajes
- NO hay landing. El experimento se basa en mensajes directos a contactos existentes.
- Las acciones deben ser mensajes LISTOS PARA ENVIAR por WhatsApp, email, DM, etc.
- El objetivo es obtener respuestas directas, no visitas a una página.
- Cada mensaje debe invitar a RESPONDER o ACTUAR directamente.
- Incluye instrucciones como "Envía este mensaje a 10 contactos" o "Comparte en tu grupo".`,

  ritual: `
CONTEXTO DE SUPERFICIE: Ritual / Proceso Recurrente
- Es un hábito o proceso que se debe hacer varias veces (diario, semanal, etc.).
- Las acciones deben ser TAREAS REPETIBLES con cadencia sugerida.
- Enfócate en checklist, recordatorios, y micro-compromisos.
- Incluye la frecuencia sugerida (ej: "Hacer esto cada día", "Revisar cada semana").
- Los textos deben ser cortos y orientados a la acción interna.`,
};

// Ritual-specific prompt for generating recurring actions
const RITUAL_PROMPT = `Eres un experto en diseño de hábitos y procesos recurrentes.

Tu objetivo es crear un RITUAL o PROCESO RECURRENTE concreto y accionable.

Reglas:
- Máximo 3 categorías de acciones (ej: "Diario", "Semanal", "Check-ins").
- EXACTAMENTE 2-3 acciones por categoría.
- Cada acción debe ser corta, clara y repetible.
- Incluye la FRECUENCIA sugerida (diario, semanal, al inicio de cada reunión, etc.).
- Los textos deben ser instrucciones simples, no mensajes para enviar.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "channels": [
    {
      "channel": "Diario",
      "actions": [
        {
          "action_type": "tarea_recurrente",
          "title": "Revisar progreso del experimento",
          "content": "Frecuencia: Cada día por la mañana\\n\\nAcción: Revisa las métricas del día anterior y anota 1 aprendizaje."
        }
      ]
    },
    {
      "channel": "Semanal",
      "actions": [...]
    }
  ]
}`;

export async function generateAttackPlanForExperiment(
  brief: ExperimentBrief
): Promise<AttackPlan> {
  const experimentType = brief.experiment_type || "clientes";
  const surfaceType = brief.surface_type || "landing";

  let userPrompt = `Proyecto: ${brief.title}
Descripción: ${brief.description}`;

  if (brief.target_audience) {
    userPrompt += `\nAudiencia objetivo: ${brief.target_audience}`;
  }
  if (brief.main_pain) {
    userPrompt += `\nDolor principal: ${brief.main_pain}`;
  }
  if (brief.main_promise) {
    userPrompt += `\nPromesa: ${brief.main_promise}`;
  }
  if (brief.main_cta) {
    userPrompt += `\nAcción deseada: ${brief.main_cta}`;
  }
  if (brief.success_goal_number && brief.success_goal_unit) {
    userPrompt += `\nMeta: ${brief.success_goal_number} ${brief.success_goal_unit}`;
  }

  // Use ritual-specific prompt or experiment type prompt with surface modifier
  let systemPrompt: string;
  if (surfaceType === "ritual") {
    systemPrompt = RITUAL_PROMPT;
  } else {
    systemPrompt = ATTACK_PLAN_PROMPTS[experimentType] + "\n\n" + SURFACE_PROMPT_MODIFIERS[surfaceType];
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed: AttackPlan = JSON.parse(content);
  return parsed;
}

// Generate additional actions for a specific channel
export async function generateMoreActionsForChannel(
  brief: ExperimentBrief,
  channel: string,
  existingActions: ActionItem[]
): Promise<ActionItem[]> {
  const experimentType = brief.experiment_type || "clientes";

  const toneInstructions: Record<ExperimentType, string> = {
    clientes: "El tono debe ser de VENTA: buscar que el prospecto contrate, compre o agende una demo.",
    validacion: "El tono debe ser de CURIOSIDAD y APRENDIZAJE: buscar feedback honesto, no vender.",
    equipo: "El tono debe ser COLABORATIVO y MOTIVADOR: inspirar participación sin ser autoritario.",
  };

  let userPrompt = `Proyecto: ${brief.title}
Descripción: ${brief.description}
Canal: ${channel}

Acciones existentes que NO debes repetir:
${existingActions.map((a, i) => `${i + 1}. ${a.title}`).join("\n")}`;

  if (brief.target_audience) {
    userPrompt += `\nAudiencia objetivo: ${brief.target_audience}`;
  }
  if (brief.main_promise) {
    userPrompt += `\nPromesa: ${brief.main_promise}`;
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Genera 2 acciones NUEVAS y DIFERENTES para el canal especificado.

${toneInstructions[experimentType]}

Reglas:
- Las acciones deben ser diferentes a las existentes.
- Cada acción debe tener un texto/guion LISTO PARA COPIAR Y PEGAR.
- Los textos deben ser específicos para el proyecto.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "actions": [
    {
      "action_type": "tipo_de_accion",
      "title": "Título de la acción",
      "content": "Texto listo para copiar..."
    },
    {
      "action_type": "tipo_de_accion",
      "title": "Título de la acción",
      "content": "Texto listo para copiar..."
    }
  ]
}`,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    temperature: 0.8,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed: { actions: ActionItem[] } = JSON.parse(content);
  return parsed.actions;
}

// ============================================
// SUGGESTED DUE DATES CALCULATION
// ============================================

/**
 * Distributes actions evenly between today and the deadline.
 * If no deadline is provided, uses a default range based on experiment type.
 */
export function calculateSuggestedDueDates(
  totalActions: number,
  deadline?: string,
  experimentType?: ExperimentType,
  surfaceType?: SurfaceType
): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let endDate: Date;

  if (deadline) {
    endDate = new Date(deadline);
  } else {
    // Default deadlines based on experiment/surface type
    const daysToAdd = getDefaultDaysForExperiment(experimentType, surfaceType);
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysToAdd);
  }

  // Ensure end date is at least 1 day after today
  if (endDate <= today) {
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);
  }

  const dates: string[] = [];
  const totalDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Distribute actions evenly across the time period
  // First few actions should be sooner (front-loaded)
  for (let i = 0; i < totalActions; i++) {
    // Use a slightly front-loaded distribution (actions earlier get closer dates)
    const progress = totalActions > 1 ? i / (totalActions - 1) : 0;
    // Square root to front-load (makes early actions earlier)
    const adjustedProgress = Math.sqrt(progress);
    const daysFromToday = Math.round(adjustedProgress * totalDays);

    const actionDate = new Date(today);
    actionDate.setDate(actionDate.getDate() + daysFromToday);

    dates.push(actionDate.toISOString().split("T")[0]);
  }

  return dates;
}

/**
 * Returns default number of days for an experiment based on its type.
 */
function getDefaultDaysForExperiment(
  experimentType?: ExperimentType,
  surfaceType?: SurfaceType
): number {
  // Rituals get a longer default (one full cycle)
  if (surfaceType === "ritual") {
    return 28; // 4 weeks
  }

  switch (experimentType) {
    case "validacion":
      return 10; // Quick validation cycles
    case "equipo":
      return 21; // Team initiatives need more time
    case "clientes":
    default:
      return 14; // 2 weeks for most experiments
  }
}

/**
 * Adds suggested due dates to an attack plan based on the deadline.
 */
export function addDueDatesToAttackPlan(
  attackPlan: AttackPlan,
  deadline?: string,
  experimentType?: ExperimentType,
  surfaceType?: SurfaceType
): AttackPlan {
  // Count total actions
  let totalActions = 0;
  for (const channel of attackPlan.channels) {
    totalActions += channel.actions.length;
  }

  // Generate dates for all actions
  const dueDates = calculateSuggestedDueDates(totalActions, deadline, experimentType, surfaceType);

  // Assign dates to actions
  let actionIndex = 0;
  for (const channel of attackPlan.channels) {
    for (const action of channel.actions) {
      action.suggested_due_date = dueDates[actionIndex];
      actionIndex++;
    }
  }

  return attackPlan;
}

// ============================================
// INITIAL STEPS GENERATION
// ============================================

export interface InitialStep {
  title: string;
  description: string;
  effort: "muy_pequeno" | "pequeno" | "medio";
}

/**
 * Generates 2-3 initial steps for a newly created objective based on its category, context and stage.
 * These steps help the user get started with their goal.
 */
// Situational context for smarter step generation (ALL categories)
interface SituationalContextInput {
  already_has?: string[];      // Things already in place
  already_doing?: string[];    // Actions already taking
  tools_in_use?: string[];     // Tools/platforms actively using
  current_level?: string;      // Where they are now
  previous_attempts?: string;  // What they've tried before
  // Business-specific
  is_operating?: boolean;
  has_customers?: boolean;
  market_stage?: string;
}

export async function generateInitialSteps(
  objective: {
    title: string;
    description: string;
    detected_category?: string | null;
    first_steps?: string[] | null;
    experiment_type?: string | null;
    surface_type?: string | null;
    for_stage?: string | null;
    situational_context?: SituationalContextInput | null;
    business_context?: SituationalContextInput | null; // Legacy support
  }
): Promise<InitialStep[]> {
  console.log("[generateInitialSteps] Called with:", {
    title: objective.title,
    description: objective.description?.substring(0, 100),
    detected_category: objective.detected_category,
    first_steps_count: objective.first_steps?.length || 0,
    for_stage: objective.for_stage,
  });

  // If we already have first_steps from the analysis, use those (only for initial "testing" stage)
  if (objective.first_steps && objective.first_steps.length > 0 && (!objective.for_stage || objective.for_stage === "testing")) {
    console.log("[generateInitialSteps] Using pre-analyzed first_steps:", objective.first_steps);
    return objective.first_steps.slice(0, 3).map((step, index) => ({
      title: step,
      description: `Acción concreta: ${step}`,
      effort: index === 0 ? "muy_pequeno" : "pequeno",
    }));
  }

  // Stage-specific guidance for step generation - MVP cycle states
  const stageGuidance: Record<string, string> = {
    queued: `ETAPA ACTUAL: Por empezar (queued)
Los pasos deben enfocarse en:
- Clarificar el objetivo y hacerlo específico
- Identificar el primer paso más pequeño posible
- Preparar lo mínimo necesario para empezar`,
    building: `ETAPA ACTUAL: Construyendo (building)
Los pasos deben enfocarse en:
- Crear la primera versión mínima viable (MVP)
- Quitar fricción y avanzar rápido
- No buscar perfección, buscar algo funcional`,
    testing: `ETAPA ACTUAL: Probando (testing)
Los pasos deben enfocarse en:
- Lanzar lo que construiste al mundo real
- Obtener feedback de personas reales
- Medir resultados concretos`,
    adjusting: `ETAPA ACTUAL: Ajustando (adjusting)
Los pasos deben enfocarse en:
- Analizar qué funcionó y qué no
- Hacer cambios específicos basados en datos
- Preparar la siguiente versión para probar`,
    achieved: `ETAPA ACTUAL: Logrado (achieved)
El objetivo se cumplió. No se necesitan más pasos.`,
    paused: `ETAPA ACTUAL: Pausado (paused)
Los pasos deben enfocarse en:
- Prepararse para retomar cuando sea el momento
- Mantener un recordatorio mínimo del objetivo`,
    discarded: `ETAPA ACTUAL: Descartado (discarded)
El objetivo fue descartado. No se necesitan más pasos.`,
  };

  const currentStage = objective.for_stage || "building";
  const stageContext = stageGuidance[currentStage] || stageGuidance.building;

  // Build situational context string (supports both new and legacy format)
  let situationalContextStr = "";
  const ctx = objective.situational_context || objective.business_context;
  if (ctx) {
    const parts: string[] = [];

    // New universal fields
    if (ctx.already_has && ctx.already_has.length > 0) {
      parts.push(`- YA TIENE: ${ctx.already_has.join(", ")}`);
    }
    if (ctx.already_doing && ctx.already_doing.length > 0) {
      parts.push(`- YA ESTÁ HACIENDO: ${ctx.already_doing.join(", ")}`);
    }
    if (ctx.tools_in_use && ctx.tools_in_use.length > 0) {
      parts.push(`- HERRAMIENTAS/APPS QUE USA: ${ctx.tools_in_use.join(", ")}`);
    }
    if (ctx.current_level) {
      parts.push(`- Nivel/situación actual: ${ctx.current_level}`);
    }
    if (ctx.previous_attempts) {
      parts.push(`- Intentos previos: ${ctx.previous_attempts}`);
    }

    // Business-specific fields
    if (ctx.is_operating) {
      parts.push("- El negocio YA ESTÁ OPERANDO (tiene producto/servicio activo)");
    }
    if (ctx.has_customers) {
      parts.push("- YA TIENE CLIENTES");
    }
    if (ctx.market_stage) {
      parts.push(`- Etapa del negocio: ${ctx.market_stage}`);
    }

    if (parts.length > 0) {
      situationalContextStr = `

CONTEXTO DEL USUARIO (MUY IMPORTANTE - NO IGNORAR):
${parts.join("\n")}

⚠️ REGLA CRÍTICA: NO recomiendes cosas que el usuario YA TIENE o YA HACE:
- Si tiene gym/app de ejercicio → NO recomiendes "busca un gimnasio" o "descarga app"
- Si tiene LinkedIn/CV actualizado → NO recomiendes "actualiza tu LinkedIn"
- Si tiene app/web/CRM → NO recomiendes "crea un formulario" o "haz una landing"
- Si ya hace ejercicio/estudia/etc → NO recomiendes "empieza a hacer X"
Los pasos deben USAR y MEJORAR lo que ya existe, no crear cosas redundantes.`;
    }
  }

  // Otherwise, generate contextual steps using AI
  const systemPrompt = `Eres Vicu, un asistente que ayuda a las personas a cumplir sus objetivos.

Tu tarea es generar 2-3 pasos iniciales MUY CONCRETOS y PEQUEÑOS para un objetivo.

${stageContext}${situationalContextStr}

REGLAS CRÍTICAS - LEE CON ATENCIÓN:

⚠️ RESPETA EL CONTEXTO DEL USUARIO LITERALMENTE:
- USA las palabras EXACTAS que el usuario escribió, NO las reinterpretes
- Si dice "hijo de 2 años" o "hijo de 2.5 años" → es un NIÑO PEQUEÑO (toddler), NO un bebé
- Si dice "hijo de 3 meses" → es un bebé
- NO asumas edades, etapas de desarrollo, ni situaciones que el usuario NO mencionó
- Si el usuario da un contexto específico, los pasos DEBEN reflejarlo exactamente
- NUNCA generalices cuando hay información específica disponible

REGLAS DE FORMATO:
1. Los pasos deben ser ACCIONES ESPECÍFICAS, no genéricos
2. El primer paso debe poder hacerse en menos de 5 minutos
3. Cada paso debe ser verificable (se puede decir "sí, lo hice" o "no")
4. Usa verbos de acción: "Escribe", "Define", "Busca", "Contacta", "Revisa", "Mide"
5. NO uses pasos como "Piensa en...", "Considera...", "Reflexiona..."
6. Los pasos deben ser coherentes con la etapa actual del objetivo
7. Si hay CONTEXTO DEL USUARIO, los pasos DEBEN adaptarse a lo que YA TIENE y YA HACE

Responde SOLO con JSON válido (sin markdown):
{
  "steps": [
    {"title": "Acción corta", "description": "Detalle opcional", "effort": "muy_pequeno"},
    {"title": "Segunda acción", "description": "Detalle", "effort": "pequeno"},
    {"title": "Tercera acción", "description": "Detalle", "effort": "pequeno"}
  ]
}

effort puede ser: "muy_pequeno" (~5 min), "pequeno" (~20 min), "medio" (~1 hora)`;

  const userPrompt = `Objetivo: ${objective.title}
Descripción: ${objective.description}
Categoría: ${objective.detected_category || "otro"}
Tipo: ${objective.experiment_type || "otro"}
Etapa: ${currentStage}`;

  try {
    console.log("[generateInitialSteps] Calling OpenAI API...");
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const content = completion.choices[0]?.message?.content;
    console.log("[generateInitialSteps] OpenAI response:", content?.substring(0, 200));

    if (!content) {
      console.log("[generateInitialSteps] No content from OpenAI, using defaults");
      const defaults = getDefaultSteps(objective.detected_category);
      console.log("[generateInitialSteps] Returning defaults:", defaults.map(s => s.title));
      return defaults;
    }

    const parsed = JSON.parse(content);
    const steps = parsed.steps.slice(0, 3);
    console.log("[generateInitialSteps] Parsed steps:", steps.map((s: InitialStep) => s.title));
    return steps;
  } catch (error) {
    console.error("[generateInitialSteps] Error calling OpenAI:", error);
    const defaults = getDefaultSteps(objective.detected_category);
    console.log("[generateInitialSteps] Returning defaults after error:", defaults.map(s => s.title));
    return defaults;
  }
}

/**
 * Returns default initial steps based on category when AI generation fails.
 */
function getDefaultSteps(category?: string | null): InitialStep[] {
  switch (category) {
    case "health":
      return [
        { title: "Define tu métrica principal (peso, días de ejercicio, etc.)", description: "Elige un número o indicador claro que puedas medir cada semana.", effort: "muy_pequeno" },
        { title: "Elige una acción mínima que puedas hacer hoy", description: "Busca algo tan pequeño que no haya excusa para no hacerlo.", effort: "muy_pequeno" },
        { title: "Programa un recordatorio para mañana", description: "Configura una alarma o notificación para no olvidar tu compromiso.", effort: "muy_pequeno" },
      ];
    case "business":
      return [
        { title: "Escribe en una frase a quién le vendes", description: "Define con claridad quién es tu cliente ideal en una sola oración.", effort: "muy_pequeno" },
        { title: "Haz una lista de 5 personas que podrían ser clientes", description: "Piensa en contactos reales que encajen con tu perfil de cliente.", effort: "pequeno" },
        { title: "Contacta a la primera persona de la lista", description: "Envía un mensaje corto presentando tu propuesta de valor.", effort: "pequeno" },
      ];
    case "learning":
      return [
        { title: "Define qué significa 'éxito' en este aprendizaje", description: "Escribe cómo sabrás que ya aprendiste lo que necesitas.", effort: "muy_pequeno" },
        { title: "Encuentra un recurso gratuito para empezar", description: "Busca un tutorial, curso o artículo que te introduzca al tema.", effort: "pequeno" },
        { title: "Dedica 15 minutos a explorar ese recurso", description: "Bloquea tiempo hoy para darle una primera mirada al material.", effort: "pequeno" },
      ];
    case "habits":
      return [
        { title: "Elige el momento exacto del día para tu hábito", description: "Define la hora y el contexto en que realizarás esta acción.", effort: "muy_pequeno" },
        { title: "Prepara lo que necesitas para hacerlo mañana", description: "Deja todo listo para que no haya fricción cuando llegue el momento.", effort: "muy_pequeno" },
        { title: "Hazlo una vez hoy, aunque sea en versión mínima", description: "Ejecuta una versión pequeña del hábito para romper la inercia.", effort: "pequeno" },
      ];
    default:
      return [
        { title: "Escribe el resultado que quieres lograr en una frase", description: "Define con claridad cuál es el resultado final que buscas.", effort: "muy_pequeno" },
        { title: "Identifica la primera acción concreta que puedes hacer", description: "Elige algo específico y alcanzable para empezar hoy mismo.", effort: "muy_pequeno" },
        { title: "Ejecuta esa primera acción hoy", description: "No lo dejes para después: hazlo ahora, aunque sea en versión mínima.", effort: "pequeno" },
      ];
  }
}
