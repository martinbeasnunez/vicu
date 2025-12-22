import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateInitialSteps } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { experiment_id, title, description, detected_category, first_steps, experiment_type, surface_type } = data;

  if (!experiment_id) {
    return NextResponse.json(
      { success: false, error: "experiment_id is required" },
      { status: 400 }
    );
  }

  try {
    // Generate initial steps
    const steps = await generateInitialSteps({
      title: title || "Mi objetivo",
      description: description || "",
      detected_category,
      first_steps,
      experiment_type,
      surface_type,
    });

    // Insert steps as pending checkins
    const checkinsToInsert = steps.map((step) => ({
      experiment_id,
      status: "pending",
      step_title: step.title,
      step_description: step.description || null,
      effort: step.effort,
      user_state: "not_started",
      day_date: new Date().toISOString().split("T")[0],
    }));

    const { data: insertedCheckins, error: insertError } = await supabaseServer
      .from("experiment_checkins")
      .insert(checkinsToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting initial steps:", insertError);
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      steps: insertedCheckins,
    });
  } catch (error) {
    console.error("Error generating initial steps:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate initial steps" },
      { status: 500 }
    );
  }
}
