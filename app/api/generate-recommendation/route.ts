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

export type VicuRecommendationAction = "escalar" | "iterar" | "pausar" | "cerrar";

export interface VicuRecommendationData {
  action: VicuRecommendationAction;
  title: string;
  summary: string;
  reasons: string[];
  suggested_next_focus: string;
  generated_at: string;
}

export interface GenerateRecommendationRequest {
  experiment_id: string;
}

export interface GenerateRecommendationResponse {
  success: boolean;
  recommendation?: VicuRecommendationData;
  error?: string;
}

const ACTION_LABELS: Record<VicuRecommendationAction, string> = {
  escalar: "En marcha",
  iterar: "Ajustando",
  pausar: "En pausa",
  cerrar: "Cerrado",
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRecommendationRequest = await request.json();
    const { experiment_id } = body;

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

    // If recommendation already exists, return it
    if (experiment.vicu_recommendation) {
      return NextResponse.json({
        success: true,
        recommendation: experiment.vicu_recommendation as VicuRecommendationData,
      });
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

    const systemPrompt = `Eres Vicu, un estratega de growth que ayuda a emprendedores y personas a tomar decisiones inteligentes sobre sus proyectos y objetivos.

Tu tarea es analizar el progreso de un proyecto/experimento y dar UNA RECOMENDACIÓN CLARA sobre qué debería hacer el usuario a continuación.

OPCIONES DE ACCIÓN (elige UNA):
- "escalar": El proyecto tuvo buenos resultados. Recomendamos invertir más tiempo/recursos en él.
- "iterar": Hay potencial pero necesita ajustes. Recomendamos hacer cambios y volver a probar.
- "pausar": Los resultados no son concluyentes o el usuario está agotado. Recomendamos tomar distancia temporalmente.
- "cerrar": El proyecto no funcionó o ya cumplió su propósito. Recomendamos finalizarlo y pasar a otra cosa.

CRITERIOS PARA DECIDIR:
1. ¿Se completó el plan? (si no, generalmente es "escalar" para seguir ejecutando o "pausar" si hay bloqueos)
2. ¿Hay autoevaluación del usuario? (alto impacto → escalar, medio → iterar, bajo → pausar/cerrar)
3. ¿Hay métricas objetivas? (conversión alta → escalar, media → iterar, baja → pausar/cerrar)
4. ¿Se acerca el deadline? (si hay urgencia, ser más decisivo)
5. ¿Es un proyecto personal/ritual? (ser más gentil, enfocarse en el progreso del hábito)

FORMATO DE RESPUESTA:
Responde SOLO con JSON válido (sin markdown, sin \`\`\`) con esta estructura:
{
  "action": "escalar" | "iterar" | "pausar" | "cerrar",
  "title": "Título de la recomendación (máx 60 caracteres)",
  "summary": "Explicación en 2-3 oraciones de por qué esta recomendación",
  "reasons": ["Razón 1", "Razón 2", "Razón 3"],
  "suggested_next_focus": "Qué debería hacer el usuario como siguiente paso concreto"
}

IMPORTANTE:
- Sé específico para ESTE proyecto, no genérico.
- El título debe ser claro y directo.
- Las razones deben basarse en datos concretos del proyecto.
- El siguiente paso debe ser accionable y realista.`;

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

    const parsed = JSON.parse(content) as Omit<VicuRecommendationData, "generated_at">;

    const recommendation: VicuRecommendationData = {
      ...parsed,
      generated_at: new Date().toISOString(),
    };

    // Save to database
    const { error: updateError } = await getSupabase()
      .from("experiments")
      .update({ vicu_recommendation: recommendation })
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
