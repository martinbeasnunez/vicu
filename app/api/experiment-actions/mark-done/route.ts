import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { actionId } = await request.json();

  if (!actionId) {
    return NextResponse.json(
      { success: false, error: "actionId is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("experiment_actions")
    .update({
      status: "done",
      done_at: new Date().toISOString(),
    })
    .eq("id", actionId)
    .select()
    .single();

  if (error) {
    console.error("Error marking action as done:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, action: data });
}
