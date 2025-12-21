import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role key for server-side operations if available
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const subscription: WebPushSubscription = await request.json();

    if (!subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { success: false, error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    // Upsert subscription (insert or update if endpoint exists)
    const { data, error } = await supabase
      .from("web_push_subscriptions")
      .upsert(
        {
          user_id: "demo-user", // Single demo user for now
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving subscription:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription saved successfully",
      id: data?.id,
    });
  } catch (error) {
    console.error("Error in subscribe endpoint:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE endpoint to unsubscribe
export async function DELETE(request: NextRequest) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("web_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint);

    if (error) {
      console.error("Error deleting subscription:", error);
      return NextResponse.json(
        { success: false, error: "Failed to delete subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Subscription removed successfully",
    });
  } catch (error) {
    console.error("Error in unsubscribe endpoint:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
