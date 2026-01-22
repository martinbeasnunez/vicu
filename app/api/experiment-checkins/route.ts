import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getAuthUserId } from "@/lib/auth-server";

// POST - Create a new checkin (step) for an experiment
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { experiment_id, step_title, step_description } = body as {
      experiment_id: string;
      step_title: string;
      step_description?: string;
    };

    if (!experiment_id) {
      return NextResponse.json(
        { success: false, error: "experiment_id es requerido" },
        { status: 400 }
      );
    }

    if (!step_title?.trim()) {
      return NextResponse.json(
        { success: false, error: "step_title es requerido" },
        { status: 400 }
      );
    }

    // Verify user owns this experiment
    const { data: experiment, error: expError } = await supabaseServer
      .from("experiments")
      .select("id, user_id")
      .eq("id", experiment_id)
      .single();

    if (expError || !experiment) {
      return NextResponse.json(
        { success: false, error: "Experimento no encontrado" },
        { status: 404 }
      );
    }

    if (experiment.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para este experimento" },
        { status: 403 }
      );
    }

    // Create the checkin
    const { data: checkin, error: insertError } = await supabaseServer
      .from("experiment_checkins")
      .insert({
        experiment_id,
        status: "pending",
        step_title: step_title.trim(),
        step_description: step_description?.trim() || `Acción: ${step_title.trim()}`,
        effort: "medium",
        user_state: "not_started",
        day_date: new Date().toISOString().split("T")[0],
        for_stage: "building",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating checkin:", insertError);
      return NextResponse.json(
        { success: false, error: "Error al crear el paso" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      checkin,
    });
  } catch (error) {
    console.error("Error in POST /api/experiment-checkins:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
