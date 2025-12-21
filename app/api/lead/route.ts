import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { error: leadError } = await supabase.from("leads").insert({
    name: data.nombre,
    email: data.email,
    message: data.mensaje,
    experiment_id: data.experiment_id || null,
  });

  if (leadError) {
    console.error("Error inserting lead:", leadError);
    return NextResponse.json({ success: false, error: leadError.message }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("events").insert({
    type: "form_submit",
    experiment_id: data.experiment_id || null,
  });

  if (eventError) {
    console.error("Error inserting event:", eventError);
  }

  return NextResponse.json({ success: true });
}
