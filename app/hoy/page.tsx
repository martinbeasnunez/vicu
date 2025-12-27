"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ExperimentStatus,
  STATUS_LABELS,
  formatDeadline,
} from "@/lib/experiment-helpers";
import type { CurrentState, EffortLevel, NextStepResponse } from "@/app/api/next-step/route";
import { useUserStats } from "@/lib/useUserStats";
import { Badge, getLevelName } from "@/lib/gamification";
import { XpGainAnimation, BadgeUnlockAnimation, LevelUpAnimation } from "@/components/GamificationPanel";

// All statuses for filtering (including inactive ones)
const ALL_STATUSES: ExperimentStatus[] = ["queued", "building", "testing", "adjusting", "achieved", "paused", "discarded"];

interface Experiment {
  id: string;
  title: string;
  status: ExperimentStatus;
  surface_type: string; // Kept in data model but hidden from UI
  deadline: string | null;
  created_at: string;
  // New streak tracking fields (may not exist yet)
  last_checkin_at: string | null;
  checkins_count: number;
  streak_days: number;
}

// Modal state types
interface MoverModalState {
  isOpen: boolean;
  experiment: Experiment | null;
  step: "select_state" | "show_step" | "loading";
  selectedState: CurrentState | null;
  nextStep: NextStepResponse | null;
}

// State options for the modal
const STATE_OPTIONS: { value: CurrentState; label: string; icon: string; description: string }[] = [
  {
    value: "not_started",
    label: "No he empezado aún",
    icon: "🚀",
    description: "Dame un empujón pequeño para arrancar",
  },
  {
    value: "stuck",
    label: "Me trabé",
    icon: "🤔",
    description: "Necesito una forma de desatorarme",
  },
  {
    value: "going_well",
    label: "Voy bien",
    icon: "💪",
    description: "Quiero seguir empujando",
  },
];

// Effort labels
const EFFORT_LABELS: Record<EffortLevel, { text: string; color: string }> = {
  muy_pequeno: { text: "~5 min", color: "text-emerald-400" },
  pequeno: { text: "~20 min", color: "text-amber-400" },
  medio: { text: "~1 hora", color: "text-orange-400" },
};

// Status badge colors - MVP cycle states
const STATUS_BADGE_COLORS: Record<ExperimentStatus, string> = {
  queued: "bg-slate-500/20 text-slate-400",
  building: "bg-blue-500/20 text-blue-400",
  testing: "bg-purple-500/20 text-purple-400",
  adjusting: "bg-amber-500/20 text-amber-400",
  achieved: "bg-green-500/20 text-green-400",
  paused: "bg-zinc-500/20 text-zinc-400",
  discarded: "bg-red-500/20 text-red-400",
};

// SURFACE_BADGE_COLORS removed - surface types hidden from UI

// Active statuses for "Hoy" view (default filter) - excludes finished and paused
const ACTIVE_STATUSES: ExperimentStatus[] = ["queued", "building", "testing", "adjusting"];

// Filter chip styling - MVP cycle states
const FILTER_CHIP_COLORS: Record<ExperimentStatus | "all", { active: string; inactive: string }> = {
  all: { active: "bg-slate-100 text-slate-900", inactive: "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50" },
  queued: { active: "bg-slate-500 text-white", inactive: "bg-slate-500/10 text-slate-400 hover:bg-slate-500/20" },
  building: { active: "bg-blue-500 text-white", inactive: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" },
  testing: { active: "bg-purple-500 text-white", inactive: "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20" },
  adjusting: { active: "bg-amber-500 text-white", inactive: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" },
  achieved: { active: "bg-green-500 text-white", inactive: "bg-green-500/10 text-green-400 hover:bg-green-500/20" },
  paused: { active: "bg-zinc-500 text-white", inactive: "bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20" },
  discarded: { active: "bg-red-500 text-white", inactive: "bg-red-500/10 text-red-400 hover:bg-red-500/20" },
};

function formatLastCheckin(dateString: string | null): string {
  if (!dateString) return "Nunca";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Hace 1 día";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) > 1 ? "s" : ""}`;
  return `Hace ${Math.floor(diffDays / 30)} mes${Math.floor(diffDays / 30) > 1 ? "es" : ""}`;
}

function calculateDeadlineProgress(deadline: string | null, createdAt: string): number | null {
  if (!deadline) return null;

  const start = new Date(createdAt).getTime();
  const end = new Date(deadline).getTime();
  const now = new Date().getTime();

  if (end <= start) return 100;

  const total = end - start;
  const elapsed = now - start;
  const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));

  return progress;
}

