import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateMoreActionsForChannel, ExperimentBrief, ActionItem } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const { experiment_id, channel } = data as {
    experiment_id: string;
    channel: string;
  };

  if (!experiment_id || !channel) {
    return NextResponse.json(
      { success: false, error: "experiment_id and channel are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch experiment data
    const { data: experiment, error: experimentError } = await supabaseServer
      .from("experiments")
      .select("*")
      .eq("id", experiment_id)
      .single();

    if (experimentError || !experiment) {
      return NextResponse.json(
        { success: false, error: "Experiment not found" },
        { status: 404 }
      );
    }

    // 2. Fetch existing actions for this channel
    const { data: existingActions, error: actionsError } = await supabaseServer
      .from("experiment_actions")
      .select("action_type, title, content")
      .eq("experiment_id", experiment_id)
      .eq("channel", channel);

    if (actionsError) {
      return NextResponse.json(
        { success: false, error: actionsError.message },
        { status: 500 }
      );
    }

    // 3. Build brief from experiment
    const brief: ExperimentBrief = {
      title: experiment.title,
      description: experiment.description,
      experiment_type: experiment.experiment_type || "clientes",
      target_audience: experiment.target_audience,
      main_pain: experiment.main_pain,
      main_promise: experiment.main_promise,
      main_cta: experiment.main_cta,
      success_goal_number: experiment.success_goal_number,
      success_goal_unit: experiment.success_goal_unit,
    };

    // 4. Generate new actions
    const newActions = await generateMoreActionsForChannel(
      brief,
      channel,
      existingActions as ActionItem[]
    );

    // 5. Get current max order for this experiment
    const { data: maxOrderResult } = await supabaseServer
      .from("experiment_actions")
      .select("suggested_order")
      .eq("experiment_id", experiment_id)
      .order("suggested_order", { ascending: false })
      .limit(1);

    const maxOrder = maxOrderResult?.[0]?.suggested_order || 0;

    // 6. Insert new actions
    const actionsToInsert = newActions.map((action, index) => ({
      experiment_id,
      channel,
      action_type: action.action_type,
      title: action.title,
      content: action.content,
      status: "pending",
      suggested_order: maxOrder + index + 1,
    }));

    const { data: insertedActions, error: insertError } = await supabaseServer
      .from("experiment_actions")
      .insert(actionsToInsert)
      .select();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      actions: insertedActions,
      count: insertedActions?.length || 0,
    });
  } catch (error) {
    console.error("Error generating more actions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate more actions" },
      { status: 500 }
    );
  }
}
