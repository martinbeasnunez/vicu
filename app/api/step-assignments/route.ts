import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getAuthUserId } from "@/lib/auth-server";
import { randomUUID } from "crypto";
import { sendAssignmentNotification, isKapsoConfigured } from "@/lib/kapso";

export interface StepAssignment {
  id: string;
  checkin_id: string;
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

// POST - Crear nueva asignación de paso
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
    const { checkin_id, helper_name, helper_contact, contact_type, custom_message } = body;

    // Validaciones
    if (!checkin_id || !helper_name || !helper_contact || !contact_type) {
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

    // Verificar que el checkin existe y pertenece al usuario
    const { data: checkin, error: checkinError } = await supabaseServer
      .from("experiment_checkins")
      .select("id, experiment_id, step_title, step_description, experiments!inner(user_id, title)")
      .eq("id", checkin_id)
      .single();

    if (checkinError || !checkin) {
      return NextResponse.json(
        { success: false, error: "Paso no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que el usuario es owner del experimento
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expData = checkin.experiments as any;
    const experiment = {
      user_id: expData?.user_id || expData?.[0]?.user_id,
      title: expData?.title || expData?.[0]?.title || "Objetivo",
    };
    if (experiment.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para asignar este paso" },
        { status: 403 }
      );
    }

    // Generar token único y fecha de expiración (7 días)
    const accessToken = randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7);

    // Crear la asignación
    const { data: assignment, error: insertError } = await supabaseServer
      .from("step_assignments")
      .insert({
        checkin_id,
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
      console.error("Error creating step assignment:", insertError);
      return NextResponse.json(
        { success: false, error: "Error al crear la asignación" },
        { status: 500 }
      );
    }

    const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://vicu.app"}/s/${accessToken}`;
    let notificationSent = false;
    let notificationError: string | undefined;

    // Try to send WhatsApp notification if contact_type is whatsapp
    if (contact_type === "whatsapp" && isKapsoConfigured()) {
      // Get owner's name from profile
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const ownerName = profile?.full_name || "Alguien";
      const stepTitle = checkin.step_title || "un paso de su objetivo";

      const result = await sendAssignmentNotification(
        helper_contact,
        helper_name,
        ownerName,
        stepTitle,
        custom_message || null,
        publicUrl
      );

      if (result.success && result.messageId) {
        notificationSent = true;
        // Update assignment with notification info
        await supabaseServer
          .from("step_assignments")
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
    console.error("Error in POST /api/step-assignments:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// GET - Listar asignaciones de un paso
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
    const checkinId = searchParams.get("checkin_id");

    if (!checkinId) {
      return NextResponse.json(
        { success: false, error: "checkin_id es requerido" },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene acceso a este checkin
    const { data: checkin, error: checkinError } = await supabaseServer
      .from("experiment_checkins")
      .select("id, experiments!inner(user_id)")
      .eq("id", checkinId)
      .single();

    if (checkinError || !checkin) {
      return NextResponse.json(
        { success: false, error: "Paso no encontrado" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expDataGet = checkin.experiments as any;
    const experimentUserId = expDataGet?.user_id || expDataGet?.[0]?.user_id;
    if (experimentUserId !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permiso para ver estas asignaciones" },
        { status: 403 }
      );
    }

    // Obtener asignaciones
    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("step_assignments")
      .select("*")
      .eq("checkin_id", checkinId)
      .order("created_at", { ascending: false });

    if (assignmentsError) {
      console.error("Error fetching step assignments:", assignmentsError);
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
    console.error("Error in GET /api/step-assignments:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
