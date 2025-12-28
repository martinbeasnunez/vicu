import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateInitialSteps } from "@/lib/ai";

// Fallback description for steps without one
const DESCRIPTION_FALLBACK = "Describe brevemente qué harás en este paso para acercarte a tu objetivo.";

function ensureDescription(description: string | null | undefined, title: string): string {
  if (description && description.trim().length > 0) {
    return description.trim();
  }
  // Generate a contextual fallback based on the title
  if (title && title.trim().length > 0) {
    return `Acción: ${title.trim()}`;
  }
  return DESCRIPTION_FALLBACK;
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { experiment_id, for_stage } = data;

  if (!experiment_id) {
    return NextResponse.json(
      { success: false, error: "experiment_id is required" },
      { status: 400 }
    );
  }

  try {
    // First, fetch the experiment to get its current data
    const { data: experiment, error: expError } = await supabaseServer
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

    const targetStage = for_stage || experiment.status || "building";

    // Delete existing pending steps for this stage
    const { error: deleteError } = await supabaseServer
      .from("experiment_checkins")
      .delete()
      .eq("experiment_id", experiment_id)
      .eq("status", "pending")
      .eq("for_stage", targetStage);

    if (deleteError) {
      console.error("Error deleting existing steps:", deleteError);
      // Continue anyway - we'll still try to generate new steps
    }

    // Generate new steps using the experiment's current data
    const steps = await generateInitialSteps({
      title: experiment.title || "Mi objetivo",
      description: experiment.description || "",
      detected_category: null, // Re-detect from description
      first_steps: null, // Generate fresh steps
      experiment_type: experiment.experiment_type,
      surface_type: experiment.surface_type,
      for_stage: targetStage,
      situational_context: null, // Could be enhanced to fetch from conversation history
      business_context: null,
    });

    if (!steps || steps.length === 0) {
      return NextResponse.json(
        { success: false, error: "Failed to generate steps" },
        { status: 500 }
      );
    }

    // Insert new steps as pending checkins
    const checkinsToInsert = steps.map((step) => ({
      experiment_id,
      status: "pending",
      step_title: step.title,
      step_description: ensureDescription(step.description, step.title),
      effort: step.effort || "pequeno",
      user_state: "not_started",
      day_date: new Date().toISOString().split("T")[0],
      for_stage: targetStage,
    }));

    const { data: insertedCheckins, error: insertError } = await supabaseServer
      .from("experiment_checkins")
      .insert(checkinsToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting regenerated steps:", insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      steps: insertedCheckins,
      deleted_count: deleteError ? 0 : "unknown", // Can't easily get delete count from Supabase
    });
  } catch (error) {
    console.error("Error regenerating steps:", error);
    return NextResponse.json(
      { success: false, error: "Failed to regenerate steps" },
      { status: 500 }
    );
  }
}
