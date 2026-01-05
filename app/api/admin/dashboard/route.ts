import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "martin@getlavado.com";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  // Verify admin access
  const authHeader = request.headers.get("authorization");
  let isAdmin = false;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    const { data: { user } } = await supabase.auth.getUser(token);
    isAdmin = user?.email === ADMIN_EMAIL;
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get users from Supabase Auth
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const users = authUsers?.users || [];

    // Get WhatsApp configs
    const { data: whatsappConfigs } = await supabase
      .from("whatsapp_config")
      .select("user_id, phone_number, is_active");

    const whatsappByUser = new Map(
      whatsappConfigs?.map(w => [w.user_id, w]) || []
    );

    // Get all experiments (objectives)
    const { data: experiments } = await supabase
      .from("experiments")
      .select("id, user_id, title, status, created_at")
      .is("deleted_at", null);

    // Count objectives by user
    const objectivesByUser = new Map<string, number>();
    const activeObjectivesByUser = new Map<string, number>();
    experiments?.forEach(e => {
      objectivesByUser.set(e.user_id, (objectivesByUser.get(e.user_id) || 0) + 1);
      if (e.status !== "completed" && e.status !== "abandoned") {
        activeObjectivesByUser.set(e.user_id, (activeObjectivesByUser.get(e.user_id) || 0) + 1);
      }
    });

    // Get checkins (activity)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: recentCheckins } = await supabase
      .from("experiment_checkins")
      .select("experiment_id, created_at")
      .gte("created_at", weekAgo.toISOString());

    // Map checkins to users via experiments
    const experimentToUser = new Map(
      experiments?.map(e => [e.id, e.user_id]) || []
    );
    const activeUserIds = new Set<string>();
    recentCheckins?.forEach(c => {
      const userId = experimentToUser.get(c.experiment_id);
      if (userId) activeUserIds.add(userId);
    });

    // Get reminders
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: remindersToday } = await supabase
      .from("whatsapp_reminders")
      .select("*", { count: "exact", head: true })
      .gte("sent_at", today.toISOString());

    const { count: remindersWeek } = await supabase
      .from("whatsapp_reminders")
      .select("*", { count: "exact", head: true })
      .gte("sent_at", weekAgo.toISOString());

    // Build enriched users list
    const enrichedUsers = users.map(u => ({
      id: u.id,
      email: u.email || "-",
      created_at: u.created_at,
      whatsapp_active: whatsappByUser.get(u.id)?.is_active || false,
      phone: whatsappByUser.get(u.id)?.phone_number || null,
      total_objectives: objectivesByUser.get(u.id) || 0,
      active_objectives: activeObjectivesByUser.get(u.id) || 0,
      active_last_7d: activeUserIds.has(u.id),
    }));

    // Sort by created_at desc
    enrichedUsers.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Calculate totals
    const totalUsers = users.length;
    const whatsappActiveCount = enrichedUsers.filter(u => u.whatsapp_active).length;
    const activeUsersCount = enrichedUsers.filter(u => u.active_last_7d).length;
    const totalObjectives = experiments?.length || 0;
    const activeObjectives = experiments?.filter(
      e => e.status !== "completed" && e.status !== "abandoned"
    ).length || 0;

    // New users
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const newUsersWeek = users.filter(u =>
      new Date(u.created_at) >= weekAgo
    ).length;
    const newUsersMonth = users.filter(u =>
      new Date(u.created_at) >= monthAgo
    ).length;

    // Daily activity (checkins per day)
    const dailyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const checkinsOnDay = recentCheckins?.filter(c => {
        const d = new Date(c.created_at);
        return d >= date && d < nextDate;
      }).length || 0;

      const { count: remindersSent } = await supabase
        .from("whatsapp_reminders")
        .select("*", { count: "exact", head: true })
        .gte("sent_at", date.toISOString())
        .lt("sent_at", nextDate.toISOString());

      dailyActivity.push({
        date: date.toISOString().split("T")[0],
        checkins: checkinsOnDay,
        reminders_sent: remindersSent || 0,
      });
    }

    return NextResponse.json({
      overview: {
        total_users: totalUsers,
        whatsapp_users: whatsappActiveCount,
        active_users_week: activeUsersCount,
        new_users_week: newUsersWeek,
        new_users_month: newUsersMonth,
      },
      objectives: {
        total: totalObjectives,
        active: activeObjectives,
      },
      reminders: {
        sent_today: remindersToday || 0,
        sent_week: remindersWeek || 0,
      },
      daily_activity: dailyActivity,
      users: enrichedUsers,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
