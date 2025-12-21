import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Test endpoint for sending a push notification (development only)
// Usage: POST /api/web-push/test
//
// This endpoint sends a test notification to verify the web push setup.
// It's useful during development to confirm that:
// - VAPID keys are correctly configured
// - Service worker is properly registered
// - Push subscriptions are being saved to Supabase
//
// To test manually:
// 1. Activate notifications in the /hoy page
// 2. Run: curl -X POST http://localhost:3000/api/web-push/test
// 3. You should receive a test notification

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:vicu@example.com";

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Test endpoint disabled in production" },
      { status: 403 }
    );
  }

  try {
    // Check if VAPID keys are configured
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "VAPID keys not configured",
          hint: "Run 'npx web-push generate-vapid-keys' and add to .env.local:\n" +
                "VAPID_PUBLIC_KEY=your_public_key\n" +
                "VAPID_PRIVATE_KEY=your_private_key\n" +
                "NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key (same as VAPID_PUBLIC_KEY)",
        },
        { status: 500 }
      );
    }

    // Configure web-push
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Get all subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("web_push_subscriptions")
      .select("*");

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch subscriptions", details: subError.message },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No subscriptions found",
        hint: "First activate notifications in the /hoy page, then try again",
      });
    }

    // Prepare test notification payload
    const payload = JSON.stringify({
      title: "🧪 Test de Vicu",
      body: "¡Las notificaciones funcionan correctamente!",
      url: "/hoy",
    });

    // Send to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          return { success: true, endpoint: sub.endpoint };
        } catch (error: unknown) {
          const webPushError = error as { statusCode?: number; message?: string };
          // Clean up invalid subscriptions
          if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
            console.log("Removing expired subscription:", sub.endpoint);
            await supabase
              .from("web_push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
          return {
            success: false,
            endpoint: sub.endpoint,
            error: webPushError.message || "Unknown error",
            statusCode: webPushError.statusCode
          };
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled" && (r.value as { success: boolean }).success).length;
    const failed = results.length - successful;

    return NextResponse.json({
      success: successful > 0,
      message: `Test notification sent to ${successful}/${subscriptions.length} subscriptions`,
      sent: successful,
      failed,
      total: subscriptions.length,
      results: results.map(r => r.status === "fulfilled" ? r.value : { error: "Promise rejected" }),
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// GET endpoint to check configuration status
export async function GET() {
  const hasVapidKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const hasPublicVapidKey = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const isDevelopment = process.env.NODE_ENV === "development";

  const { count, error } = await supabase
    .from("web_push_subscriptions")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    configured: hasVapidKeys && hasPublicVapidKey,
    vapidKeys: {
      public: hasVapidKeys,
      publicClient: hasPublicVapidKey,
      private: !!process.env.VAPID_PRIVATE_KEY,
    },
    subscriptionCount: error ? 0 : count,
    isDevelopment,
    testEndpointEnabled: isDevelopment,
    setup: !hasVapidKeys ? {
      step1: "Run: npx web-push generate-vapid-keys",
      step2: "Add to .env.local:",
      variables: [
        "VAPID_PUBLIC_KEY=<your_public_key>",
        "VAPID_PRIVATE_KEY=<your_private_key>",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your_public_key>",
        "VAPID_SUBJECT=mailto:your-email@example.com",
      ],
      step3: "Restart the dev server",
      step4: "Activate notifications in /hoy",
      step5: "POST to /api/web-push/test to send a test notification",
    } : null,
  });
}
