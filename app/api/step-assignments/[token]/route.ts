import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// GET - Obtener info pública de una asignación de paso (sin auth)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token requerido" },
        { status: 400 }
      );
    }

    // Buscar la asignación por token
    const { data: assignment, error: assignmentError } = await supabaseServer
      .from("step_assignments")
      .select(`
        id,
        helper_name,
        assigned_by,
        status,
        custom_message,
        token_expires_at,
        responded_at,
        created_at,
        experiment_checkins!inner(
          id,
          step_title,
          step_description,
          experiments!inner(
            title,
            user_id
          )
        )
      `)
      .eq("access_token", token)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    // Verificar si el token expiró
    const now = new Date();
    const expiresAt = new Date(assignment.token_expires_at);
    if (now > expiresAt) {
      // Actualizar estado a expirado si no lo está
      if (assignment.status === "pending") {
        await supabaseServer
          .from("step_assignments")
          .update({ status: "expired" })
          .eq("id", assignment.id);
      }
      return NextResponse.json(
        { success: false, error: "Esta solicitud ha expirado" },
        { status: 410 }
      );
    }

    // Extraer datos para la respuesta pública
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkinData = assignment.experiment_checkins as any;
    const step = {
      id: checkinData.id,
      title: checkinData.step_title,
      description: checkinData.step_description,
      experimentTitle: checkinData.experiments?.title || checkinData.experiments?.[0]?.title || "Objetivo",
    };

    // Get owner's name
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("full_name")
      .eq("id", assignment.assigned_by)
      .single();

    const ownerName = profile?.full_name || "Alguien";

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        helper_name: assignment.helper_name,
        owner_name: ownerName,
        status: assignment.status,
        custom_message: assignment.custom_message,
        responded_at: assignment.responded_at,
        step_title: step.title,
        step_description: step.description,
        experiment_title: step.experimentTitle,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/step-assignments/[token]:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Responder a una asignación de paso (sin auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { response, message } = body as {
      response: "completed" | "declined";
      message?: string;
    };

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Token requerido" },
        { status: 400 }
      );
    }

    if (!response || !["completed", "declined"].includes(response)) {
      return NextResponse.json(
        { success: false, error: "response debe ser 'completed' o 'declined'" },
        { status: 400 }
      );
    }

    // Buscar la asignación
    const { data: assignment, error: findError } = await supabaseServer
      .from("step_assignments")
      .select("id, status, token_expires_at, checkin_id")
      .eq("access_token", token)
      .single();

    if (findError || !assignment) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que no haya expirado
    const now = new Date();
    const expiresAt = new Date(assignment.token_expires_at);
    if (now > expiresAt) {
      return NextResponse.json(
        { success: false, error: "Esta solicitud ha expirado" },
        { status: 410 }
      );
    }

    // Verificar que esté pendiente
    if (assignment.status !== "pending") {
      return NextResponse.json(
        { success: false, error: "Esta solicitud ya fue respondida" },
        { status: 409 }
      );
    }

    // Actualizar la asignación
    const { error: updateError } = await supabaseServer
      .from("step_assignments")
      .update({
        status: response,
        response_message: message || null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);

    if (updateError) {
      console.error("Error updating step assignment:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al guardar la respuesta" },
        { status: 500 }
      );
    }

    // Si el helper completó la tarea, marcar el checkin como completado
    if (response === "completed") {
      await supabaseServer
        .from("experiment_checkins")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", assignment.checkin_id);
    }

    return NextResponse.json({
      success: true,
      message: response === "completed"
        ? "¡Gracias por tu ayuda!"
        : "Entendido, gracias por avisar.",
    });
  } catch (error) {
    console.error("Error in POST /api/step-assignments/[token]:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
