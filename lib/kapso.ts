/**
 * Kapso WhatsApp API client for sending reminders
 *
 * Environment variables required:
 * - KAPSO_API_KEY: API key from Kapso dashboard
 * - KAPSO_PHONE_NUMBER_ID: WhatsApp phone number ID (default: 12083619224)
 * - KAPSO_WEBHOOK_SECRET: Secret for verifying webhook signatures
 */

import crypto from "crypto";

// =============================================================================
// Types
// =============================================================================

export interface WhatsAppConfig {
  id: string;
  user_id: string;
  phone_number: string;
  kapso_phone_number_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppReminder {
  id: string;
  user_id: string;
  experiment_id: string;
  checkin_id: string | null;
  message_content: string;
  step_title: string | null;
  step_description: string | null;
  status: "sent" | "delivered" | "responded" | "expired";
  user_response: string | null;
  response_action: "done" | "later" | "stuck" | null;
  kapso_message_id: string | null;
  sent_at: string;
  delivered_at: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface KapsoSendMessageRequest {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string; // Phone number with country code (no +)
  type: "text" | "template";
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: "body";
      parameters: Array<{
        type: "text";
        text: string;
      }>;
    }>;
  };
}

export interface KapsoSendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface KapsoWebhookPayload {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: "text" | "image" | "audio" | "video" | "document" | "location" | "contacts" | "interactive" | "button" | "reaction";
          text?: { body: string };
          interactive?: {
            type: "button_reply" | "list_reply";
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
          button?: { text: string; payload: string };
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: "messages";
    }>;
  }>;
}

// Response action mapping
export type UserResponseAction = "done" | "later" | "stuck";

// =============================================================================
// Configuration
// =============================================================================

const KAPSO_API_BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";
const DEFAULT_PHONE_NUMBER_ID = "996277176894864";

function getKapsoConfig() {
  const apiKey = process.env.KAPSO_API_KEY;
  const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID || DEFAULT_PHONE_NUMBER_ID;
  const webhookSecret = process.env.KAPSO_WEBHOOK_SECRET;

  return { apiKey, phoneNumberId, webhookSecret };
}

export function isKapsoConfigured(): boolean {
  const { apiKey } = getKapsoConfig();
  return !!apiKey;
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Send a WhatsApp message via Kapso API
 * Always uses template to avoid 24h window restrictions
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Always use template to avoid 24h conversation window issues
  return sendWhatsAppTemplate(to, message);
}

/**
 * Send a WhatsApp template message via Kapso API
 * Templates can be sent outside the 24h conversation window
 */
export async function sendWhatsAppTemplate(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  const cleanPhone = to.replace(/[\s\-+]/g, "");

  // Use template to send messages outside 24h window
  // Template name can be configured via env var, defaults to "hello_world" (pre-approved)
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "hello_world";

  // For hello_world template, we can't pass custom message
  // For custom templates like "vicu_reminder", we pass the message as parameter
  const isCustomTemplate = templateName !== "hello_world";

  // Sanitize message for WhatsApp template parameters:
  // - No newlines/tabs allowed
  // - No more than 4 consecutive spaces
  const sanitizedMessage = message
    .replace(/\n/g, " | ")  // Replace newlines with separator
    .replace(/\t/g, " ")     // Replace tabs with space
    .replace(/\s{4,}/g, "   ") // Max 3 consecutive spaces
    .substring(0, 1024);     // WhatsApp limit

  const payload: KapsoSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: "es",
      },
      ...(isCustomTemplate && {
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: sanitizedMessage,
              },
            ],
          },
        ],
      }),
    },
  };

  try {
    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kapso] Template failed:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] Template sent successfully:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending template:", error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// Webhook Verification
// =============================================================================

/**
 * Verify Kapso webhook signature using HMAC-SHA256
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const { webhookSecret } = getKapsoConfig();

  if (!webhookSecret) {
    console.warn("[Kapso] Webhook secret not configured. Skipping verification.");
    return true; // Allow in development
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Parse user response from WhatsApp message
 * Returns the action based on user input (1, 2, 3 or text)
 */
export function parseUserResponse(message: string): {
  action: UserResponseAction;
  rawResponse: string;
} {
  const trimmed = message.trim().toLowerCase();
  const rawResponse = message.trim();

  // Check for numeric responses
  if (trimmed === "1" || trimmed.startsWith("1")) {
    return { action: "done", rawResponse };
  }
  if (trimmed === "2" || trimmed.startsWith("2")) {
    return { action: "later", rawResponse };
  }
  if (trimmed === "3" || trimmed.startsWith("3")) {
    return { action: "stuck", rawResponse };
  }

  // Check for text responses (Spanish)
  if (
    trimmed.includes("hecho") ||
    trimmed.includes("listo") ||
    trimmed.includes("termine") ||
    trimmed.includes("hice") ||
    trimmed.includes("done") ||
    trimmed.includes("si") ||
    trimmed === "ok"
  ) {
    return { action: "done", rawResponse };
  }

  if (
    trimmed.includes("tarde") ||
    trimmed.includes("despues") ||
    trimmed.includes("luego") ||
    trimmed.includes("later") ||
    trimmed.includes("mañana")
  ) {
    return { action: "later", rawResponse };
  }

  if (
    trimmed.includes("trabé") ||
    trimmed.includes("trabe") ||
    trimmed.includes("stuck") ||
    trimmed.includes("ayuda") ||
    trimmed.includes("help") ||
    trimmed.includes("no puedo") ||
    trimmed.includes("dificil")
  ) {
    return { action: "stuck", rawResponse };
  }

  // Default to "later" for unrecognized responses
  return { action: "later", rawResponse };
}

