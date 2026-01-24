import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendVicuReminderTemplate, isKapsoConfigured } from "@/lib/kapso";

/**
 * Test endpoint to send a WhatsApp message to specific users
 *
 * Usage:
 * GET /api/admin/test-send?user_ids=uuid1,uuid2,uuid3
 * GET /api/admin/test-send?phones=+51999888777,+573001234567
 * GET /api/admin/test-send?dry_run=true (just show who would receive)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userIds = searchParams.get("user_ids")?.split(",").filter(Boolean) || [];
  const phones = searchParams.get("phones")?.split(",").filter(Boolean) || [];
  const dryRun = searchParams.get("dry_run") === "true";
  const message = searchParams.get("message") || "Hola, este es un mensaje de prueba de VICU. Si lo recibes, tu WhatsApp está configurado correctamente.";

  if (!isKapsoConfigured()) {
    return NextResponse.json({ error: "Kapso not configured" }, { status: 500 });
  }

  // Get users to send to
  let query = supabaseServer
    .from("whatsapp_config")
    .select("id, user_id, phone_number")
    .eq("is_active", true);

  if (userIds.length > 0) {
    query = query.in("user_id", userIds);
  }

  const { data: configs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by phone if specified
  let targetConfigs = configs || [];
  if (phones.length > 0) {
    targetConfigs = targetConfigs.filter(c => {
      const cleanConfigPhone = c.phone_number?.replace(/[\s\-+]/g, "") || "";
      return phones.some(p => {
        const cleanTargetPhone = p.replace(/[\s\-+]/g, "");
        return cleanConfigPhone === cleanTargetPhone || cleanConfigPhone.endsWith(cleanTargetPhone);
      });
    });
  }

  if (targetConfigs.length === 0) {
    return NextResponse.json({
      error: "No matching users found",
      user_ids_provided: userIds,
      phones_provided: phones,
    }, { status: 404 });
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      message: "Would send to these users",
      targets: targetConfigs.map(c => ({
        user_id: c.user_id,
        phone: c.phone_number,
        phone_last4: c.phone_number?.slice(-4),
      })),
      test_message: message,
    });
  }

  // Send messages
  const results = [];
  for (const config of targetConfigs) {
    const result = await sendVicuReminderTemplate(config.phone_number, message);
    results.push({
      user_id: config.user_id,
      phone: config.phone_number,
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  }

  return NextResponse.json({
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  });
}