export default function HoyPage() {
  const router = useRouter();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [hasAnyExperiments, setHasAnyExperiments] = useState(false);

  // Pagination state
  const EXPERIMENTS_PER_PAGE = 8;
  const [visibleCount, setVisibleCount] = useState(EXPERIMENTS_PER_PAGE);
  const [hasMore, setHasMore] = useState(false);

  // Filter state - "all" means show all statuses, otherwise show specific status
  const [statusFilter, setStatusFilter] = useState<ExperimentStatus | "all">("all");

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; experiment: Experiment | null }>({
    isOpen: false,
    experiment: null,
  });

  // Summary stats
  const [todayCheckins, setTodayCheckins] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);

  // Modal state for "Mover proyecto"
  const [moverModal, setMoverModal] = useState<MoverModalState>({
    isOpen: false,
    experiment: null,
    step: "select_state",
    selectedState: null,
    nextStep: null,
  });

  // Gamification state
  const { stats: userStats, loading: statsLoading, recordCheckin } = useUserStats();
  const [xpAnimation, setXpAnimation] = useState<{ show: boolean; amount: number }>({ show: false, amount: 0 });
  const [badgeAnimation, setBadgeAnimation] = useState<{ show: boolean; badge: Badge | null }>({ show: false, badge: null });
  const [levelUpAnimation, setLevelUpAnimation] = useState<{ show: boolean; level: number }>({ show: false, level: 0 });
  const [pendingBadges, setPendingBadges] = useState<Badge[]>([]);

  // Web Push notification state
  // "unsupported" = browser doesn't have required APIs
  // "default" | "granted" | "denied" = actual Notification.permission values
  const [pushSupported, setPushSupported] = useState(true); // Assume supported until checked
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Check notification availability and permission on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if all required APIs are available
    const hasNotification = "Notification" in window;
    const hasServiceWorker = "serviceWorker" in navigator;
    const hasPushManager = "PushManager" in window;

    if (!hasNotification || !hasServiceWorker || !hasPushManager) {
      setPushSupported(false);
      return;
    }

    // APIs are available, check permission
    setPushPermission(Notification.permission);

    // Check for saved preference (for when VAPID keys aren't configured yet)
    const savedPreference = localStorage.getItem("vicu_push_preference");

    // If permission is granted, check if already subscribed
    if (Notification.permission === "granted") {
      // Add timeout to prevent hanging
      const checkSubscription = async () => {
        try {
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 2000)
          );
          const registration = await Promise.race([
            navigator.serviceWorker.ready,
            timeoutPromise
          ]);
          if (registration) {
            const subscription = await registration.pushManager.getSubscription();
            setPushSubscribed(!!subscription || savedPreference === "enabled");
          } else if (savedPreference === "enabled") {
            setPushSubscribed(true);
          }
        } catch {
          // Service worker not registered yet or timeout - check saved preference
          if (savedPreference === "enabled") {
            setPushSubscribed(true);
          }
        }
      };
      checkSubscription();
    } else if (savedPreference === "enabled") {
      // User enabled before but permission was reset - they'll need to re-enable
      localStorage.removeItem("vicu_push_preference");
    }
  }, []);

  // Handler to activate push notifications
  // Web Push Flow:
  // 1. Check browser support (Notification, serviceWorker, PushManager APIs)
  // 2. Request notification permission from user
  // 3. Register service worker (/vicu-sw.js)
  // 4. Get VAPID public key from server (or use NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  // 5. Subscribe to PushManager with VAPID key
  // 6. Send subscription to API for storage in Supabase
  //
  // Environment variables needed for production:
  // - NEXT_PUBLIC_VAPID_PUBLIC_KEY: Public VAPID key (client-side)
  // - VAPID_PUBLIC_KEY: Public VAPID key (server-side, same value)
  // - VAPID_PRIVATE_KEY: Private VAPID key (server-side only)
  // - VAPID_SUBJECT: mailto: URL for VAPID (e.g., mailto:vicu@example.com)
  //
  // Generate keys with: npx web-push generate-vapid-keys
  const handleActivatePush = async () => {
    if (!pushSupported) {
      showToast("Tu navegador no soporta notificaciones");
      return;
    }

    setIsSubscribing(true);

    try {
      // Step 1: Request notification permission if not granted
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);

        if (permission === "denied") {
          showToast("Debes permitir notificaciones en tu navegador para que Vicu pueda recordarte");
          setIsSubscribing(false);
          return;
        }

        if (permission !== "granted") {
          showToast("Necesitas permitir las notificaciones");
          setIsSubscribing(false);
          return;
        }
      }

      // Step 2: Register service worker
      const registration = await navigator.serviceWorker.register("/vicu-sw.js");
      await navigator.serviceWorker.ready;

      // Step 3: Get VAPID public key - try env var first, then API
      let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey) {
        // Fallback: get from API
        const configRes = await fetch("/api/web-push/send-daily");
        const config = await configRes.json();
        vapidPublicKey = config.vapidPublicKey;
      }

      if (!vapidPublicKey) {
        // No VAPID key available - save preference locally but can't subscribe
        // In development, this is expected. Show a friendly message.
        console.warn("VAPID public key not configured. Push notifications will not work until configured.");

        // Still mark as "subscribed" locally so UI shows correct state
        // When VAPID keys are added, user can resubscribe
        localStorage.setItem("vicu_push_preference", "enabled");
        setPushSubscribed(true);
        showToast("Preferencia guardada. Los recordatorios funcionarán cuando el servidor esté configurado.");
        setIsSubscribing(false);
        return;
      }

      // Step 4: Subscribe to push notifications with VAPID key
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      // Step 5: Send subscription to server for storage in Supabase
      const response = await fetch("/api/web-push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      const result = await response.json();

      if (result.success) {
        localStorage.setItem("vicu_push_preference", "enabled");
        setPushSubscribed(true);
        showToast("Listo, Vicu te recordará avanzar en tus objetivos");
      } else {
        showToast("Error al guardar la suscripción");
      }
    } catch (error) {
      console.error("Error activating push:", error);
      showToast("Error al activar recordatorios. Intenta de nuevo.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      // First check if user has any experiments at all (excluding deleted)
      const { count: totalCount } = await supabase
        .from("experiments")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);

      setHasAnyExperiments((totalCount || 0) > 0);

      // Try fetching with streak fields first, fallback without them
      let expsData: Experiment[] | null = null;

      // Fetch ALL experiments (not deleted), ordered by newest first
      // We filter by status on the client side to support filter chips
      const result1 = await supabase
        .from("experiments")
        .select("id, title, status, surface_type, deadline, created_at, last_checkin_at, checkins_count, streak_days")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }); // newest first

      if (result1.error) {
        // Fallback: query without new fields (migration not run yet)
        console.warn("Fetching without streak/deleted fields (run migration)");
        const result2 = await supabase
          .from("experiments")
          .select("id, title, status, surface_type, deadline, created_at")
          .order("created_at", { ascending: false }); // newest first

        if (result2.error) {
          console.error("Error fetching experiments:", result2.error);
        } else {
          // Add default values for new fields
          expsData = (result2.data || []).map((e) => ({
            ...e,
            last_checkin_at: null,
            checkins_count: 0,
            streak_days: 0,
          })) as Experiment[];
        }
      } else {
        expsData = (result1.data || []).map((e) => ({
          ...e,
          last_checkin_at: e.last_checkin_at || null,
          checkins_count: e.checkins_count || 0,
          streak_days: e.streak_days || 0,
        })) as Experiment[];
      }

      if (expsData) {
        setExperiments(expsData);
        // Check if there are more experiments to load
        setHasMore(expsData.length > EXPERIMENTS_PER_PAGE);

        // Calculate today's check-ins count
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkedToday = expsData.filter((e) => {
          if (!e.last_checkin_at) return false;
          const lastDate = new Date(e.last_checkin_at);
          lastDate.setHours(0, 0, 0, 0);
          return lastDate.getTime() === today.getTime();
        }).length;
        setTodayCheckins(checkedToday);

        // Calculate max streak
        const max = Math.max(0, ...expsData.map((e) => e.streak_days));
        setMaxStreak(max);
      }
    } catch (err) {
      console.error("Error fetching experiments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleMarkProgress = async (
    experimentId: string,
    checkinData?: {
      userState: CurrentState;
      stepTitle: string;
      stepDescription: string;
      effort: EffortLevel;
    }
  ) => {
    setProcessingId(experimentId);

    try {
      const exp = experiments.find((e) => e.id === experimentId);
      if (!exp) return;

      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDate = today.toISOString().split("T")[0];

      // Calculate new streak
      let newStreak = 1;
      if (exp.last_checkin_at) {
        const lastCheckinDate = new Date(exp.last_checkin_at);
        lastCheckinDate.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastCheckinDate.getTime() === yesterday.getTime()) {
          // Last checkin was yesterday - extend streak
          newStreak = exp.streak_days + 1;
        } else if (lastCheckinDate.getTime() === today.getTime()) {
          // Already checked in today - keep streak
          newStreak = exp.streak_days;
        }
        // Otherwise, streak resets to 1
      }

      // Insert check-in record
      const checkinRecord = {
        experiment_id: experimentId,
        status: "done",
        user_state: checkinData?.userState || null,
        step_title: checkinData?.stepTitle || null,
        step_description: checkinData?.stepDescription || null,
        effort: checkinData?.effort || null,
        source: "move_project",
        day_date: dayDate,
      };

      const { error: checkinError } = await supabase
        .from("experiment_checkins")
        .insert(checkinRecord);

      if (checkinError) {
        console.warn("Could not insert checkin record:", checkinError.message);
      }

      // Update experiment in Supabase
      const { error } = await supabase
        .from("experiments")
        .update({
          last_checkin_at: now.toISOString(),
          checkins_count: exp.checkins_count + 1,
          streak_days: newStreak,
        })
        .eq("id", experimentId);

      if (error) {
        // If error, fields might not exist - just show success anyway
        console.warn("Could not update streak fields:", error.message);
        showToast("Avance marcado");
      } else {
        showToast(newStreak > 1 ? `Avance marcado. Racha: ${newStreak} días` : "Avance marcado");
      }

      // Update local state
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === experimentId
            ? {
                ...e,
                last_checkin_at: now.toISOString(),
                checkins_count: e.checkins_count + 1,
                streak_days: newStreak,
              }
            : e
        )
      );

      // Update summary stats
      setTodayCheckins((prev) => prev + 1);
      setMaxStreak((prev) => Math.max(prev, newStreak));

      // Record gamification checkin
      const gamificationResult = await recordCheckin(experimentId);
      if (gamificationResult) {
        // Show XP animation
        setXpAnimation({ show: true, amount: gamificationResult.xpGained });

        // Queue badge animations
        if (gamificationResult.newBadges.length > 0) {
          setPendingBadges(gamificationResult.newBadges);
        }

        // Queue level up animation
        if (gamificationResult.levelUp && userStats) {
          setTimeout(() => {
            setLevelUpAnimation({ show: true, level: userStats.level + 1 });
          }, 1600); // After XP animation
        }
      }
    } catch (error) {
      console.error("Error marking progress:", error);
      showToast("Error al marcar avance");
    } finally {
      setProcessingId(null);
    }
  };

  // Handle badge animation queue
  useEffect(() => {
    if (pendingBadges.length > 0 && !badgeAnimation.show && !xpAnimation.show) {
      const nextBadge = pendingBadges[0];
      setBadgeAnimation({ show: true, badge: nextBadge });
      setPendingBadges((prev) => prev.slice(1));
    }
  }, [pendingBadges, badgeAnimation.show, xpAnimation.show]);

  // Open modal for "Mover proyecto"
  const openMoverModal = (experiment: Experiment) => {
    setMoverModal({
      isOpen: true,
      experiment,
      step: "select_state",
      selectedState: null,
      nextStep: null,
    });
  };

  // Close modal
  const closeMoverModal = () => {
    setMoverModal({
      isOpen: false,
      experiment: null,
      step: "select_state",
      selectedState: null,
      nextStep: null,
    });
  };

  // Handle state selection and fetch next step
  const handleStateSelect = async (state: CurrentState) => {
    if (!moverModal.experiment) return;

    setMoverModal((prev) => ({
      ...prev,
      selectedState: state,
      step: "loading",
    }));

    try {
      const response = await fetch("/api/next-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: moverModal.experiment.id,
          current_state: state,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate next step");
      }

      const data: NextStepResponse = await response.json();

      setMoverModal((prev) => ({
        ...prev,
        step: "show_step",
        nextStep: data,
      }));
    } catch (error) {
      console.error("Error generating next step:", error);
      showToast("Error al generar el siguiente paso");
      closeMoverModal();
    }
  };

  // "Lo haré" - saves step as pending without updating streak/checkin count
  const handleWillDoStep = async () => {
    if (!moverModal.experiment || !moverModal.nextStep) return;
    setProcessingId(moverModal.experiment.id);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDate = today.toISOString().split("T")[0];

      const checkinRecord = {
        experiment_id: moverModal.experiment.id,
        status: "pending",
        user_state: moverModal.selectedState || null,
        step_title: moverModal.nextStep.next_step_title,
        step_description: moverModal.nextStep.next_step_description,
        effort: moverModal.nextStep.effort,
        source: "move_project",
        day_date: dayDate,
      };

      const { error: checkinError } = await supabase
        .from("experiment_checkins")
        .insert(checkinRecord);

      if (checkinError) {
        console.warn("Could not insert pending step:", checkinError.message);
        showToast("Error al guardar el paso");
      } else {
        showToast("Paso guardado. ¡A por ello!");
      }
    } catch (error) {
      console.error("Error saving step:", error);
      showToast("Error al guardar el paso");
    } finally {
      setProcessingId(null);
      closeMoverModal();
    }
  };

  // "Ya lo hice" - saves step as done and updates streak/checkin count
  const handleDidItStep = async () => {
    if (!moverModal.experiment || !moverModal.nextStep || !moverModal.selectedState) return;

    await handleMarkProgress(moverModal.experiment.id, {
      userState: moverModal.selectedState,
      stepTitle: moverModal.nextStep.next_step_title,
      stepDescription: moverModal.nextStep.next_step_description,
      effort: moverModal.nextStep.effort,
    });
    closeMoverModal();
  };

  // Regenerate with same state
  const handleRegenerateStep = async () => {
    if (!moverModal.selectedState) return;
    await handleStateSelect(moverModal.selectedState);
  };

  // Delete experiment (soft delete)
  const handleDeleteExperiment = async () => {
    if (!deleteConfirm.experiment) return;

    setProcessingId(deleteConfirm.experiment.id);

    try {
      const { error } = await supabase
        .from("experiments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteConfirm.experiment.id);

      if (error) {
        console.error("Error deleting experiment:", error);
        showToast("Error al eliminar");
      } else {
        // Remove from local state
        setExperiments((prev) => prev.filter((e) => e.id !== deleteConfirm.experiment?.id));
        showToast("Objetivo eliminado");
      }
    } catch (error) {
      console.error("Error deleting experiment:", error);
      showToast("Error al eliminar");
    } finally {
      setProcessingId(null);
      setDeleteConfirm({ isOpen: false, experiment: null });
    }
  };

  // Filtered experiments based on status filter
  const filteredExperiments = statusFilter === "all"
    ? experiments
    : experiments.filter((e) => e.status === statusFilter);

  // Count experiments per status for filter chips
  const statusCounts = experiments.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<ExperimentStatus, number>);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400">Cargando tu día...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 card-glass text-slate-50 rounded-xl shadow-lg animate-fade-in-down">
          {toast}
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-8 flex flex-col gap-6 mt-6 sm:mt-8">
        {/* Minimal Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/vicu-logo.png" alt="Vicu" width={28} height={28} className="h-7 w-7" priority />
            <span className="text-lg font-semibold text-slate-200">VICU</span>
          </div>

          {/* Right side: notifications toggle + new button */}
          <div className="flex items-center gap-2">
            {/* Compact notification toggle */}
            {pushSupported && (
              pushSubscribed ? (
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400" title="Recordatorios activos">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              ) : pushPermission !== "denied" && (
                <button
                  onClick={handleActivatePush}
                  disabled={isSubscribing}
                  className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-all disabled:opacity-50"
                  title="Activar recordatorios"
                >
                  {isSubscribing ? (
                    <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  )}
                </button>
              )
            )}

            <Link
              href="/vicu"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nuevo</span>
            </Link>
          </div>
        </header>

        {/* Stats Bar - Inline, minimal */}
        {userStats && !statsLoading && (
          <div className="flex items-center gap-6 text-sm">
            {/* Level & XP */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {userStats.level}
              </div>
              <div className="flex flex-col">
                <span className="text-slate-400 text-xs leading-tight">{getLevelName(userStats.level)}</span>
                <span className="text-slate-200 font-medium leading-tight">{userStats.xp} pts</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-700" />

            {/* Streak */}
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🔥</span>
              <span className="text-orange-400 font-semibold">{userStats.streak_days}</span>
              <span className="text-slate-500 text-xs">días</span>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-700" />

            {/* Daily progress */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-xs">Hoy</span>
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${userStats.daily_checkins >= userStats.daily_goal ? "bg-emerald-500" : "bg-indigo-500"}`}
                    style={{ width: `${Math.min(100, (userStats.daily_checkins / userStats.daily_goal) * 100)}%` }}
                  />
                </div>
                <span className={`text-xs font-medium ${userStats.daily_checkins >= userStats.daily_goal ? "text-emerald-400" : "text-slate-300"}`}>
                  {userStats.daily_checkins}/{userStats.daily_goal}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Status Filter Chips */}
        {experiments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                statusFilter === "all"
                  ? FILTER_CHIP_COLORS.all.active
                  : FILTER_CHIP_COLORS.all.inactive
              }`}
            >
              Todos ({experiments.length})
            </button>
            {ALL_STATUSES.map((status) => {
              const count = statusCounts[status] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    statusFilter === status
                      ? FILTER_CHIP_COLORS[status].active
                      : FILTER_CHIP_COLORS[status].inactive
                  }`}
                >
                  {STATUS_LABELS[status]} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Objectives list */}
        <section>
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
            Tus objetivos
          </h2>

          {experiments.length === 0 ? (
            <div className="card-premium px-5 py-8 text-center">
              {hasAnyExperiments ? (
                <>
                  <p className="text-slate-400 mb-4">
                    No tienes objetivos activos para hoy. Activa alguno o crea uno nuevo.
                  </p>
                  <Link
                    href="/vicu"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all"
                  >
                    Crear nuevo objetivo
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-slate-400 mb-4">
                    Aún no tienes objetivos. Crea el primero con Vicu.
                  </p>
                  <Link
                    href="/vicu"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all"
                  >
                    Crear mi primer objetivo
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredExperiments.slice(0, visibleCount).map((exp) => {
                const deadlineInfo = exp.deadline ? formatDeadline(exp.deadline, null) : null;
                const deadlineProgress = calculateDeadlineProgress(exp.deadline, exp.created_at);
                const checkedToday = exp.last_checkin_at && new Date(exp.last_checkin_at).toDateString() === new Date().toDateString();

                return (
                  <div
                    key={exp.id}
                    onClick={() => router.push(`/experiments/${exp.id}`)}
                    className={`group relative rounded-2xl border px-4 py-4 md:px-5 md:py-4 flex flex-col gap-2.5 shadow-md transition cursor-pointer ${
                      checkedToday
                        ? "border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/50"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60"
                    }`}
                  >
                    {/* Delete button - appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ isOpen: true, experiment: exp });
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-full opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Eliminar objetivo"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Title + Arrow */}
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <h3 className="text-base font-semibold text-slate-50 group-hover:text-indigo-300 transition-colors line-clamp-1">
                        {exp.title}
                      </h3>
                      <svg className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Meta badges - Surface type (Ritual/Landing/Mensajes) hidden from UI */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full ${STATUS_BADGE_COLORS[exp.status]}`}>
                        {STATUS_LABELS[exp.status]}
                      </span>
                      {deadlineInfo && (
                        <span className="text-slate-500">Hasta {deadlineInfo.textShort}</span>
                      )}
                    </div>

                    {/* Deadline progress bar */}
                    {deadlineProgress !== null && (
                      <div className="w-full">
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              deadlineProgress > 80 ? "bg-amber-500" : "bg-indigo-500"
                            }`}
                            style={{ width: `${deadlineProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Check-in info + streak */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        Último avance: <span className="text-slate-400">{formatLastCheckin(exp.last_checkin_at)}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        {exp.streak_days > 0 && (
                          <span className="text-orange-400 flex items-center gap-1 text-xs">
                            <span>{exp.streak_days} días</span>
                          </span>
                        )}
                        {checkedToday && (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Hoy</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load more button */}
              {filteredExperiments.length > visibleCount && (
                <button
                  onClick={() => setVisibleCount((prev) => prev + EXPERIMENTS_PER_PAGE)}
                  className="w-full py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-medium hover:border-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all"
                >
                  Cargar más ({filteredExperiments.length - visibleCount} restantes)
                </button>
              )}
            </div>
          )}
        </section>

      </main>

      {/* Mover Proyecto Modal */}
      {moverModal.isOpen && moverModal.experiment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeMoverModal}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">Mover proyecto</h2>
                  <p className="text-sm text-slate-400 mt-0.5 truncate max-w-[280px]">
                    {moverModal.experiment.title}
                  </p>
                </div>
                <button
                  onClick={closeMoverModal}
                  className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {/* Step 1: Select state */}
              {moverModal.step === "select_state" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    ¿Cómo vas con este proyecto hoy?
                  </p>
                  <div className="space-y-3">
                    {STATE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleStateSelect(option.value)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-indigo-500/50 hover:bg-slate-800 transition-all text-left group"
                      >
                        <span className="text-2xl">{option.icon}</span>
                        <div className="flex-1">
                          <p className="font-medium text-slate-100 group-hover:text-indigo-300 transition-colors">
                            {option.label}
                          </p>
                          <p className="text-sm text-slate-500">{option.description}</p>
                        </div>
                        <svg className="w-5 h-5 text-slate-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading state */}
              {moverModal.step === "loading" && (
                <div className="py-8 flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-slate-400">Vicu está pensando el mejor paso para ti...</p>
                </div>
              )}

              {/* Step 2: Show suggested step */}
              {moverModal.step === "show_step" && moverModal.nextStep && (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Tu siguiente paso</p>
                      <h3 className="text-lg font-semibold text-slate-50">
                        {moverModal.nextStep.next_step_title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-slate-300 leading-relaxed">
                    {moverModal.nextStep.next_step_description}
                  </p>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Esfuerzo estimado:</span>
                    <span className={`text-sm font-medium ${EFFORT_LABELS[moverModal.nextStep.effort].color}`}>
                      {EFFORT_LABELS[moverModal.nextStep.effort].text}
                    </span>
                  </div>

                  {/* Actions - Two primary buttons + one secondary */}
                  <div className="space-y-3 pt-2">
                    {/* Primary buttons row */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleWillDoStep}
                        disabled={processingId !== null}
                        className="flex-1 px-5 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processingId ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span>Lo haré</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleDidItStep}
                        disabled={processingId !== null}
                        className="flex-1 px-5 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {processingId ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Ya lo hice</span>
                          </>
                        )}
                      </button>
                    </div>
                    {/* Secondary button */}
                    <button
                      onClick={handleRegenerateStep}
                      disabled={processingId !== null}
                      className="w-full px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Otra idea</span>
                    </button>
                  </div>

                  {/* Back to state selection */}
                  <button
                    onClick={() => setMoverModal((prev) => ({ ...prev, step: "select_state", nextStep: null }))}
                    className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    ← Cambiar mi estado
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && deleteConfirm.experiment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteConfirm({ isOpen: false, experiment: null })}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-50">Eliminar objetivo</h3>
                  <p className="text-sm text-slate-400">Esta acción se puede deshacer</p>
                </div>
              </div>

              <p className="text-slate-300 mb-6">
                ¿Estás seguro de que quieres eliminar <span className="font-medium text-slate-100">&ldquo;{deleteConfirm.experiment.title}&rdquo;</span>?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm({ isOpen: false, experiment: null })}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium hover:border-slate-500 hover:text-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteExperiment}
                  disabled={processingId !== null}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processingId ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Eliminando...</span>
                    </>
                  ) : (
                    <span>Eliminar</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gamification Animations */}
      {xpAnimation.show && (
        <XpGainAnimation
          amount={xpAnimation.amount}
          onComplete={() => setXpAnimation({ show: false, amount: 0 })}
        />
      )}

      {badgeAnimation.show && badgeAnimation.badge && (
        <BadgeUnlockAnimation
          badge={badgeAnimation.badge}
          onComplete={() => setBadgeAnimation({ show: false, badge: null })}
        />
      )}

      {levelUpAnimation.show && (
        <LevelUpAnimation
          newLevel={levelUpAnimation.level}
          onComplete={() => setLevelUpAnimation({ show: false, level: 0 })}
        />
      )}
    </div>
  );
}
