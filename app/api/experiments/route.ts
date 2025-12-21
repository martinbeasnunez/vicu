import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeDefaultRhythm, type SurfaceType } from "@/lib/experiment-helpers";

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

  // Build insert payload - rhythm fields are optional until migration is run
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
    // Rhythm fields - will be ignored if columns don't exist yet
    action_cadence: defaultRhythm.action_cadence,
    metrics_cadence: defaultRhythm.metrics_cadence,
    decision_cadence_days: defaultRhythm.decision_cadence_days,
  };

  let { data: experiment, error } = await supabase
    .from("experiments")
    .insert(insertPayload)
    .select()
    .single();

  // If rhythm fields don't exist yet, retry without them
  // Supabase error messages vary: "column ... does not exist", "undefined column", etc.
  if (error && (
    error.message.includes("cadence") ||
    error.message.includes("does not exist") ||
    error.message.includes("undefined column") ||
    error.code === "PGRST204" ||
    error.code === "42703"
  )) {
    console.warn("Rhythm fields not found in DB, retrying without them. Original error:", error.message);
    const { action_cadence, metrics_cadence, decision_cadence_days, ...payloadWithoutRhythm } = insertPayload;
    const retryResult = await supabase
      .from("experiments")
      .insert(payloadWithoutRhythm)
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

  return NextResponse.json({ success: true, experiment });
}
