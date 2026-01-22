import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// GET - Obtener info pública de una asignación (sin auth)
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
      .from("action_assignments")
      .select(`
        id,
        helper_name,
        status,
        custom_message,
        token_expires_at,
        responded_at,
        created_at,
        experiment_actions!inner(
          id,
          title,
          content,
          experiments!inner(
            title
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
          .from("action_assignments")
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
    const actionData = assignment.experiment_actions as any;
    const action = {
      id: actionData.id,
      title: actionData.title,
      content: actionData.content,
      experimentTitle: actionData.experiments?.title || actionData.experiments?.[0]?.title || "Objetivo",
    };

    return NextResponse.json({
      success: true,
      assignment: {
        id: assignment.id,
        helper_name: assignment.helper_name,
        status: assignment.status,
        custom_message: assignment.custom_message,
        responded_at: assignment.responded_at,
        action_title: action.title,
        action_content: action.content,
        experiment_title: action.experimentTitle,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/assignments/[token]:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST - Responder a una asignación (sin auth)
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
      .from("action_assignments")
      .select("id, status, token_expires_at, action_id")
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
      .from("action_assignments")
      .update({
        status: response,
        response_message: message || null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", assignment.id);

    if (updateError) {
      console.error("Error updating assignment:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al guardar la respuesta" },
        { status: 500 }
      );
    }

    // Si el helper completó la tarea, marcar la acción como done
    if (response === "completed") {
      await supabaseServer
        .from("experiment_actions")
        .update({
          status: "done",
          done_at: new Date().toISOString(),
        })
        .eq("id", assignment.action_id);
    }

    return NextResponse.json({
      success: true,
      message: response === "completed"
        ? "¡Gracias por tu ayuda!"
        : "Entendido, gracias por avisar.",
    });
  } catch (error) {
    console.error("Error in POST /api/assignments/[token]:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
