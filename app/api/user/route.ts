import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Get the authenticated user from the request
async function getAuthenticatedUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

// DELETE - Delete user account and all associated data
export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log(`[User Delete] Starting account deletion for user ${userId} (${user.email})`);

    // Use service role client to bypass RLS and delete user
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Delete in order to respect foreign key constraints
    // 1. Delete whatsapp_pending_actions (depends on experiments)
    const { error: pendingActionsError } = await supabaseAdmin
      .from("whatsapp_pending_actions")
      .delete()
      .eq("user_id", userId);
    if (pendingActionsError) {
      console.error("[User Delete] Error deleting pending actions:", pendingActionsError);
    }

    // 2. Delete whatsapp_reminders
    const { error: remindersError } = await supabaseAdmin
      .from("whatsapp_reminders")
      .delete()
      .eq("user_id", userId);
    if (remindersError) {
      console.error("[User Delete] Error deleting reminders:", remindersError);
    }

    // 3. Delete web_push_subscriptions
    const { error: pushError } = await supabaseAdmin
      .from("web_push_subscriptions")
      .delete()
      .eq("user_id", userId);
    if (pushError) {
      console.error("[User Delete] Error deleting push subscriptions:", pushError);
    }

    // 4. Delete xp_events
    const { error: xpError } = await supabaseAdmin
      .from("xp_events")
      .delete()
      .eq("user_id", userId);
    if (xpError) {
      console.error("[User Delete] Error deleting xp events:", xpError);
    }

    // 5. Delete user_stats
    const { error: statsError } = await supabaseAdmin
      .from("user_stats")
      .delete()
      .eq("user_id", userId);
    if (statsError) {
      console.error("[User Delete] Error deleting user stats:", statsError);
    }

    // 6. Delete whatsapp_config
    const { error: waConfigError } = await supabaseAdmin
      .from("whatsapp_config")
      .delete()
      .eq("user_id", userId);
    if (waConfigError) {
      console.error("[User Delete] Error deleting whatsapp config:", waConfigError);
    }

    // 7. Get user's experiments to delete related data
    const { data: experiments } = await supabaseAdmin
      .from("experiments")
      .select("id")
      .eq("user_id", userId);

    const experimentIds = experiments?.map((e) => e.id) || [];

    if (experimentIds.length > 0) {
      // 8. Delete experiment_checkins
      const { error: checkinsError } = await supabaseAdmin
        .from("experiment_checkins")
        .delete()
        .in("experiment_id", experimentIds);
      if (checkinsError) {
        console.error("[User Delete] Error deleting checkins:", checkinsError);
      }

      // 9. Delete steps (experiment actions)
      const { error: stepsError } = await supabaseAdmin
        .from("steps")
        .delete()
        .in("experiment_id", experimentIds);
      if (stepsError) {
        console.error("[User Delete] Error deleting steps:", stepsError);
      }
    }

    // 10. Delete experiments
    const { error: experimentsError } = await supabaseAdmin
      .from("experiments")
      .delete()
      .eq("user_id", userId);
    if (experimentsError) {
      console.error("[User Delete] Error deleting experiments:", experimentsError);
    }

    // 11. Finally, delete the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("[User Delete] Error deleting auth user:", authError);
      return NextResponse.json(
        { success: false, error: "Error al eliminar cuenta de usuario" },
        { status: 500 }
      );
    }

    console.log(`[User Delete] Successfully deleted user ${userId} (${user.email})`);

    return NextResponse.json({
      success: true,
      message: "Cuenta eliminada exitosamente",
    });
  } catch (error) {
    console.error("[User Delete] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno al eliminar cuenta" },
      { status: 500 }
    );
  }
}
