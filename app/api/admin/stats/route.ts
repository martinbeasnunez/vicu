import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Simple admin stats endpoint - access with /api/admin/stats?key=vicu2024
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  // Simple auth check
  if (key !== "vicu2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all users from auth.users via experiments table (unique user_ids)
  const { data: experiments, error: expError } = await supabaseServer
    .from("experiments")
    .select("user_id, title, description, created_at, status")
    .order("created_at", { ascending: false });

  if (expError) {
    return NextResponse.json({ error: expError.message }, { status: 500 });
  }

  // Count unique users
  const uniqueUsers = new Set(experiments?.map((e) => e.user_id) || []);

  // Get admin user ID to exclude
  const { data: adminUser } = await supabaseServer.auth.admin.listUsers();
  const adminEmail = "martin@getlavado.com";
  const adminUserId = adminUser?.users?.find((u) => u.email === adminEmail)?.id;

  // Filter out demo-user and admin experiments
  const realExperiments = experiments?.filter((e) =>
    e.user_id !== "demo-user" &&
    e.user_id !== adminUserId
  ) || [];
  const realUsers = new Set(realExperiments.map((e) => e.user_id));

  // Get recent experiments (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentExperiments = realExperiments.filter(
    (e) => new Date(e.created_at) > sevenDaysAgo
  );

  // Group experiments by goal type (extract from title/description)
  const goalSummary = realExperiments.slice(0, 20).map((e) => ({
    titulo: e.title,
    estado: e.status,
    fecha: new Date(e.created_at).toLocaleDateString("es-PE"),
  }));

  return NextResponse.json({
    resumen: {
      usuarios_totales: realUsers.size,
      usuarios_con_demo: uniqueUsers.size,
      objetivos_totales: realExperiments.length,
      objetivos_ultimos_7_dias: recentExperiments.length,
    },
    ultimos_20_objetivos: goalSummary,
  });
}
