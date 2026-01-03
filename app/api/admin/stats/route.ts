import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Simple admin stats endpoint - access with /api/admin/stats?key=vicu2024
// Add ?debug=martin to see martin@getlavado.com experiments
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug");

  // Debug mode: show martin's experiments with deleted_at status
  if (debug === "martin") {
    const { data: adminUser } = await supabaseServer.auth.admin.listUsers();
    const adminUserId = adminUser?.users?.find((u) => u.email === "martin@getlavado.com")?.id;

    if (!adminUserId) {
      return NextResponse.json({ error: "Admin user not found" });
    }

    const { data: martinExps } = await supabaseServer
      .from("experiments")
      .select("id, title, status, deleted_at, created_at")
      .eq("user_id", adminUserId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      user_id: adminUserId,
      total: martinExps?.length || 0,
      activos: martinExps?.filter(e => !e.deleted_at).length || 0,
      borrados: martinExps?.filter(e => e.deleted_at).length || 0,
      experimentos: martinExps?.map(e => ({
        titulo: e.title,
        estado: e.status,
        borrado: e.deleted_at ? new Date(e.deleted_at).toLocaleDateString("es-PE") : null,
      })),
    });
  }

  const key = searchParams.get("key");

  // Simple auth check
  if (key !== "vicu2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all users from auth.users via experiments table (unique user_ids)
  const { data: experiments, error: expError } = await supabaseServer
    .from("experiments")
    .select("user_id, title, description, created_at, status, deleted_at")
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
    borrado: e.deleted_at ? "SI" : "no",
    fecha: new Date(e.created_at).toLocaleDateString("es-PE"),
  }));

  // Get WhatsApp configs to see who has it enabled
  const { data: whatsappConfigs } = await supabaseServer
    .from("whatsapp_config")
    .select("user_id, phone_number, is_active, created_at");

  const whatsappUsers = whatsappConfigs?.filter(c => c.is_active && c.user_id !== adminUserId) || [];

  return NextResponse.json({
    resumen: {
      usuarios_totales: realUsers.size,
      usuarios_con_demo: uniqueUsers.size,
      objetivos_totales: realExperiments.length,
      objetivos_ultimos_7_dias: recentExperiments.length,
      usuarios_con_whatsapp: whatsappUsers.length,
    },
    whatsapp_activos: whatsappUsers.map(w => ({
      telefono: w.phone_number ? `***${w.phone_number.slice(-4)}` : "unknown",
      desde: new Date(w.created_at).toLocaleDateString("es-PE"),
    })),
    ultimos_20_objetivos: goalSummary,
  });
}
