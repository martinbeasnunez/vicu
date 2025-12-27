import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  isKapsoConfigured,
  sendWhatsAppMessage,
  buildReminderMessage,
  WhatsAppConfig,
} from "@/lib/kapso";

// Lazy initialization to avoid build-time errors
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

const DEFAULT_USER_ID = "demo-user";

interface PendingCheckin {
  id: string;
  experiment_id: string;
  step_title: string;
  step_description: string;
  status: string;
}

interface Experiment {
  id: string;
  title: string;
  status: string;
}

/**
 * POST /api/kapso/send-reminder
 *
 * Sends a WhatsApp reminder for the next pending step.
 * Can be called manually or by a cron job.
 *
 * Optional body:
 * - user_id: string (default: "demo-user")
 * - experiment_id: string (optional, to target specific experiment)
 */
export async function POST(request: NextRequest) {
  try {
    // Check if Kapso is configured
    if (!isKapsoConfigured()) {
      console.warn("[Kapso] API key not configured. Skipping reminder.");
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: "KAPSO_API_KEY not configured",
      });
    }

    // Parse optional body
    let userId = DEFAULT_USER_ID;
    let targetExperimentId: string | null = null;

    try {
      const body = await request.json();
      if (body.user_id) userId = body.user_id;
      if (body.experiment_id) targetExperimentId = body.experiment_id;
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Get WhatsApp config for user
    const { data: config, error: configError } = await getSupabase()
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (configError || !config) {
      return NextResponse.json({
        success: false,
        error: "No WhatsApp configuration found for user",
        hint: "Insert a row into whatsapp_config with user phone number",
      }, { status: 404 });
    }

    const whatsappConfig = config as WhatsAppConfig;

    // Find a pending checkin to remind about
    let query = getSupabase()
      .from("experiment_checkins")
      .select(`
        id,
        experiment_id,
        step_title,
        step_description,
        status
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (targetExperimentId) {
      query = query.eq("experiment_id", targetExperimentId);
    }

    const { data: pendingCheckins, error: checkinError } = await query;

    // If no pending checkin, look for active experiments without recent check-ins
    let checkinToRemind: PendingCheckin | null = null;
    let experiment: Experiment | null = null;

    if (pendingCheckins && pendingCheckins.length > 0) {
      checkinToRemind = pendingCheckins[0] as PendingCheckin;

      // Get experiment details
      const { data: exp } = await getSupabase()
        .from("experiments")
        .select("id, title, status")
        .eq("id", checkinToRemind.experiment_id)
        .single();

      experiment = exp as Experiment;
    } else {
      // No pending checkin - find an active experiment that needs attention
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let expQuery = getSupabase()
        .from("experiments")
        .select("id, title, status, last_checkin_at")
        .is("deleted_at", null)
        .in("status", ["queued", "building", "testing", "adjusting"])
        .order("last_checkin_at", { ascending: true, nullsFirst: true })
        .limit(1);

      if (targetExperimentId) {
        expQuery = expQuery.eq("id", targetExperimentId);
      }

      const { data: experiments } = await expQuery;

      if (experiments && experiments.length > 0) {
        experiment = experiments[0] as Experiment;

        // Generate a step suggestion for this experiment
        // For now, use a simple default message
        checkinToRemind = {
          id: "", // No checkin ID yet
          experiment_id: experiment.id,
          step_title: "Avanza un paso en tu proyecto",
          step_description: "Dedica 10 minutos a mover este proyecto hacia adelante.",
          status: "pending",
        };
      }
    }

    if (!experiment) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No active experiments to remind about",
      });
    }

    // Check if we already sent a reminder for this experiment today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: recentReminders } = await getSupabase()
      .from("whatsapp_reminders")
      .select("id")
      .eq("experiment_id", experiment.id)
      .gte("sent_at", todayStart.toISOString())
      .limit(1);

    if (recentReminders && recentReminders.length > 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Already sent a reminder for this experiment today",
        experiment_id: experiment.id,
      });
    }

    // Build and send the message
    const message = buildReminderMessage(
      experiment.title,
      checkinToRemind?.step_title || "Avanza un paso",
      checkinToRemind?.step_description
    );

    const sendResult = await sendWhatsAppMessage(whatsappConfig.phone_number, message);

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error,
      }, { status: 500 });
    }

    // Record the reminder in database
    const { error: insertError } = await getSupabase()
      .from("whatsapp_reminders")
      .insert({
        user_id: userId,
        experiment_id: experiment.id,
        checkin_id: checkinToRemind?.id || null,
        message_content: message,
        step_title: checkinToRemind?.step_title,
        step_description: checkinToRemind?.step_description,
        status: "sent",
        kapso_message_id: sendResult.messageId,
      });

    if (insertError) {
      console.error("[Kapso] Failed to record reminder:", insertError);
      // Don't fail the request, message was sent successfully
    }

    return NextResponse.json({
      success: true,
      message_id: sendResult.messageId,
      experiment: {
        id: experiment.id,
        title: experiment.title,
      },
      step: checkinToRemind?.step_title,
    });
  } catch (error) {
    console.error("[Kapso] Error sending reminder:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kapso/send-reminder
 *
 * Check configuration status
 */
export async function GET() {
  const configured = isKapsoConfigured();

  // Check if user has WhatsApp config
  const { data: config } = await getSupabase()
    .from("whatsapp_config")
    .select("phone_number, is_active")
    .eq("user_id", DEFAULT_USER_ID)
    .single();

  return NextResponse.json({
    kapso_configured: configured,
    user_config: config ? {
      phone_configured: !!config.phone_number,
      is_active: config.is_active,
    } : null,
    hint: !configured
      ? "Set KAPSO_API_KEY environment variable"
      : !config
        ? "Insert row into whatsapp_config table"
        : "Ready to send reminders",
  });
}
