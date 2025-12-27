import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Lazy initialization to avoid build-time errors in Vercel
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// VAPID keys for web push
// Generate your own keys with: npx web-push generate-vapid-keys
// Then add them to your .env file:
// VAPID_PUBLIC_KEY=your_public_key
// VAPID_PRIVATE_KEY=your_private_key
// VAPID_SUBJECT=mailto:your-email@example.com

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:vicu@example.com";

export async function POST() {
  try {
    // Check if VAPID keys are configured
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn("VAPID keys not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment.");
      return NextResponse.json(
        {
          success: false,
          error: "VAPID keys not configured",
          hint: "Run 'npx web-push generate-vapid-keys' and add keys to .env",
        },
        { status: 500 }
      );
    }

    // Configure web-push with VAPID keys
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Get all push subscriptions
    const { data: subscriptions, error: subError } = await getSupabase()
      .from("web_push_subscriptions")
      .select("*");

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return NextResponse.json(
        { success: false, error: "Failed to fetch subscriptions" },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No subscriptions to notify",
        sent: 0,
      });
    }

    // Get active experiments that haven't had a check-in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISOString = today.toISOString();

    const { data: experiments, error: expError } = await getSupabase()
      .from("experiments")
      .select("id, title, status, last_checkin_at")
      .is("deleted_at", null)
      .in("status", ["queued", "building", "testing", "adjusting"]); // Active statuses

    if (expError) {
      console.error("Error fetching experiments:", expError);
    }

    // Check if any experiment needs a reminder (no check-in today)
    const needsReminder = experiments?.some((exp) => {
      if (!exp.last_checkin_at) return true;
      const lastCheckin = new Date(exp.last_checkin_at);
      lastCheckin.setHours(0, 0, 0, 0);
      return lastCheckin < today;
    });

    // If all experiments have been checked in today, don't send notification
    if (!needsReminder && experiments && experiments.length > 0) {
      return NextResponse.json({
        success: true,
        message: "All experiments already have check-ins today",
        sent: 0,
      });
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title: "Hoy con Vicu",
      body: experiments && experiments.length > 0
        ? `Tienes ${experiments.length} objetivo${experiments.length > 1 ? "s" : ""} esperando. Haz un paso pequeno ahora.`
        : "Es un buen momento para avanzar en tus objetivos.",
      url: "/hoy",
    });

    // Send notifications to all subscriptions
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
          const webPushError = error as { statusCode?: number };
          // If subscription is expired or invalid, delete it
          if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
            console.log("Removing expired subscription:", sub.endpoint);
            await getSupabase()
              .from("web_push_subscriptions")
              .delete()
              .eq("id", sub.id);
          }
          throw error;
        }
      })
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({
      success: true,
      message: `Sent ${successful} notifications`,
      sent: successful,
      failed,
      total: subscriptions.length,
    });
  } catch (error) {
    console.error("Error sending daily notifications:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check status (useful for testing)
export async function GET() {
  const hasVapidKeys = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

  const { count, error } = await getSupabase()
    .from("web_push_subscriptions")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    configured: hasVapidKeys,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
    subscriptionCount: error ? 0 : count,
    hint: hasVapidKeys
      ? "Ready to send notifications"
      : "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment",
  });
}
