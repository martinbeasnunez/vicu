import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { computeDefaultRhythm, type SurfaceType } from "@/lib/experiment-helpers";
import { generateInitialSteps } from "@/lib/ai";

// Helper para generar un título corto a partir de la descripción (fallback)
function generateFallbackTitle(description: string): string {
  const words = description.split(/\s+/).slice(0, 5).join(" ");
  return words.length > 50 ? words.substring(0, 47) + "..." : words;
}

export async function POST(request: NextRequest) {
  const data = await request.json();

  const {
    description,
    project_type,
    experiment_type,
    surface_type,
    target_audience,
    main_pain,
    main_promise,
    main_cta,
    success_goal_number,
    success_goal_unit,
    // New fields
    generated_title,
    raw_idea,
    deadline,
    deadline_source,
    // Project phases
    phases,
  } = data;

  if (!description) {
    return NextResponse.json(
      { success: false, error: "Description is required" },
      { status: 400 }
    );
  }

  // Use AI-generated title if provided, otherwise generate fallback
  const title = generated_title || generateFallbackTitle(description);

  // Compute default rhythm based on experiment characteristics
  const defaultRhythm = computeDefaultRhythm({
    surface_type: (surface_type || "landing") as SurfaceType,
    context: data.context || null,
    experiment_type: experiment_type || null,
  });

  // Build insert payload - rhythm and phases fields are optional until migration is run
  const insertPayload: Record<string, unknown> = {
    title,
    description,
    project_type: project_type || "external",
    experiment_type: experiment_type || "clientes",
    surface_type: surface_type || "landing",
    target_audience: target_audience || null,
    main_pain: main_pain || null,
    main_promise: main_promise || null,
    main_cta: main_cta || null,
    success_goal_number: success_goal_number || null,
    success_goal_unit: success_goal_unit || null,
    status: "testing",
    // New fields
    raw_idea: raw_idea || null,
    deadline: deadline || null,
    deadline_source: deadline_source || "ai_suggested",
    // Project phases - stored as JSONB, will be ignored if column doesn't exist
    phases: phases && phases.length > 0 ? phases : null,
    // Rhythm fields - will be ignored if columns don't exist yet
    action_cadence: defaultRhythm.action_cadence,
    metrics_cadence: defaultRhythm.metrics_cadence,
    decision_cadence_days: defaultRhythm.decision_cadence_days,
  };

  let { data: experiment, error } = await supabaseServer
    .from("experiments")
    .insert(insertPayload)
    .select()
    .single();

  // If rhythm or phases fields don't exist yet, retry without them
  // Supabase error messages vary: "column ... does not exist", "undefined column", etc.
  if (error && (
    error.message.includes("cadence") ||
    error.message.includes("phases") ||
    error.message.includes("does not exist") ||
    error.message.includes("undefined column") ||
    error.code === "PGRST204" ||
    error.code === "42703"
  )) {
    console.warn("Optional fields not found in DB, retrying without them. Original error:", error.message);
    const { action_cadence, metrics_cadence, decision_cadence_days, phases: _phases, ...payloadWithoutOptional } = insertPayload;
    const retryResult = await supabaseServer
      .from("experiments")
      .insert(payloadWithoutOptional)
      .select()
      .single();
    experiment = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    console.error("Error creating experiment:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  // AUTOMATIC INITIAL STEPS GENERATION
  // Generate 3 initial steps for every new experiment to ensure the objective
  // page is never empty. This runs synchronously before returning the response.
  try {
    // Extract additional fields that might be passed for step generation
    const { detected_category, first_steps } = data;

    console.log(`[STEPS] Generating initial steps for experiment ${experiment.id}:`, {
      title: experiment.title,
      detected_category,
      first_steps_count: first_steps?.length || 0,
    });

    const steps = await generateInitialSteps({
      title: experiment.title,
      description: description || "",
      detected_category: detected_category || null,
      first_steps: first_steps && first_steps.length > 0 ? first_steps : null, // Only pass if non-empty
      experiment_type: experiment_type || null,
      surface_type: surface_type || null,
      for_stage: "testing", // New experiments always start in "testing" (Arrancando)
    });

    console.log(`[STEPS] Generated ${steps?.length || 0} steps:`, steps?.map(s => s.title));

    // Insert steps as pending checkins
    if (steps && steps.length > 0) {
      const checkinsToInsert = steps.map((step) => ({
        experiment_id: experiment.id,
        status: "pending",
        step_title: step.title,
        step_description: step.description || `Acción: ${step.title}`,
        effort: step.effort || "pequeno",
        user_state: "not_started",
        day_date: new Date().toISOString().split("T")[0],
        for_stage: "testing",
      }));

      console.log(`[STEPS] Inserting ${checkinsToInsert.length} checkins for experiment ${experiment.id}`);

      const { data: insertedSteps, error: stepsError } = await supabaseServer
        .from("experiment_checkins")
        .insert(checkinsToInsert)
        .select();

      if (stepsError) {
        console.error("[STEPS] Error inserting initial steps:", stepsError);
        // Don't fail the experiment creation if steps fail - just log it
      } else {
        console.log(`[STEPS] Successfully inserted ${insertedSteps?.length || 0} initial steps for experiment ${experiment.id}`);
      }
    } else {
      console.warn(`[STEPS] No steps generated for experiment ${experiment.id} - falling back to defaults`);
      // Fallback: insert 3 generic default steps to never leave the objective empty
      const fallbackSteps = [
        { step_title: "Define el primer paso concreto para tu objetivo", step_description: "Escribe qué acción específica puedes hacer en los próximos 5 minutos.", effort: "muy_pequeno" },
        { step_title: "Prepara lo que necesitas para empezar", step_description: "Reúne herramientas, recursos o información que necesitarás.", effort: "pequeno" },
        { step_title: "Ejecuta la primera acción hoy", step_description: "Haz algo pequeño ahora mismo para romper la inercia.", effort: "pequeno" },
      ];

      const fallbackCheckins = fallbackSteps.map((step) => ({
        experiment_id: experiment.id,
        status: "pending",
        step_title: step.step_title,
        step_description: step.step_description,
        effort: step.effort,
        user_state: "not_started",
        day_date: new Date().toISOString().split("T")[0],
        for_stage: "testing",
      }));

      const { error: fallbackError } = await supabaseServer
        .from("experiment_checkins")
        .insert(fallbackCheckins);

      if (fallbackError) {
        console.error("[STEPS] Error inserting fallback steps:", fallbackError);
      } else {
        console.log(`[STEPS] Inserted 3 fallback steps for experiment ${experiment.id}`);
      }
    }
  } catch (stepsErr) {
    console.error("[STEPS] Error in step generation flow:", stepsErr);
    // Still try to insert fallback steps
    try {
      const emergencySteps = [
        { step_title: "Define tu primer paso", step_description: "Escribe qué harás primero.", effort: "muy_pequeno" },
        { step_title: "Prepara lo necesario", step_description: "Reúne lo que necesitas.", effort: "pequeno" },
        { step_title: "Ejecuta hoy", step_description: "Haz algo pequeño ahora.", effort: "pequeno" },
      ];

      await supabaseServer
        .from("experiment_checkins")
        .insert(emergencySteps.map((step) => ({
          experiment_id: experiment.id,
          status: "pending",
          step_title: step.step_title,
          step_description: step.step_description,
          effort: step.effort,
          user_state: "not_started",
          day_date: new Date().toISOString().split("T")[0],
          for_stage: "testing",
        })));
      console.log("[STEPS] Inserted emergency fallback steps after error");
    } catch (emergencyErr) {
      console.error("[STEPS] Even emergency fallback failed:", emergencyErr);
    }
  }

  return NextResponse.json({ success: true, experiment });
}
