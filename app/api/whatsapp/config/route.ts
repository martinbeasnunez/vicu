import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
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

// POST - Save WhatsApp config for the authenticated user
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { phone_number } = body;

    if (!phone_number) {
      return NextResponse.json(
        { success: false, error: "Número de teléfono requerido" },
        { status: 400 }
      );
    }

    // Format phone number
    let phone = phone_number.trim().replace(/\s+/g, "");
    if (!phone.startsWith("+")) {
      phone = "+51" + phone.replace(/^0+/, "");
    }

    // Upsert the config using server client (bypasses RLS)
    const { error } = await supabaseServer
      .from("whatsapp_config")
      .upsert({
        user_id: user.id,
        phone_number: phone,
        kapso_phone_number_id: "12083619224",
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      });

    if (error) {
      console.error("[WhatsApp Config] Error saving:", error);
      return NextResponse.json(
        { success: false, error: "Error al guardar configuración" },
        { status: 500 }
      );
    }

    console.log(`[WhatsApp Config] Saved for user ${user.id}: ${phone}`);

    return NextResponse.json({
      success: true,
      message: "Configuración guardada",
      phone_number: phone,
    });
  } catch (error) {
    console.error("[WhatsApp Config] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// GET - Get WhatsApp config for the authenticated user
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseServer
      .from("whatsapp_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") { // PGRST116 = no rows found
      console.error("[WhatsApp Config] Error fetching:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener configuración" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      config: data || null,
      is_configured: !!data,
      is_active: data?.is_active || false,
    });
  } catch (error) {
    console.error("[WhatsApp Config] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// DELETE - Disable WhatsApp for the authenticated user
export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { error } = await supabaseServer
      .from("whatsapp_config")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      console.error("[WhatsApp Config] Error disabling:", error);
      return NextResponse.json(
        { success: false, error: "Error al desactivar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "WhatsApp desactivado",
    });
  } catch (error) {
    console.error("[WhatsApp Config] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// PATCH - Re-enable WhatsApp for the authenticated user (without changing phone)
export async function PATCH() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { error } = await supabaseServer
      .from("whatsapp_config")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      console.error("[WhatsApp Config] Error enabling:", error);
      return NextResponse.json(
        { success: false, error: "Error al activar" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "WhatsApp activado",
    });
  } catch (error) {
    console.error("[WhatsApp Config] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
