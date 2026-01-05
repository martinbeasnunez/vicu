import { NextRequest, NextResponse } from "next/server";

const KAPSO_API_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

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

    const apiKey = process.env.KAPSO_API_KEY;
    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || "996277176894864";
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";
    const testMessage = message || "Recuerda revisar tu objetivo de hoy. ¡Tú puedes!";

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "KAPSO_API_KEY not configured" },
        { status: 500 }
      );
    }

    const cleanPhone = phone.replace(/[\s\-+]/g, "");
    const isCustomTemplate = templateName !== "hello_world";

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        ...(isCustomTemplate && {
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: testMessage.substring(0, 1024) }],
            },
          ],
        }),
      },
    };

    console.log("[Test Template] Sending to:", cleanPhone);
    console.log("[Test Template] Using template:", templateName);
    console.log("[Test Template] Payload:", JSON.stringify(payload, null, 2));

    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log("[Test Template] Response:", response.status, responseText);

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `HTTP ${response.status}: ${responseText}`,
        template_used: templateName,
        phone_sent_to: cleanPhone,
      });
    }

    const data = JSON.parse(responseText);

    return NextResponse.json({
      success: true,
      messageId: data.messages?.[0]?.id,
      template_used: templateName,
      phone_sent_to: cleanPhone,
    });
  } catch (error) {
    console.error("[Test Template] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
