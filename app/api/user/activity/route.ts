import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";

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

interface Activity {
  id: string;
  type: "checkin" | "badge" | "level_up" | "project_completed";
  description: string;
  date: string;
  xp?: number;
}

// GET - Get recent user activity
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const userId = user.id;
    const activities: Activity[] = [];

    // Get user's experiments
    const { data: experiments } = await supabaseServer
      .from("experiments")
      .select("id, title, status, created_at")
      .eq("user_id", userId);

    const experimentIds = experiments?.map((e) => e.id) || [];
    const experimentMap = new Map(experiments?.map((e) => [e.id, e]) || []);

    // Get recent checkins (last 7 days)
    if (experimentIds.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: checkins } = await supabaseServer
        .from("experiment_checkins")
        .select("id, experiment_id, created_at, status")
        .in("experiment_id", experimentIds)
        .eq("status", "done")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(20);

      if (checkins) {
        for (const checkin of checkins) {
          const experiment = experimentMap.get(checkin.experiment_id);
          activities.push({
            id: `checkin-${checkin.id}`,
            type: "checkin",
            description: experiment
              ? `Avanzaste en "${experiment.title}"`
              : "Marcaste un avance",
            date: checkin.created_at,
            xp: 10,
          });
        }
      }
    }

    // Get XP events for badges and level ups
    const { data: xpEvents } = await supabaseServer
      .from("xp_events")
      .select("id, reason, amount, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (xpEvents) {
      for (const event of xpEvents) {
        if (event.reason === "badge_unlocked" || event.reason?.includes("badge")) {
          activities.push({
            id: `xp-${event.id}`,
            type: "badge",
            description: "Desbloqueaste un nuevo badge",
            date: event.created_at,
            xp: event.amount,
          });
        } else if (event.reason === "level_up") {
          activities.push({
            id: `xp-${event.id}`,
            type: "level_up",
            description: "¡Subiste de nivel!",
            date: event.created_at,
            xp: event.amount,
          });
        }
      }
    }

    // Get achieved experiments (completed projects)
    const achievedExperiments = experiments?.filter((e) => e.status === "achieved") || [];
    for (const exp of achievedExperiments) {
      activities.push({
        id: `achieved-${exp.id}`,
        type: "project_completed",
        description: `¡Lograste "${exp.title}"!`,
        date: exp.created_at, // We'd need updated_at for accuracy
        xp: 100,
      });
    }

    // Sort by date, most recent first
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Return top 10 activities
    return NextResponse.json({
      success: true,
      activities: activities.slice(0, 10),
    });
  } catch (error) {
    console.error("[User Activity] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener actividad" },
      { status: 500 }
    );
  }
}
