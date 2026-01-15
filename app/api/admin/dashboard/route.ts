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

    // Get ALL checkins for engagement metrics
    const { data: allCheckins } = await supabase
      .from("experiment_checkins")
      .select("experiment_id, created_at, status, source");

    // Get WhatsApp reminders for response rate
    const { data: allReminders } = await supabase
      .from("whatsapp_reminders")
      .select("user_id, sent_at, message_status");

    // Get pending actions (to track response rates AND WhatsApp interactions)
    const { data: pendingActions } = await supabase
      .from("whatsapp_pending_actions")
      .select("user_id, created_at, was_completed, status, updated_at");

    // Get recent WhatsApp interactions (users who responded to messages)
    const { data: recentWhatsappInteractions } = await supabase
      .from("whatsapp_pending_actions")
      .select("user_id, updated_at")
      .neq("status", "pending") // They responded (completed, skipped, etc)
      .gte("updated_at", weekAgo.toISOString());

    // Map checkins to users via experiments
    const experimentToUser = new Map(
      experiments?.map(e => [e.id, e.user_id]) || []
    );
    const activeUserIds = new Set<string>();

    // Add users with recent checkins
    recentCheckins?.forEach(c => {
      const userId = experimentToUser.get(c.experiment_id);
      if (userId) activeUserIds.add(userId);
    });

    // Also add users who responded to WhatsApp messages recently
    recentWhatsappInteractions?.forEach(i => {
      if (i.user_id) activeUserIds.add(i.user_id);
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

    // Calculate checkins per user (for engagement metrics)
    const checkinsByUser = new Map<string, number>();
    const whatsappCheckinsByUser = new Map<string, number>();
    allCheckins?.forEach(c => {
      const userId = experimentToUser.get(c.experiment_id);
      if (userId) {
        checkinsByUser.set(userId, (checkinsByUser.get(userId) || 0) + 1);
        if (c.source === 'whatsapp') {
          whatsappCheckinsByUser.set(userId, (whatsappCheckinsByUser.get(userId) || 0) + 1);
        }
      }
    });

    // Count WhatsApp interactions per user (responded to messages)
    const whatsappInteractionsByUser = new Map<string, number>();
    pendingActions?.forEach(a => {
      if (a.user_id && a.status !== "pending") {
        whatsappInteractionsByUser.set(a.user_id, (whatsappInteractionsByUser.get(a.user_id) || 0) + 1);
      }
    });

    // Get last activity date per user (checkins + WhatsApp interactions)
    const lastActivityByUser = new Map<string, Date>();

    // From checkins
    allCheckins?.forEach(c => {
      const userId = experimentToUser.get(c.experiment_id);
      if (userId) {
        const checkinDate = new Date(c.created_at);
        const current = lastActivityByUser.get(userId);
        if (!current || checkinDate > current) {
          lastActivityByUser.set(userId, checkinDate);
        }
      }
    });

    // From WhatsApp interactions (when they responded)
    pendingActions?.forEach(a => {
      if (a.user_id && a.status !== "pending" && a.updated_at) {
        const interactionDate = new Date(a.updated_at);
        const current = lastActivityByUser.get(a.user_id);
        if (!current || interactionDate > current) {
          lastActivityByUser.set(a.user_id, interactionDate);
        }
      }
    });

    // Build enriched users list
    const enrichedUsers = users.map(u => {
      const lastActivity = lastActivityByUser.get(u.id);
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: u.id,
        email: u.email || "-",
        created_at: u.created_at,
        whatsapp_active: whatsappByUser.get(u.id)?.is_active || false,
        phone: whatsappByUser.get(u.id)?.phone_number || null,
        total_objectives: objectivesByUser.get(u.id) || 0,
        active_objectives: activeObjectivesByUser.get(u.id) || 0,
        active_last_7d: activeUserIds.has(u.id),
        total_checkins: checkinsByUser.get(u.id) || 0,
        whatsapp_checkins: whatsappCheckinsByUser.get(u.id) || 0,
        whatsapp_interactions: whatsappInteractionsByUser.get(u.id) || 0,
        last_activity: lastActivity?.toISOString() || null,
        days_since_activity: daysSinceActivity,
      };
    });

    // Sort by created_at desc
    enrichedUsers.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Calculate totals (needed for funnel)
    const totalUsers = users.length;
    const activeUsersCount = enrichedUsers.filter(u => u.active_last_7d).length;

    // === CONVERSION FUNNEL ===
    const usersWithObjectives = enrichedUsers.filter(u => u.total_objectives > 0).length;
    const usersWithWhatsApp = enrichedUsers.filter(u => u.whatsapp_active).length;
    const usersWithWhatsAppAndObjectives = enrichedUsers.filter(u => u.whatsapp_active && u.total_objectives > 0).length;
    const usersWithActivity = enrichedUsers.filter(u => u.total_checkins > 0).length;
    const usersActiveRecently = activeUsersCount;

    const funnel = {
      registered: totalUsers,
      has_objective: usersWithObjectives,
      has_whatsapp: usersWithWhatsApp,
      has_both: usersWithWhatsAppAndObjectives,
      has_activity: usersWithActivity,
      active_7d: usersActiveRecently,
      // Conversion rates
      rate_objective: totalUsers > 0 ? Math.round((usersWithObjectives / totalUsers) * 100) : 0,
      rate_whatsapp: totalUsers > 0 ? Math.round((usersWithWhatsApp / totalUsers) * 100) : 0,
      rate_both: totalUsers > 0 ? Math.round((usersWithWhatsAppAndObjectives / totalUsers) * 100) : 0,
      rate_activity: totalUsers > 0 ? Math.round((usersWithActivity / totalUsers) * 100) : 0,
      rate_active_7d: totalUsers > 0 ? Math.round((usersActiveRecently / totalUsers) * 100) : 0,
    };

    // === AT-RISK USERS ===
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const atRiskUsers = enrichedUsers.filter(u => {
      // Users registered > 3 days ago with no objectives
      const registeredDaysAgo = Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const noObjectives = u.total_objectives === 0 && registeredDaysAgo > 3;

      // Users with objectives but no WhatsApp (registered > 3 days ago)
      const noWhatsApp = u.total_objectives > 0 && !u.whatsapp_active && registeredDaysAgo > 3;

      // Users inactive for 7+ days (had activity before)
      const inactiveWeek = u.days_since_activity !== null && u.days_since_activity >= 7;

      return noObjectives || noWhatsApp || inactiveWeek;
    }).map(u => {
      const registeredDaysAgo = Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24));
      let risk_reason = '';
      if (u.total_objectives === 0) {
        risk_reason = 'Sin objetivos';
      } else if (!u.whatsapp_active) {
        risk_reason = 'Sin WhatsApp';
      } else if (u.days_since_activity !== null && u.days_since_activity >= 7) {
        risk_reason = `Inactivo ${u.days_since_activity}d`;
      }
      return {
        ...u,
        risk_reason,
        registered_days_ago: registeredDaysAgo,
      };
    });

    // === ENGAGEMENT METRICS ===
    const usersWithCheckins = enrichedUsers.filter(u => u.total_checkins > 0);
    const avgCheckinsPerUser = usersWithCheckins.length > 0
      ? Math.round((usersWithCheckins.reduce((sum, u) => sum + u.total_checkins, 0) / usersWithCheckins.length) * 10) / 10
      : 0;

    const whatsappUsers = enrichedUsers.filter(u => u.whatsapp_active);
    const whatsappUsersWithActivity = whatsappUsers.filter(u => u.whatsapp_checkins > 0);
    const whatsappResponseRate = whatsappUsers.length > 0
      ? Math.round((whatsappUsersWithActivity.length / whatsappUsers.length) * 100)
      : 0;

    // Response rate from pending actions
    const completedActions = pendingActions?.filter(a => a.was_completed).length || 0;
    const totalPendingActions = pendingActions?.length || 0;
    const actionCompletionRate = totalPendingActions > 0
      ? Math.round((completedActions / totalPendingActions) * 100)
      : 0;

    const engagement = {
      avg_checkins_per_user: avgCheckinsPerUser,
      whatsapp_response_rate: whatsappResponseRate,
      action_completion_rate: actionCompletionRate,
      total_checkins: allCheckins?.length || 0,
      whatsapp_checkins: allCheckins?.filter(c => c.source === 'whatsapp').length || 0,
    };

    // Calculate remaining totals
    const whatsappActiveCount = enrichedUsers.filter(u => u.whatsapp_active).length;
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

      const objectivesCreatedOnDay = experiments?.filter(e => {
        const d = new Date(e.created_at);
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
        objectives_created: objectivesCreatedOnDay,
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
      funnel,
      at_risk_users: atRiskUsers,
      engagement,
      daily_activity: dailyActivity,
      users: enrichedUsers,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
