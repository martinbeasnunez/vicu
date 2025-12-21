import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateAttackPlanForExperiment, addDueDatesToAttackPlan, ExperimentBrief } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { experiment } = data as { experiment: ExperimentBrief & { id: string } };

  if (!experiment || !experiment.id) {
    return NextResponse.json(
      { success: false, error: "Experiment data is required" },
      { status: 400 }
    );
  }

  try {
    // Generar plan de ataque con IA
    let attackPlan = await generateAttackPlanForExperiment(experiment);

    // Agregar fechas sugeridas a las acciones
    attackPlan = addDueDatesToAttackPlan(
      attackPlan,
      experiment.deadline,
      experiment.experiment_type,
      experiment.surface_type
    );

    // Preparar las filas para insertar
    const actionsToInsert: {
      experiment_id: string;
      channel: string;
      action_type: string;
      title: string;
      content: string;
      status: string;
      suggested_order: number;
      suggested_due_date: string | null;
    }[] = [];

    let order = 1;
    for (const channelPlan of attackPlan.channels) {
      for (const action of channelPlan.actions) {
        actionsToInsert.push({
          experiment_id: experiment.id,
          channel: channelPlan.channel,
          action_type: action.action_type,
          title: action.title,
          content: action.content,
          status: "pending",
          suggested_order: order++,
          suggested_due_date: action.suggested_due_date || null,
        });
      }
    }

    // Insertar acciones en Supabase
    const { data: insertedActions, error } = await supabaseServer
      .from("experiment_actions")
      .insert(actionsToInsert)
      .select();

    if (error) {
      console.error("Error inserting actions:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      actions: insertedActions,
      count: insertedActions?.length || 0,
    });
  } catch (error) {
    console.error("Error generating attack plan:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate attack plan" },
      { status: 500 }
    );
  }
}
