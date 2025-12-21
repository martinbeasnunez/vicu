import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { error } = await supabase.from("events").insert({
    type: data.type,
    experiment_id: data.experiment_id || null,
  });

  if (error) {
    console.error("Error inserting event:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
