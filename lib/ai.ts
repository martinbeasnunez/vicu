import OpenAI from "openai";
import { LandingCopy } from "./experiment-store";
import { ExperimentType, SurfaceType } from "./experiment-helpers";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  const completion = await openai.chat.completions.create({
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

  const completion = await openai.chat.completions.create({
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

  const completion = await openai.chat.completions.create({
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
