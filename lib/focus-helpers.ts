/**
 * Focus Experiment Helpers
 *
 * Helpers for the intensive WhatsApp reminder system.
 * These functions help identify the focus experiment and track progress.
 */

import { supabaseServer } from "./supabase-server";

// Use the same Supabase client as the rest of the app
function getSupabase() {
  return supabaseServer;
}

// =============================================================================
// Types
// =============================================================================

export interface FocusExperiment {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  created_at: string;
}

export interface NextStep {
  id: string;
  title: string;
  content: string;
  status: string;
}

// Active states for the MVP cycle
const ACTIVE_STATES = ["queued", "building", "testing", "adjusting"];

// =============================================================================
// Focus Experiment Helper
// =============================================================================

/**
 * Get the focus experiment for a user.
 *
 * Strategy (without schema changes):
 * - Find the experiment with status in {building, testing, adjusting}
 * - Not paused (paused_until is null or in the past)
 * - Not deleted (deleted_at is null)
 * - Most recently updated (updated_at DESC)
 *
 * @param userId - The user ID (default: "demo-user")
 * @returns The focus experiment or null if none found
 */
export async function getFocusExperimentForUser(
  userId: string = "demo-user"
): Promise<FocusExperiment | null> {
  // Get active experiments, then filter for non-deleted ones
  // Note: using created_at since updated_at may not exist
  const { data, error } = await getSupabase()
    .from("experiments")
    .select("id, title, status, created_at, deleted_at")
    .in("status", ACTIVE_STATES)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    console.log("[Focus] No experiments found:", error?.message);
    return null;
  }

  // Filter out deleted experiments manually
  const activeExperiments = data.filter((exp: { deleted_at: string | null }) => !exp.deleted_at);

  console.log("[Focus] Active experiments after filter:", activeExperiments.length);

  if (activeExperiments.length === 0) {
    console.log("[Focus] All experiments are deleted");
    return null;
  }

  const exp = activeExperiments[0];
  console.log("[Focus] Selected focus experiment:", exp.title);

  return {
    id: exp.id,
    title: exp.title,
    status: exp.status,
    updated_at: exp.created_at, // Use created_at as fallback
    created_at: exp.created_at,
  } as FocusExperiment;
}

/**
 * Get the next pending step for an experiment.
 * Returns the first pending action in suggested order.
 */
export async function getNextStep(
  experimentId: string
): Promise<NextStep | null> {
  const { data, error } = await getSupabase()
    .from("experiment_actions")
    .select("id, title, content, status")
    .eq("experiment_id", experimentId)
    .eq("status", "pending")
    .order("suggested_order", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as NextStep;
}

// =============================================================================
// Progress Tracking Helpers
// =============================================================================

/**
 * Check if there was any progress today for an experiment.
 *
 * Progress is defined as:
 * - A check-in with status "done" created today, OR
 * - An action marked as done today (done_at = today)
 *
 * @param experimentId - The experiment ID
 * @returns true if there was progress today
 */
export async function hasProgressToday(
  experimentId: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // Check for done check-ins today
  const { data: checkins } = await getSupabase()
    .from("experiment_checkins")
    .select("id")
    .eq("experiment_id", experimentId)
    .eq("status", "done")
    .gte("created_at", today.toISOString())
    .limit(1);

  if (checkins && checkins.length > 0) {
    return true;
  }

  // Check for actions marked done today
  const { data: actions } = await getSupabase()
    .from("experiment_actions")
    .select("id")
    .eq("experiment_id", experimentId)
    .eq("status", "done")
    .gte("done_at", today.toISOString())
    .limit(1);

  return !!(actions && actions.length > 0);
}

/**
 * Count consecutive days without progress for an experiment.
 *
 * Looks back from yesterday (not today) to find the last day with progress,
 * then counts how many days have passed since then.
 *
 * @param experimentId - The experiment ID
 * @returns Number of consecutive days without progress (0 if progress yesterday)
 */
export async function daysWithoutProgress(
  experimentId: string
): Promise<number> {
  // Get the most recent check-in or action completion date
  const [checkinsResult, actionsResult] = await Promise.all([
    getSupabase()
      .from("experiment_checkins")
      .select("created_at")
      .eq("experiment_id", experimentId)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1),
    getSupabase()
      .from("experiment_actions")
      .select("done_at")
      .eq("experiment_id", experimentId)
      .eq("status", "done")
      .not("done_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(1),
  ]);

  const lastCheckinDate = checkinsResult.data?.[0]?.created_at;
  const lastActionDate = actionsResult.data?.[0]?.done_at;

  // Find the most recent date of any progress
  let lastProgressDate: Date | null = null;

  if (lastCheckinDate) {
    lastProgressDate = new Date(lastCheckinDate);
  }
  if (lastActionDate) {
    const actionDate = new Date(lastActionDate);
    if (!lastProgressDate || actionDate > lastProgressDate) {
      lastProgressDate = actionDate;
    }
  }

  if (!lastProgressDate) {
    // No progress ever - return a large number but capped
    return 999;
  }

  // Calculate days since last progress
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastProgressDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - lastProgressDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Check if a reminder of a specific slot type was already sent today.
 */
export async function wasSlotSentToday(
  experimentId: string,
  slotType: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data } = await getSupabase()
    .from("whatsapp_reminders")
    .select("id")
    .eq("experiment_id", experimentId)
    .eq("slot_type", slotType)
    .gte("sent_at", today.toISOString())
    .limit(1);

  return !!(data && data.length > 0);
}
