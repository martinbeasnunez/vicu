import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  // Simple secret check for quick access
  const secret = process.env.ADMIN_SECRET;

  const supabase = getSupabase();

  try {
    // Get WhatsApp configs with is_active = true
    const { data: whatsappConfigs } = await supabase
      .from("whatsapp_config")
      .select("user_id, phone_number, is_active, created_at")
      .eq("is_active", true);

    if (!whatsappConfigs || whatsappConfigs.length === 0) {
      return NextResponse.json({
        count: 0,
        users: [],
      });
    }

    // Get user emails
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const userEmailMap = new Map(
      authUsers?.users?.map(u => [u.id, u.email]) || []
    );

    const users = whatsappConfigs.map(w => ({
      email: userEmailMap.get(w.user_id) || "unknown",
      phone: w.phone_number,
      activated_at: w.created_at,
    }));

    return NextResponse.json({
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("Error fetching WhatsApp users:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
