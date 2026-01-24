import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendAssignmentReminder, sendOwnerNotification, isKapsoConfigured } from "@/lib/kapso";

/**
 * Cron job to send reminders for pending assignments
 *
 * Schedule: Runs daily at 10am Lima time (15:00 UTC)
 *
 * Logic:
 * - Day 2: First reminder to helper
 * - Day 5: Final reminder to helper + notify owner to find alternative
 * - Day 7: Mark as expired + notify owner
 */
// Support both GET (cron-job.org) and POST (Vercel crons)
export async function GET(request: NextRequest) {
  return handleReminders();
}

export async function POST(request: NextRequest) {
  return handleReminders();
}

async function handleReminders() {
  if (!isKapsoConfigured()) {
    return NextResponse.json({ error: "Kapso not configured" }, { status: 500 });
  }

  const now = new Date();
  const results = {
    day2Reminders: 0,
    day5Reminders: 0,
    expired: 0,
    errors: [] as string[],
  };

  try {
    // Get all pending step_assignments
    const { data: stepAssignments, error: stepError } = await supabaseServer
      .from("step_assignments")
      .select(`
        id,
        helper_name,
        helper_contact,
        access_token,
        created_at,
        reminder_count,
        checkin_id,
        assigned_by,
        experiment_checkins!inner(
          step_title,
          experiments!inner(
            title,
            user_id
          )
        )
      `)
      .eq("status", "pending")
      .not("notification_sent_at", "is", null);

    if (stepError) {
      console.error("Error fetching step assignments:", stepError);
      results.errors.push(`Step assignments fetch error: ${stepError.message}`);
    }

    // Process step assignments
    for (const assignment of stepAssignments || []) {
      const createdAt = new Date(assignment.created_at);
      const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount = assignment.reminder_count || 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checkinData = assignment.experiment_checkins as any;
      const stepTitle = checkinData?.step_title || "una tarea";
      const experimentTitle = checkinData?.experiments?.title || "su objetivo";
      const ownerId = checkinData?.experiments?.user_id;

      const publicUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://vicu.vercel.app"}/s/${assignment.access_token}`;

      // Get owner info
      const { data: ownerProfile } = await supabaseServer
        .from("profiles")
        .select("full_name")
        .eq("id", ownerId)
        .single();

      const { data: authUser } = await supabaseServer.auth.admin.getUserById(ownerId);
      const email = authUser?.user?.email;
      const emailName = email ? email.split("@")[0].split(/[._-]/)[0] : null;
      const ownerName = ownerProfile?.full_name ||
        (emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1).toLowerCase() : "Tu amigo");

      // Get owner's WhatsApp for notifications
      const { data: ownerWhatsapp } = await supabaseServer
        .from("whatsapp_configs")
        .select("phone_number")
        .eq("user_id", ownerId)
        .eq("is_active", true)
        .single();

      try {
        // Day 2: First reminder (if not sent yet)
        if (daysSinceCreated >= 2 && reminderCount === 0) {
          const result = await sendAssignmentReminder(
            assignment.helper_contact,
            assignment.helper_name,
            ownerName,
            stepTitle,
            publicUrl,
            1 // first reminder
          );

          if (result.success) {
            await supabaseServer
              .from("step_assignments")
              .update({
                reminder_count: 1,
                last_reminder_at: now.toISOString()
              })
              .eq("id", assignment.id);
            results.day2Reminders++;
          }
        }
        // Day 5: Final reminder + notify owner
        else if (daysSinceCreated >= 5 && reminderCount === 1) {
          // Send final reminder to helper
          const result = await sendAssignmentReminder(
            assignment.helper_contact,
            assignment.helper_name,
            ownerName,
            stepTitle,
            publicUrl,
            2 // final reminder
          );

          if (result.success) {
            await supabaseServer
              .from("step_assignments")
              .update({
                reminder_count: 2,
                last_reminder_at: now.toISOString()
              })
              .eq("id", assignment.id);
            results.day5Reminders++;
          }

          // Notify owner to find alternative
          if (ownerWhatsapp?.phone_number) {
            await sendOwnerNotification(
              ownerWhatsapp.phone_number,
              assignment.helper_name,
              stepTitle,
              "no_response"
            );
          }
        }
        // Day 7: Expire
        else if (daysSinceCreated >= 7 && reminderCount >= 2) {
          await supabaseServer
            .from("step_assignments")
            .update({ status: "expired" })
            .eq("id", assignment.id);
          results.expired++;

          // Notify owner
          if (ownerWhatsapp?.phone_number) {
            await sendOwnerNotification(
              ownerWhatsapp.phone_number,
              assignment.helper_name,
              stepTitle,
              "expired"
            );
          }
        }
      } catch (err) {
        results.errors.push(`Step ${assignment.id}: ${err}`);
      }
    }

    console.log("[Assignment Reminders] Results:", results);

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("[Assignment Reminders] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
