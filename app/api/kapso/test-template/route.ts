import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppTemplate } from "@/lib/kapso";

/**
 * Test endpoint to send a WhatsApp template message directly
 * POST /api/kapso/test-template
 * Body: { phone: "+51965450086", message: "Test message" }
 */
export async function POST(request: NextRequest) {
  try {
    const { phone, message } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "phone is required" },
        { status: 400 }
      );
    }

    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";
    const testMessage = message || "Recuerda revisar tu objetivo de hoy. ¡Tú puedes!";

    console.log("[Test Template] Sending to:", phone);
    console.log("[Test Template] Using template:", templateName);
    console.log("[Test Template] Message:", testMessage);

    const result = await sendWhatsAppTemplate(phone, testMessage);

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      template_used: templateName,
      phone_sent_to: phone,
    });
  } catch (error) {
    console.error("[Test Template] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
