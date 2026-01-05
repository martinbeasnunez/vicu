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

export type VicuRecommendationAction = "seguir_construyendo" | "probar" | "ajustar" | "logrado" | "pausar" | "descartar";
export type ExperimentStage = "queued" | "building" | "testing" | "adjusting" | "achieved" | "paused" | "discarded";

export interface VicuRecommendationData {
  action: VicuRecommendationAction;
  title: string;
  summary: string;
  reasons: string[];
  suggested_next_focus: string;
  generated_at: string;
  for_stage: ExperimentStage; // The stage this recommendation was generated for
}

export interface GenerateRecommendationRequest {
  experiment_id: string;
  force_new?: boolean; // If true, generate a new recommendation even if one exists
  previous_next_focus?: string; // The "Siguiente enfoque" from the previous recommendation
}

export interface GenerateRecommendationResponse {
  success: boolean;
  recommendation?: VicuRecommendationData;
  error?: string;
}

const ACTION_LABELS: Record<VicuRecommendationAction, string> = {
  seguir_construyendo: "Construyendo",
  probar: "Probando",
  ajustar: "Ajustando",
  logrado: "Logrado",
  pausar: "Pausado",
  descartar: "Descartado",
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRecommendationRequest = await request.json();
    const { experiment_id, force_new, previous_next_focus } = body;

    if (!experiment_id) {
      return NextResponse.json(
        { success: false, error: "Missing experiment_id" },
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
        { success: false, error: "Experiment not found" },
        { status: 404 }
      );
    }

    const currentStage: ExperimentStage = experiment.status || "testing";

    // If recommendation already exists and we're not forcing a new one, return it
    // BUT only if the recommendation was for the current stage
    if (experiment.vicu_recommendation && !force_new) {
      const existingRec = experiment.vicu_recommendation as VicuRecommendationData;
      // If the recommendation has for_stage and it matches current, return it
      // If it doesn't have for_stage (old format), also return it for backwards compatibility
      if (!existingRec.for_stage || existingRec.for_stage === currentStage) {
        return NextResponse.json({
          success: true,
          recommendation: existingRec,
        });
      }
      // Otherwise, the recommendation is for a different stage - generate new one
    }

    // Fetch checkins (steps) for context
    const { data: checkins } = await getSupabase()
      .from("experiment_checkins")
      .select("step_title, step_description, status, effort, user_state, created_at, user_content")
      .eq("experiment_id", experiment_id)
      .order("created_at", { ascending: true });

    const completedSteps = checkins?.filter((c) => c.status === "done") || [];
    const pendingSteps = checkins?.filter((c) => c.status === "pending") || [];
    const totalSteps = checkins?.length || 0;

    // Build context for AI
    let projectContext = `PROYECTO: ${experiment.title}
DESCRIPCIÓN/OBJETIVO: ${experiment.description || "Sin descripción"}`;

    if (experiment.target_audience) {
      projectContext += `\nAUDIENCIA: ${experiment.target_audience}`;
    }
    if (experiment.main_pain) {
      projectContext += `\nPROBLEMA PRINCIPAL: ${experiment.main_pain}`;
    }
    if (experiment.main_promise) {
      projectContext += `\nPROMESA: ${experiment.main_promise}`;
    }
    if (experiment.success_goal_number && experiment.success_goal_unit) {
      projectContext += `\nMETA DEFINIDA: ${experiment.success_goal_number} ${experiment.success_goal_unit}`;
    }
    if (experiment.deadline) {
      const deadline = new Date(experiment.deadline);
      const today = new Date();
      const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      projectContext += `\nFECHA LÍMITE: ${experiment.deadline} (${daysLeft > 0 ? `quedan ${daysLeft} días` : daysLeft === 0 ? "es hoy" : "ya pasó"})`;
    }
    if (experiment.surface_type) {
      const surfaceLabels: Record<string, string> = {
        landing: "Landing page (captar desconocidos)",
        messages: "Mensajes directos (contactos existentes)",
        ritual: "Ritual/hábito personal",
      };
      projectContext += `\nTIPO DE SUPERFICIE: ${surfaceLabels[experiment.surface_type] || experiment.surface_type}`;
    }
    if (experiment.self_result) {
      const selfResultLabels: Record<string, string> = {
        alto: "Alto impacto (el usuario lo percibe positivo)",
        medio: "Impacto medio",
        bajo: "Bajo impacto (el usuario lo percibe negativo)",
      };
      projectContext += `\nAUTOEVALUACIÓN DEL USUARIO: ${selfResultLabels[experiment.self_result] || experiment.self_result}`;
    }

    // Add current stage context
    const stageLabels: Record<ExperimentStage, string> = {
      queued: "Por empezar",
      building: "Construyendo",
      testing: "Probando",
      adjusting: "Ajustando",
      achieved: "Logrado",
      paused: "Pausado",
      discarded: "Descartado",
    };
    projectContext += `\n\nETAPA ACTUAL: ${stageLabels[currentStage]} (${currentStage})`;

    // Add steps context
    projectContext += `\n\nPROGRESO DEL PLAN:
- Total de pasos: ${totalSteps}
- Pasos completados: ${completedSteps.length}
- Pasos pendientes: ${pendingSteps.length}`;

    if (completedSteps.length > 0) {
      projectContext += `\n\nPASOS COMPLETADOS:`;
      completedSteps.forEach((step, i) => {
        projectContext += `\n${i + 1}. ${step.step_title || "Paso sin título"}`;
        if (step.step_description) {
          projectContext += ` - ${step.step_description}`;
        }
        if (step.user_content) {
          projectContext += `\n   Notas del usuario: "${step.user_content.substring(0, 200)}${step.user_content.length > 200 ? "..." : ""}"`;
        }
      });
    }

    if (pendingSteps.length > 0) {
      projectContext += `\n\nPASOS PENDIENTES:`;
      pendingSteps.forEach((step, i) => {
        projectContext += `\n${i + 1}. ${step.step_title || "Paso sin título"}`;
      });
    }

    // If we have a previous recommendation's next focus, include it as context
    if (previous_next_focus) {
      projectContext += `\n\nENFOQUE DE LA ETAPA ANTERIOR (usa esto como base para la nueva recomendación):
"${previous_next_focus}"`;
    }

    const systemPrompt = `Eres Vicu, un estratega de growth con mentalidad MVP que ayuda a emprendedores y personas a tomar decisiones inteligentes sobre sus proyectos y objetivos.

Tu tarea es analizar el progreso de un proyecto y dar UNA RECOMENDACIÓN CLARA sobre qué debería hacer el usuario a continuación.

⚠️ REGLA CRÍTICA - RESPETA EL CONTEXTO LITERALMENTE:
- USA las palabras EXACTAS del proyecto, NO las reinterpretes
- Si el usuario habla de "hijo de 2 años" → es un NIÑO PEQUEÑO (toddler), NO un bebé
- Si habla de "hijo de 3 meses" → es un bebé
- NO asumas edades, situaciones, ni detalles que NO están en el contexto
- Si el usuario da información específica, tu recomendación DEBE reflejarla exactamente
- NUNCA generalices cuando hay información concreta disponible

CICLO MVP - Estados del proyecto:
1. Por empezar (queued) → Idea capturada, sin acción
2. Construyendo (building) → Creando la primera versión mínima
3. Probando (testing) → Lanzaste algo, esperando feedback/datos
4. Ajustando (adjusting) → Cambiando basado en lo aprendido
5. Logrado (achieved) → Meta cumplida
6. Pausado (paused) → Detenido temporalmente
7. Descartado (discarded) → No funcionó o ya no importa

OPCIONES DE ACCIÓN (elige UNA):
- "seguir_construyendo": Aún no hay algo listo para probar. Seguir construyendo el MVP.
- "probar": Ya hay algo construido. Es hora de lanzar y obtener feedback real.
- "ajustar": Hay datos/feedback. Hacer cambios específicos y volver a probar.
- "logrado": El objetivo se cumplió. Celebrar y cerrar.
- "pausar": Bloqueo o agotamiento. Tomar distancia temporalmente.
- "descartar": No funcionó después de varios intentos, o ya no es relevante.

CRITERIOS PARA DECIDIR:
1. ¿Hay algo construido para probar? (no → seguir_construyendo, sí → probar)
2. ¿Hay datos/feedback del mundo real? (no → probar, sí → ajustar o logrado)
3. ¿Los resultados son positivos? (sí y meta cumplida → logrado, sí pero incompleto → ajustar)
4. ¿Hubo varios ciclos sin progreso? (sí → pausar o descartar)
5. ¿El usuario reporta bloqueo o agotamiento? (sí → pausar)

FORMATO DE RESPUESTA:
Responde SOLO con JSON válido (sin markdown, sin \`\`\`) con esta estructura:
{
  "action": "seguir_construyendo" | "probar" | "ajustar" | "logrado" | "pausar" | "descartar",
  "title": "Título de la recomendación (máx 60 caracteres)",
  "summary": "Explicación en 2-3 oraciones de por qué esta recomendación",
  "reasons": ["Razón 1", "Razón 2", "Razón 3"],
  "suggested_next_focus": "Qué debería hacer el usuario como siguiente paso concreto"
}

IMPORTANTE:
- Sé específico para ESTE proyecto, no genérico.
- El título debe ser claro y directo.
- Las razones deben basarse en datos concretos del proyecto.
- El siguiente paso debe ser accionable y realista.
- Fomenta ciclos cortos: construir → probar → ajustar → repetir.`;

    const userPrompt = `Analiza este proyecto y genera una recomendación:

${projectContext}

¿Cuál es tu recomendación para este proyecto?`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { success: false, error: "No response from AI" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content) as Omit<VicuRecommendationData, "generated_at" | "for_stage">;

    const recommendation: VicuRecommendationData = {
      ...parsed,
      generated_at: new Date().toISOString(),
      for_stage: currentStage,
    };

    // Build recommendation history - add previous recommendation to history if exists
    let newHistory: VicuRecommendationData[] = [];
    const existingHistory = experiment.vicu_recommendation_history as VicuRecommendationData[] | null;
    if (existingHistory && Array.isArray(existingHistory)) {
      newHistory = [...existingHistory];
    }
    // If there's a current recommendation, move it to history
    if (experiment.vicu_recommendation) {
      newHistory.push(experiment.vicu_recommendation as VicuRecommendationData);
    }

    // Save to database - update current recommendation and history
    const { error: updateError } = await getSupabase()
      .from("experiments")
      .update({
        vicu_recommendation: recommendation,
        vicu_recommendation_history: newHistory,
      })
      .eq("id", experiment_id);

    if (updateError) {
      console.error("Error saving recommendation:", updateError);
      // Still return the recommendation even if save fails
    }

    return NextResponse.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    console.error("Error generating recommendation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate recommendation" },
      { status: 500 }
    );
  }
}
