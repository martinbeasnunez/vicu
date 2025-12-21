import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calculateSuggestedDueDates } from "@/lib/ai";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await request.json();
  const { deadline } = data as { deadline: string };

  if (!deadline) {
    return NextResponse.json(
      { success: false, error: "Deadline is required" },
      { status: 400 }
    );
  }

  try {
    // 1. Update the experiment deadline
    const { error: updateError } = await supabase
      .from("experiments")
      .update({
        deadline,
        deadline_source: "user", // User edited it, so change source
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // 2. Get all actions for this experiment (only pending ones need date recalculation)
    const { data: actions, error: fetchError } = await supabase
      .from("experiment_actions")
      .select("id, status, suggested_order")
      .eq("experiment_id", id)
      .order("suggested_order", { ascending: true });

    if (fetchError) {
      throw fetchError;
    }

    if (!actions || actions.length === 0) {
      return NextResponse.json({ success: true, message: "Deadline updated, no actions to recalculate" });
    }

    // 3. Calculate new suggested dates for all actions (maintain relative distribution)
    const totalActions = actions.length;
    const newDates = calculateSuggestedDueDates(totalActions, deadline);

    // 4. Update each action with new suggested_due_date
    // Only update pending/in_progress actions, not done ones
    const updates = actions.map((action, index) => {
      // Keep done actions' dates as they were (or update them too, your choice)
      // Here we update all to maintain consistency
      return supabase
        .from("experiment_actions")
        .update({ suggested_due_date: newDates[index] })
        .eq("id", action.id);
    });

    await Promise.all(updates);

    return NextResponse.json({
      success: true,
      message: "Deadline and action dates updated",
      actionsUpdated: actions.length,
    });
  } catch (error) {
    console.error("Error updating deadline:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deadline" },
      { status: 500 }
    );
  }
}
