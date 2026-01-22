import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getAuthUserId } from "@/lib/auth-server";
import { randomUUID } from "crypto";
import { sendAssignmentNotification, isKapsoConfigured } from "@/lib/kapso";

export interface ActionAssignment {
  id: string;
  action_id: string;
  assigned_by: string;
  helper_name: string;
  helper_contact: string;
  contact_type: "whatsapp" | "email";
  custom_message: string | null;
  status: "pending" | "completed" | "declined" | "expired";
  access_token: string;
  token_expires_at: string;
  response_message: string | null;
  responded_at: string | null;
  notification_sent_at: string | null;
  notification_message_id: string | null;
  created_at: string;
}

// POST - Crear nueva asignación
export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action_id, helper_name, helper_contact, contact_type, custom_message } = body;

    // Validaciones
    if (!action_id || !helper_name || !helper_contact || !contact_type) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    if (!["whatsapp", "email"].includes(contact_type)) {
      return NextResponse.json(
        { success: false, error: "contact_type debe ser 'whatsapp' o 'email'" },
        { status: 400 }
      );
    }

    // Verificar que la acción existe y pertenece al usuario
    const { data: action, error: actionError } = await supabaseServer
      .from("experiment_actions")
      .select("id, experiment_id, title, experiments!inner(user_id, title)")
      .eq("id", action_id)
      .single();

    if (actionError || !action) {
      return NextResponse.json(
        { success: false, error: "Acción no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que el usuario es owner del experimento
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expData = action.experiments as any;
    const experiment = {
      user_id: expData?.user_id || expData?.[0]?.user_id,
      title: expData?.title || expData?.[0]?.title || "Objetivo",
    };
    if (experiment.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para asignar esta acción" },
        { status: 403 }
      );
    }

    // Generar token único y fecha de expiración (7 días)
    const accessToken = randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

    // Crear la asignación
    const { data: assignment, error: insertError } = await supabaseServer
      .from("action_assignments")
      .insert({
        action_id,
        assigned_by: userId,
        helper_name,
        helper_contact,
        contact_type,
        custom_message: custom_message || null,
        status: "pending",
        access_token: accessToken,
        token_expires_at: tokenExpiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating assignment:", insertError);
      return NextResponse.json(
        { success: false, error: "Error al crear la asignación" },
        { status: 500 }
      );
    }

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://vicu.vercel.app"}/a/${accessToken}`;
    let notificationSent = false;
    let notificationError: string | undefined;

    // Try to send WhatsApp notification if contact_type is whatsapp
    if (contact_type === "whatsapp" && isKapsoConfigured()) {
      // Get owner's name from profile or extract from email
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      // Get user email as fallback
      const { data: authUser } = await supabaseServer.auth.admin.getUserById(userId);
      const email = authUser?.user?.email;
      // Extract name from email: "martin.beas@..." -> "Martin"
      const emailName = email ? email.split("@")[0].split(/[._-]/)[0] : null;
      const capitalizedEmailName = emailName
        ? emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase()
        : null;

      // Use full_name first, then first part of email, then fallback
      const ownerName = profile?.full_name || capitalizedEmailName || "Alguien";

      const result = await sendAssignmentNotification(
        helper_contact,
        helper_name,
        ownerName,
        action.title,
        custom_message || null,
        publicUrl
      );

      if (result.success && result.messageId) {
        notificationSent = true;
        // Update assignment with notification info
        await supabaseServer
          .from("action_assignments")
          .update({
            notification_sent_at: new Date().toISOString(),
            notification_message_id: result.messageId,
          })
          .eq("id", assignment.id);
      } else {
        notificationError = result.error;
      }
    }

    return NextResponse.json({
      success: true,
      assignment,
      public_url: publicUrl,
      notification_sent: notificationSent,
      notification_error: notificationError,
    });
  } catch (error) {
    console.error("Error in POST /api/assignments:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET - Listar asignaciones de una acción
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const actionId = searchParams.get("action_id");

    if (!actionId) {
      return NextResponse.json(
        { success: false, error: "action_id es requerido" },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene acceso a esta acción
    const { data: action, error: actionError } = await supabaseServer
      .from("experiment_actions")
      .select("id, experiments!inner(user_id)")
      .eq("id", actionId)
      .single();

    if (actionError || !action) {
      return NextResponse.json(
        { success: false, error: "Acción no encontrada" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expDataGet = action.experiments as any;
    const experimentUserId = expDataGet?.user_id || expDataGet?.[0]?.user_id;
    if (experimentUserId !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para ver estas asignaciones" },
        { status: 403 }
      );
    }

    // Obtener asignaciones
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("action_assignments")
      .select("*")
      .eq("action_id", actionId)
      .order("created_at", { ascending: false });

    if (assignmentsError) {
      console.error("Error fetching assignments:", assignmentsError);
      return NextResponse.json(
        { success: false, error: "Error al obtener asignaciones" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assignments: assignments || [],
    });
  } catch (error) {
    console.error("Error in GET /api/assignments:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