// =============================================================================
// Message Templates
// =============================================================================

/**
 * Build reminder message for WhatsApp
 */
export function buildReminderMessage(
  projectTitle: string,
  stepTitle: string,
  stepDescription?: string
): string {
  let message = `🎯 *${projectTitle}*\n\n`;
  message += `Tu siguiente paso:\n`;
  message += `📌 ${stepTitle}\n`;

  if (stepDescription) {
    message += `\n${stepDescription}\n`;
  }

  message += `\n---\nResponde:\n`;
  message += `1️⃣ Ya lo hice\n`;
  message += `2️⃣ Más tarde\n`;
  message += `3️⃣ Me trabé`;

  return message;
}

/**
 * Send WhatsApp message for help assignment
 * Uses a simple text message since this is a notification to an external person
 * Note: This requires the recipient to have messaged first (24h window) OR a pre-approved template
 * For now, we'll use a simple approach that works within the 24h window
 */
export async function sendAssignmentNotification(
  to: string,
  helperName: string,
  ownerName: string,
  actionTitle: string,
  customMessage: string | null,
  publicUrl: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  const cleanPhone = to.replace(/[\s\-+]/g, "");

  // Build the message
  let message = `Hola ${helperName}! 👋\n\n`;
  message += `Soy VICU, la AI que ayuda a ${ownerName} a cumplir sus metas.\n\n`;
  message += `${ownerName} necesita tu ayuda con:\n`;
  message += `📌 "${actionTitle}"\n\n`;

  if (customMessage) {
    message += `${customMessage}\n\n`;
  }

  message += `¿Puedes echarle una mano?\n👉 ${publicUrl}`;

  // Try to send as a regular message first (works if within 24h window)
  // If this fails, the user will need to share the link manually
  const payload: KapsoSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "text",
    text: {
      body: message,
      preview_url: true,
    },
  };

  try {
    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kapso] Assignment notification failed:", response.status, errorText);
      // Return success: false but don't throw - the link is still valid
      return { success: false, error: `WhatsApp envío falló: ${response.status}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] Assignment notification sent successfully:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending assignment notification:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send WhatsApp message using vicu_action template
 * Template format: {{1}} objectives | {{2}} action | {{3}} response options
 */
export async function sendVicuActionTemplate(
  to: string,
  objectiveTitle: string,
  actionText: string,
  streakInfo?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  const cleanPhone = to.replace(/[\s\-+]/g, "");

  // Build the message parts for template
  // {{1}} = objective with context (emoji + title + streak/days info)
  // {{2}} = today's action
  // {{3}} = response options

  const objectiveWithContext = streakInfo
    ? `${objectiveTitle} ${streakInfo}`
    : objectiveTitle;

  const sanitize = (text: string) => text
    .replace(/\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .substring(0, 200);

  const payload: KapsoSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "template",
    template: {
      name: "vicu_action",
      language: {
        code: "es",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: sanitize(objectiveWithContext),
            },
            {
              type: "text",
              text: sanitize(actionText),
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kapso] vicu_action template failed:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] vicu_action template sent successfully:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending vicu_action template:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send reminder to helper about pending assignment
 */
export async function sendAssignmentReminder(
  to: string,
  helperName: string,
  ownerName: string,
  taskTitle: string,
  publicUrl: string,
  reminderNumber: 1 | 2
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  const cleanPhone = to.replace(/[\s\-+]/g, "");

  // Build reminder message
  let message: string;

  if (reminderNumber === 1) {
    // Day 2: Gentle reminder
    message = `Hey ${helperName}! 👋\n\n`;
    message += `¿Pudiste ayudar a ${ownerName} con esto?\n`;
    message += `📌 "${taskTitle}"\n\n`;
    message += `Si ya lo hiciste, márcalo aquí:\n👉 ${publicUrl}`;
  } else {
    // Day 5: Final reminder
    message = `Hola ${helperName}! 🙏\n\n`;
    message += `Último recordatorio sobre la ayuda que ${ownerName} te pidió:\n`;
    message += `📌 "${taskTitle}"\n\n`;
    message += `Si no puedes ayudar, no hay problema - solo avísale:\n👉 ${publicUrl}`;
  }

  const payload: KapsoSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "text",
    text: {
      body: message,
      preview_url: true,
    },
  };

  try {
    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kapso] Assignment reminder failed:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] Assignment reminder sent:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending assignment reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Notify owner about assignment status
 */
export async function sendOwnerNotification(
  to: string,
  helperName: string,
  taskTitle: string,
  status: "no_response" | "expired"
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  const cleanPhone = to.replace(/[\s\-+]/g, "");

  let message: string;

  if (status === "no_response") {
    message = `⚠️ ${helperName} aún no responde sobre:\n`;
    message += `"${taskTitle}"\n\n`;
    message += `Considera buscar otra persona que te pueda ayudar.`;
  } else {
    message = `⏰ La solicitud a ${helperName} expiró:\n`;
    message += `"${taskTitle}"\n\n`;
    message += `¿Quieres pedirle ayuda a alguien más?`;
  }

  const payload: KapsoSendMessageRequest = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "text",
    text: {
      body: message,
      preview_url: false,
    },
  };

  try {
    const response = await fetch(`${KAPSO_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Kapso] Owner notification failed:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] Owner notification sent:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending owner notification:", error);
    return { success: false, error: String(error) };
  }
}
