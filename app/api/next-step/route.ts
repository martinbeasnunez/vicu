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

    // State-specific instructions
    const stateInstructions: Record<CurrentState, string> = {
      not_started: `El usuario NO HA EMPEZADO aún con este proyecto hoy.
Sugiere un micro-paso MUY PEQUEÑO para romper la inercia inicial.
Debe ser algo que se pueda hacer en 5-10 minutos máximo.
El objetivo es que el usuario "entre en la zona" sin sentir resistencia.
Ejemplos: "Abre el documento y lee el primer párrafo", "Escribe 3 ideas rápidas en un post-it", "Envía un mensaje corto a 1 contacto".`,

      stuck: `El usuario EMPEZÓ pero se TRABÓ. Está bloqueado.
Sugiere un paso que le ayude a desatorarse SIN aumentar la presión.
Puede ser: cambiar de ángulo, pedir ayuda, simplificar, o tomar una pausa productiva.
El esfuerzo debe ser pequeño (15-30 min max).
Ejemplos: "Escribe qué te tiene trabado en 2 líneas y envíalo a un amigo", "Haz la versión más fea/rápida posible", "Deja esto 20 min y regresa con ojos frescos".`,

      going_well: `El usuario VA BIEN y quiere seguir empujando.
Sugiere el siguiente paso lógico que capitalice el momentum actual.
Puede ser un paso de esfuerzo medio (hasta 1-2 horas) si hace sentido.
Busca que el usuario termine el día con un avance tangible.
Ejemplos: "Completa la sección X del documento", "Contacta a los 5 prospectos de tu lista", "Termina el prototipo funcional".`,
    };

    const systemPrompt = `Eres Vicu, un asistente estratégico que ayuda a emprendedores a mover sus proyectos día a día.

Tu rol es proponer UN SOLO micro-paso concreto y accionable basado en el contexto del proyecto y el estado actual del usuario.

${stateInstructions[current_state]}

IMPORTANTE:
- El paso debe ser ESPECÍFICO para este proyecto, no genérico.
- Usa verbos de acción claros (Escribe, Envía, Llama, Crea, etc.).
- La descripción debe dar contexto suficiente para que el usuario sepa exactamente qué hacer.
- NO propongas cosas que el usuario ya completó.
- Si hay acciones pendientes definidas, puedes sugerir empezar con una de ellas o algo relacionado.
- Si se te indica un "paso anterior a evitar", propón algo DIFERENTE en enfoque y acción.

Responde SOLO con un JSON válido (sin markdown, sin \`\`\`) con esta estructura exacta:
{
  "next_step_title": "Título corto del paso (máximo 60 caracteres)",
  "next_step_description": "Descripción en 1-2 líneas con contexto específico",
  "effort": "muy_pequeno" | "pequeno" | "medio"
}

Donde effort es:
- "muy_pequeno": 5-10 minutos
- "pequeno": 15-30 minutos
- "medio": 1-2 horas`;

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
