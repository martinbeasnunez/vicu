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
  type: "text";
  text: {
    body: string;
    preview_url?: boolean;
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
const DEFAULT_PHONE_NUMBER_ID = "12083619224";

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
 * Send a WhatsApp text message via Kapso API
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { apiKey, phoneNumberId } = getKapsoConfig();

  if (!apiKey) {
    console.warn("[Kapso] API key not configured. Skipping WhatsApp message.");
    return { success: false, error: "KAPSO_API_KEY not configured" };
  }

  // Clean phone number: remove spaces, dashes, and the + prefix
  // WhatsApp Cloud API expects numbers WITHOUT the + prefix (e.g., "51965450086")
  let cleanPhone = to.replace(/[\s\-+]/g, "");

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
      console.error("[Kapso] Failed to send message:", response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data: KapsoSendMessageResponse = await response.json();
    const messageId = data.messages?.[0]?.id;

    console.log("[Kapso] Message sent successfully:", messageId);
    return { success: true, messageId };
  } catch (error) {
    console.error("[Kapso] Error sending message:", error);
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
