import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Lazy initialization to avoid build-time errors in Vercel
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

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

export type CurrentState = "not_started" | "stuck" | "going_well";
export type EffortLevel = "muy_pequeno" | "pequeno" | "medio";

export interface NextStepRequest {
  experiment_id: string;
  current_state: CurrentState;
  // Optional: previous step title to avoid repeating when user clicks "Otra idea"
  previous_step_title?: string;
}

export interface NextStepResponse {
  next_step_title: string;
  next_step_description: string;
  effort: EffortLevel;
}

// Spanish labels for states
const STATE_LABELS: Record<CurrentState, string> = {
  not_started: "No he empezado aún",
  stuck: "Hice algo pero me trabé",
  going_well: "Voy bien, quiero seguir empujando",
};

// Effort labels in Spanish
const EFFORT_LABELS: Record<EffortLevel, string> = {
  muy_pequeno: "muy pequeño (5 min)",
  pequeno: "pequeño (15-30 min)",
  medio: "medio (1-2 horas)",
};

export async function POST(request: NextRequest) {
  try {
    const body: NextStepRequest = await request.json();
    const { experiment_id, current_state, previous_step_title } = body;

    if (!experiment_id || !current_state) {
      return NextResponse.json(
        { error: "Missing required fields: experiment_id and current_state" },
        { status: 400 }
      );
    }

    // Fetch experiment data
    const { data: experiment, error: expError } = await getSupabase()
      .from("experiments")
      .select("*")
      .eq("id", experiment_id)
      .single();

    if (expError || !experiment) {
      return NextResponse.json(
        { error: "Experiment not found" },
        { status: 404 }
      );
    }

    // Fetch existing actions for context
    const { data: actions } = await getSupabase()
      .from("actions")
      .select("title, content, action_type, is_done")
      .eq("experiment_id", experiment_id)
      .order("created_at", { ascending: true });

    // Build context for the AI
    const completedActions = actions?.filter((a) => a.is_done) || [];
    const pendingActions = actions?.filter((a) => !a.is_done) || [];

    let projectContext = `Proyecto: ${experiment.title}
Descripción: ${experiment.description || "Sin descripción"}`;

    if (experiment.target_audience) {
      projectContext += `\nAudiencia: ${experiment.target_audience}`;
    }
    if (experiment.main_pain) {
      projectContext += `\nDolor principal: ${experiment.main_pain}`;
    }
    if (experiment.main_promise) {
      projectContext += `\nPromesa: ${experiment.main_promise}`;
    }
    if (experiment.success_goal_number && experiment.success_goal_unit) {
      projectContext += `\nMeta: ${experiment.success_goal_number} ${experiment.success_goal_unit}`;
    }
    if (experiment.deadline) {
      const deadline = new Date(experiment.deadline);
      const today = new Date();
      const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      projectContext += `\nDeadline: ${experiment.deadline} (${daysLeft > 0 ? `quedan ${daysLeft} días` : "vencido"})`;
    }

    if (completedActions.length > 0) {
      projectContext += `\n\nAcciones YA completadas (${completedActions.length}):
${completedActions.map((a) => `- ${a.title}`).join("\n")}`;
    }

    if (pendingActions.length > 0) {
      projectContext += `\n\nAcciones pendientes definidas (${pendingActions.length}):
${pendingActions.map((a) => `- ${a.title}`).join("\n")}`;
    }

    // State-specific instructions - CADA MOOD GENERA UN TIPO DE PASO MUY DIFERENTE
    const stateInstructions: Record<CurrentState, string> = {
      not_started: `ESTADO ACTUAL: NO HA EMPEZADO (mood = 'not_started')
El usuario no ha dado ningún paso hoy. Tiene fricción para empezar.

TU OBJETIVO: Proponer un MICRO-PASO DE ARRANQUE que baje la barrera de entrada al mínimo.
- Debe poder completarse en 5-10 minutos MÁXIMO
- Debe ser tan pequeño que sea casi imposible decir "no"
- NO propongas tareas de planificación o reflexión (eso aumenta la parálisis)
- Propón una ACCIÓN FÍSICA CONCRETA e inmediata

EJEMPLOS DE PASOS DE ARRANQUE:
- "Abre el archivo X y escribe la primera frase"
- "Envía un mensaje de WhatsApp de 2 líneas a 1 contacto"
- "Haz una lista de 3 nombres en un post-it"
- "Pon un timer de 5 minutos y escribe lo primero que se te ocurra"

ESFUERZO OBLIGATORIO: "muy_pequeno" (5-10 min)`,

      stuck: `ESTADO ACTUAL: SE TRABÓ (mood = 'stuck')
El usuario empezó pero se bloqueó. Siente frustración o confusión.

TU OBJETIVO: Proponer un PASO DE DESBLOQUEO que cambie la perspectiva o simplifique el problema.
- NO propongas "seguir con lo que estabas haciendo" (eso lo tiene trabado)
- Propón un CAMBIO DE ÁNGULO: preguntar a alguien, simplificar drásticamente, o tomar una pausa activa
- Puede tomar 15-30 minutos
- El tono debe ser de ALIVIO, no de más presión

EJEMPLOS DE PASOS DE DESBLOQUEO:
- "Escribe en 2 líneas qué te tiene trabado y envíalo a un amigo/mentor"
- "Haz la versión más fea y rápida posible, sin juzgarla"
- "Divide el problema en 3 partes y elige solo UNA para hoy"
- "Sal a caminar 10 minutos y luego escribe qué se te ocurrió"
- "Busca 1 ejemplo de alguien que resolvió algo similar"

ESFUERZO RECOMENDADO: "pequeno" (15-30 min)`,

      going_well: `ESTADO ACTUAL: VA BIEN (mood = 'going_well')
El usuario tiene momentum y quiere aprovecharlo.

TU OBJETIVO: Proponer un PASO DE CONSOLIDACIÓN o SUBIDA que capitalice la energía.
- Puede ser un paso más grande (hasta 1-2 horas) si tiene sentido
- El objetivo es que termine el día con un AVANCE TANGIBLE y visible
- Propón algo que se pueda "mostrar" o "entregar" al final del día
- Busca cerrar un ciclo o completar una entrega concreta

EJEMPLOS DE PASOS DE CONSOLIDACIÓN:
- "Termina la sección X y envíala para feedback"
- "Contacta a los 5 prospectos que tienes pendientes"
- "Completa el prototipo funcional de la primera versión"
- "Publica el primer borrador aunque no esté perfecto"
- "Agenda 3 llamadas para esta semana"

ESFUERZO RECOMENDADO: "medio" (1-2 horas) o "pequeno" si el proyecto es más simple`,
    };

    const systemPrompt = `Eres Vicu, un asistente estratégico que ayuda a emprendedores a mover sus proyectos día a día.

Tu rol es proponer UN SOLO paso concreto y accionable basado en el contexto del proyecto y el ESTADO ACTUAL (mood) del usuario.

REGLA CRÍTICA: Genera un paso CLARAMENTE DISTINTO según el estado (mood) del usuario.
El tipo de paso DEBE cambiar según si el usuario "no ha empezado", "se trabó" o "va bien".

${stateInstructions[current_state]}

REGLAS ADICIONALES:
- El paso debe ser ESPECÍFICO para este proyecto, no genérico.
- Usa verbos de acción claros (Escribe, Envía, Llama, Crea, etc.).
- La descripción debe dar contexto suficiente para que el usuario sepa exactamente qué hacer.
- NO propongas cosas que el usuario ya completó.
- Si hay acciones pendientes definidas, puedes sugerir empezar con una de ellas o algo relacionado.
- Si se te indica un "paso anterior a evitar", propón algo DIFERENTE en enfoque y acción.
- SIEMPRE incluye una descripción de 1-2 oraciones que dé contexto específico.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "next_step_title": "Título corto del paso (máximo 60 caracteres)",
  "next_step_description": "Descripción de 1-2 oraciones con contexto específico del proyecto",
  "effort": "muy_pequeno" | "pequeno" | "medio"
}

Donde effort es:
- "muy_pequeno": 5-10 minutos (para mood = not_started)
- "pequeno": 15-30 minutos (para mood = stuck)
- "medio": 1-2 horas (para mood = going_well)`;

    // Build user prompt, including previous step to avoid if provided (for "Otra idea" feature)
    let userPrompt = `${projectContext}

Estado actual del usuario: ${STATE_LABELS[current_state]}`;

    if (previous_step_title) {
      userPrompt += `

PASO ANTERIOR A EVITAR (el usuario pidió otra idea diferente):
"${previous_step_title}"
Propón algo con un ENFOQUE DIFERENTE. No repitas esta misma acción ni idea similar.`;
    }

    userPrompt += `

¿Cuál es el siguiente micro-paso que debería hacer HOY?`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const parsed: NextStepResponse = JSON.parse(content);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error generating next step:", error);
    return NextResponse.json(
      { error: "Failed to generate next step" },
      { status: 500 }
    );
  }
}
