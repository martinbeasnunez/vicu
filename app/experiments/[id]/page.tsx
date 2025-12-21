"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useExperimentStore } from "@/lib/experiment-store";
import {
  ExperimentStatus,
  STATUS_LABELS,
  SurfaceType,
  SURFACE_TYPE_LABELS,
  SelfResult,
  SELF_RESULT_LABELS,
  calculateRecommendation,
  updateExperimentStatus,
  getProgressMessage,
  formatDeadline,
} from "@/lib/experiment-helpers";
import AttackPlanSection from "@/components/AttackPlanSection";
import MessagesBankModal from "@/components/MessagesBankModal";
import type { CurrentState, EffortLevel, NextStepResponse } from "@/app/api/next-step/route";
import type { VicuRecommendationData } from "@/app/api/generate-recommendation/route";

// Modal state types for "Mover proyecto"
interface MoverModalState {
  isOpen: boolean;
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

interface Experiment {
  id: string;
  title: string;
  description: string;
  project_type: string;
  experiment_type: string | null;
  surface_type: SurfaceType;
  target_audience: string | null;
  main_pain: string | null;
  main_promise: string | null;
  main_cta: string | null;
  success_goal_number: number | null;
  success_goal_unit: string | null;
  status: ExperimentStatus;
  created_at: string;
  raw_idea: string | null;
  deadline: string | null;
  deadline_source: "user" | "ai_suggested" | null;
  self_result: SelfResult;
  // Streak tracking fields
  last_checkin_at: string | null;
  checkins_count: number;
  streak_days: number;
}

interface ExperimentStats {
  visits: number;
  leads: number;
  conversionRate: number;
}

interface ExperimentAction {
  id: string;
  experiment_id: string;
  channel: string;
  action_type: string;
  title: string;
  content: string;
  status: "pending" | "in_progress" | "done" | "blocked";
  suggested_order: number;
  created_at: string;
  done_at: string | null;
  suggested_due_date: string | null;
}

interface ExperimentCheckin {
  id: string;
  experiment_id: string;
  status: string;
  user_state: string | null;
  step_title: string | null;
  step_description: string | null;
  effort: string | null;
  notes: string | null;
  source: string;
  day_date: string;
  created_at: string;
  user_content: string | null;
}

// Status badge colors for dark theme
const STATUS_BADGE_COLORS: Record<ExperimentStatus, string> = {
  testing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  scale: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  iterate: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  kill: "bg-red-500/20 text-red-400 border-red-500/30",
  paused: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

// Surface type badge colors for dark theme
const SURFACE_BADGE_COLORS: Record<SurfaceType, string> = {
  landing: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  messages: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  ritual: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

// Format last checkin date
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

// Dynamic copy for "Hoy con este proyecto" based on experiment status
function getTodayCopyForStatus(status: ExperimentStatus): { title: string; description: string } {
  switch (status) {
    case "testing": // Arrancando
      return {
        title: "Arrancando este objetivo",
        description: "Define los primeros pasos y quita la fricción para empezar.",
      };
    case "scale": // En marcha
      return {
        title: "En marcha",
        description: "Tu objetivo ya está en movimiento. Hoy se trata de no soltarlo.",
      };
    case "iterate": // Ajustando
      return {
        title: "Ajustando el plan",
        description: "Ya estás en movimiento. Ahora afinemos el plan con pequeños ajustes para avanzar mejor.",
      };
    case "paused": // En pausa
      return {
        title: "En pausa",
        description: "Este objetivo está pausado por ahora. Cuando quieras retomarlo, Vicu te ayuda.",
      };
    case "kill": // Cerrado
      return {
        title: "Cerrado",
        description: "Este objetivo está cerrado. Puedes crear uno nuevo cuando quieras.",
      };
    default:
      return {
        title: "Hoy con este proyecto",
        description: "Vicu te ayuda a dar el siguiente paso sin soltar tu objetivo.",
      };
  }
}

export default function ExperimentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { setCopy } = useExperimentStore();

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [stats, setStats] = useState<ExperimentStats>({ visits: 0, leads: 0, conversionRate: 0 });
  const [actions, setActions] = useState<ExperimentAction[]>([]);
  const [checkins, setCheckins] = useState<ExperimentCheckin[]>([]);
  const [actionsError, setActionsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    target_audience: "",
    main_pain: "",
    main_promise: "",
    main_cta: "",
    success_goal: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [generatingChannel, setGeneratingChannel] = useState<string | null>(null);

  // Deadline editing state
  const [isDeadlineModalOpen, setIsDeadlineModalOpen] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [isSavingDeadline, setIsSavingDeadline] = useState(false);

  // Self result state
  const [isSavingSelfResult, setIsSavingSelfResult] = useState(false);

  // Surface type editing state
  const [isSurfaceModalOpen, setIsSurfaceModalOpen] = useState(false);
  const [isSavingSurface, setIsSavingSurface] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Mark progress state
  const [isMarkingProgress, setIsMarkingProgress] = useState(false);

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline "Hoy con este proyecto" state (no modal needed)
  const [inlineStep, setInlineStep] = useState<"select_state" | "show_step" | "loading">("select_state");
  const [inlineSelectedState, setInlineSelectedState] = useState<CurrentState | null>(null);
  const [inlineNextStep, setInlineNextStep] = useState<NextStepResponse | null>(null);

  // Objetivo editable state
  const [isEditingObjective, setIsEditingObjective] = useState(false);
  const [objectiveInput, setObjectiveInput] = useState("");
  const [isSavingObjective, setIsSavingObjective] = useState(false);

  // Plan colapsable state
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);

  // Messages bank modal state
  const [isMessagesBankOpen, setIsMessagesBankOpen] = useState(false);

  // Step detail modal state
  const [selectedStep, setSelectedStep] = useState<ExperimentCheckin | null>(null);
  const [stepUserContent, setStepUserContent] = useState("");
  const [isSavingStepContent, setIsSavingStepContent] = useState(false);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);

  // Delete step confirmation modal state
  const [stepToDelete, setStepToDelete] = useState<ExperimentCheckin | null>(null);
  const [isDeletingStep, setIsDeletingStep] = useState(false);

  // Vicu recommendation state
  const [vicuRecommendation, setVicuRecommendation] = useState<VicuRecommendationData | null>(null);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);

  // Mover proyecto modal state (kept for compatibility)
  const [moverModal, setMoverModal] = useState<MoverModalState>({
    isOpen: false,
    step: "select_state",
    selectedState: null,
    nextStep: null,
  });

  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.status === "done").length;

  // Checkins-based progress (for "Progreso del plan")
  const totalSteps = checkins.length;
  const completedSteps = checkins.filter((c) => c.status === "done").length;
  const pendingSteps = checkins.filter((c) => c.status === "pending").length;

  const recommendation = useMemo(() => {
    return calculateRecommendation(
      {
        visits: stats.visits,
        leads: stats.leads,
        conversion: stats.visits > 0 ? stats.leads / stats.visits : 0,
        totalActions: actions.length,
        doneActions: actions.filter((a) => a.status === "done").length,
      },
      experiment?.surface_type || "landing",
      experiment?.self_result || null,
      null,
      experiment?.created_at || null
    );
  }, [stats.visits, stats.leads, actions, experiment?.surface_type, experiment?.self_result, experiment?.created_at]);

  const handleStatusChange = async (newStatus: ExperimentStatus) => {
    if (!experiment || isStatusUpdating) return;
    setIsStatusUpdating(true);
    const result = await updateExperimentStatus(experiment.id, newStatus);
    if (result.success) {
      setExperiment((prev) => (prev ? { ...prev, status: newStatus } : null));
      setToast("Estado actualizado");
    } else {
      setToast("Error al actualizar estado");
    }
    setTimeout(() => setToast(null), 3000);
    setIsStatusUpdating(false);
  };

  const openDeadlineModal = () => {
    if (!experiment) return;
    setDeadlineInput(experiment.deadline || "");
    setIsDeadlineModalOpen(true);
  };

  const handleSaveDeadline = async () => {
    if (!experiment || !deadlineInput) return;
    setIsSavingDeadline(true);
    try {
      const res = await fetch(`/api/experiments/${experiment.id}/deadline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: deadlineInput }),
      });
      const data = await res.json();
      if (data.success) {
        setExperiment((prev) => prev ? { ...prev, deadline: deadlineInput, deadline_source: "user" } : null);
        await fetchActions();
        setIsDeadlineModalOpen(false);
        setToast("Fecha límite actualizada");
      } else {
        setToast("Error al actualizar fecha límite");
      }
    } catch {
      setToast("Error al actualizar fecha límite");
    } finally {
      setIsSavingDeadline(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleSelfResultChange = async (newResult: SelfResult) => {
    if (!experiment || isSavingSelfResult) return;
    setIsSavingSelfResult(true);
    try {
      const { error } = await supabase.from("experiments").update({ self_result: newResult }).eq("id", experiment.id);
      if (error) throw error;
      setExperiment((prev) => (prev ? { ...prev, self_result: newResult } : null));
      setToast("Evaluación guardada");
    } catch {
      setToast("Error al guardar evaluación");
    } finally {
      setIsSavingSelfResult(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Handle marking progress (check-in)
  const handleMarkProgress = async (checkinData?: {
    userState: CurrentState;
    stepTitle: string;
    stepDescription: string;
    effort: EffortLevel;
  }) => {
    if (!experiment || isMarkingProgress) return;
    setIsMarkingProgress(true);

    try {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDate = today.toISOString().split("T")[0];

      // Calculate new streak
      let newStreak = 1;
      if (experiment.last_checkin_at) {
        const lastCheckinDate = new Date(experiment.last_checkin_at);
        lastCheckinDate.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastCheckinDate.getTime() === yesterday.getTime()) {
          newStreak = experiment.streak_days + 1;
        } else if (lastCheckinDate.getTime() === today.getTime()) {
          newStreak = experiment.streak_days;
        }
      }

      // Insert check-in record
      const checkinRecord = {
        experiment_id: experiment.id,
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

      const { error } = await supabase
        .from("experiments")
        .update({
          last_checkin_at: now.toISOString(),
          checkins_count: experiment.checkins_count + 1,
          streak_days: newStreak,
        })
        .eq("id", experiment.id);

      if (error) {
        console.warn("Could not update streak fields:", error.message);
        setToast("Avance marcado");
      } else {
        setToast(newStreak > 1 ? `Avance marcado. Racha: ${newStreak} días` : "Avance marcado");
      }

      setExperiment((prev) =>
        prev
          ? {
              ...prev,
              last_checkin_at: now.toISOString(),
              checkins_count: prev.checkins_count + 1,
              streak_days: newStreak,
            }
          : null
      );

      // Refresh checkins list
      await fetchCheckins();
    } catch (error) {
      console.error("Error marking progress:", error);
      setToast("Error al marcar avance");
    } finally {
      setIsMarkingProgress(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Mover proyecto modal handlers
  const openMoverModal = () => {
    setMoverModal({
      isOpen: true,
      step: "select_state",
      selectedState: null,
      nextStep: null,
    });
  };

  const closeMoverModal = () => {
    setMoverModal({
      isOpen: false,
      step: "select_state",
      selectedState: null,
      nextStep: null,
    });
  };

  // previousStepTitle is passed when user clicks "Otra idea" to avoid repeating the same step
  const handleStateSelect = async (state: CurrentState, previousStepTitle?: string) => {
    if (!experiment) return;

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
          experiment_id: experiment.id,
          current_state: state,
          // Pass previous step title to avoid repeating when user clicks "Otra idea"
          previous_step_title: previousStepTitle,
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
      setToast("Error al generar el siguiente paso");
      setTimeout(() => setToast(null), 3000);
      closeMoverModal();
    }
  };

  // "Lo haré" - saves step as pending without updating streak/checkin count
  const handleWillDoStep = async () => {
    if (!experiment || !moverModal.nextStep || isMarkingProgress) return;
    setIsMarkingProgress(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDate = today.toISOString().split("T")[0];

      // Insert check-in record as pending (commitment to do it)
      const checkinRecord = {
        experiment_id: experiment.id,
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
        setToast("Error al guardar el paso");
      } else {
        setToast("Paso guardado. ¡A por ello!");
      }

      // Refresh checkins list to show the new pending step
      await fetchCheckins();
    } catch (error) {
      console.error("Error saving step:", error);
      setToast("Error al guardar el paso");
    } finally {
      setIsMarkingProgress(false);
      setTimeout(() => setToast(null), 3000);
      closeMoverModal();
    }
  };

  // "Ya lo hice" - saves step as done and updates streak/checkin count
  const handleDidItStep = async () => {
    if (!moverModal.nextStep || !moverModal.selectedState) {
      await handleMarkProgress();
    } else {
      await handleMarkProgress({
        userState: moverModal.selectedState,
        stepTitle: moverModal.nextStep.next_step_title,
        stepDescription: moverModal.nextStep.next_step_description,
        effort: moverModal.nextStep.effort,
      });
    }
    closeMoverModal();
  };

  // "Otra idea" - regenerate step, passing current step title to avoid repetition
  const handleRegenerateStep = async () => {
    if (!moverModal.selectedState) return;
    // Pass current step title so API generates a DIFFERENT alternative
    const previousTitle = moverModal.nextStep?.next_step_title;
    await handleStateSelect(moverModal.selectedState, previousTitle);
  };

  // Inline flow handlers (for "Hoy con este proyecto" block)
  // previousStepTitle is passed when user clicks "Otra idea" to avoid repeating the same step
  const handleInlineStateSelect = async (state: CurrentState, previousStepTitle?: string) => {
    if (!experiment) return;

    setInlineSelectedState(state);
    setInlineStep("loading");

    try {
      const response = await fetch("/api/next-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experiment.id,
          current_state: state,
          // Pass previous step title to avoid repeating when user clicks "Otra idea"
          previous_step_title: previousStepTitle,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate next step");
      }

      const data: NextStepResponse = await response.json();
      setInlineNextStep(data);
      setInlineStep("show_step");
    } catch (error) {
      console.error("Error generating next step:", error);
      setToast("Error al generar el siguiente paso");
      setTimeout(() => setToast(null), 3000);
      setInlineStep("select_state");
      setInlineSelectedState(null);
    }
  };

  // "Lo haré" inline - saves step as pending without updating streak/checkin count
  const handleInlineWillDoStep = async () => {
    if (!experiment || !inlineNextStep || isMarkingProgress) return;
    setIsMarkingProgress(true);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayDate = today.toISOString().split("T")[0];

      const checkinRecord = {
        experiment_id: experiment.id,
        status: "pending",
        user_state: inlineSelectedState || null,
        step_title: inlineNextStep.next_step_title,
        step_description: inlineNextStep.next_step_description,
        effort: inlineNextStep.effort,
        source: "move_project",
        day_date: dayDate,
      };

      const { error: checkinError } = await supabase
        .from("experiment_checkins")
        .insert(checkinRecord);

      if (checkinError) {
        console.warn("Could not insert pending step:", checkinError.message);
        setToast("Error al guardar el paso");
      } else {
        setToast("Paso guardado. ¡A por ello!");
      }

      await fetchCheckins();
    } catch (error) {
      console.error("Error saving step:", error);
      setToast("Error al guardar el paso");
    } finally {
      setIsMarkingProgress(false);
      setTimeout(() => setToast(null), 3000);
      // Reset inline state
      setInlineStep("select_state");
      setInlineSelectedState(null);
      setInlineNextStep(null);
    }
  };

  // "Ya lo hice" inline - saves step as done and updates streak/checkin count
  const handleInlineDidItStep = async () => {
    if (!inlineNextStep || !inlineSelectedState) {
      await handleMarkProgress();
    } else {
      await handleMarkProgress({
        userState: inlineSelectedState,
        stepTitle: inlineNextStep.next_step_title,
        stepDescription: inlineNextStep.next_step_description,
        effort: inlineNextStep.effort,
      });
    }
    // Reset inline state
    setInlineStep("select_state");
    setInlineSelectedState(null);
    setInlineNextStep(null);
  };

  // "Otra idea" - regenerate step, passing current step title to avoid repetition
  const handleInlineRegenerateStep = async () => {
    if (!inlineSelectedState) return;
    // Pass current step title so API generates a DIFFERENT alternative
    const previousTitle = inlineNextStep?.next_step_title;
    await handleInlineStateSelect(inlineSelectedState, previousTitle);
  };

  const handleInlineBack = () => {
    setInlineStep("select_state");
    setInlineSelectedState(null);
    setInlineNextStep(null);
  };

  // Mark a pending step as done (from the history list)
  const handleMarkStepDone = async (stepId: string) => {
    if (!experiment || isMarkingProgress) return;
    setIsMarkingProgress(true);

    try {
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Update the checkin to done
      const { error: updateError } = await supabase
        .from("experiment_checkins")
        .update({ status: "done" })
        .eq("id", stepId);

      if (updateError) {
        console.warn("Could not update step:", updateError.message);
        setToast("Error al completar el paso");
        return;
      }

      // Calculate new streak
      let newStreak = 1;
      if (experiment.last_checkin_at) {
        const lastCheckinDate = new Date(experiment.last_checkin_at);
        lastCheckinDate.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastCheckinDate.getTime() === yesterday.getTime()) {
          newStreak = experiment.streak_days + 1;
        } else if (lastCheckinDate.getTime() === today.getTime()) {
          newStreak = experiment.streak_days;
        }
      }

      // Update experiment streak and checkin count
      const { error: expError } = await supabase
        .from("experiments")
        .update({
          last_checkin_at: now.toISOString(),
          checkins_count: experiment.checkins_count + 1,
          streak_days: newStreak,
        })
        .eq("id", experiment.id);

      if (expError) {
        console.warn("Could not update experiment:", expError.message);
      }

      // Update local experiment state
      setExperiment((prev) =>
        prev
          ? {
              ...prev,
              last_checkin_at: now.toISOString(),
              checkins_count: prev.checkins_count + 1,
              streak_days: newStreak,
            }
          : null
      );

      setToast(newStreak > 1 ? `¡Paso completado! Racha: ${newStreak} días` : "¡Paso completado!");
      await fetchCheckins();

      // Auto-change status: if all steps are completed and status is "testing" (Arrancando),
      // change to "scale" (En marcha)
      const updatedCheckins = await supabase
        .from("experiment_checkins")
        .select("*")
        .eq("experiment_id", experiment.id);

      if (updatedCheckins.data) {
        const allDone = updatedCheckins.data.length > 0 &&
          updatedCheckins.data.every((c: { status: string }) => c.status === "done");

        if (allDone && experiment.status === "testing") {
          // Auto-transition from Arrancando to En marcha
          const { error: statusError } = await supabase
            .from("experiments")
            .update({ status: "scale" })
            .eq("id", experiment.id);

          if (!statusError) {
            setExperiment((prev) => prev ? { ...prev, status: "scale" } : null);
            setToast("¡Plan completado! Estado cambiado a En marcha.");
          }
        }
      }
    } catch (error) {
      console.error("Error marking step done:", error);
      setToast("Error al completar el paso");
    } finally {
      setIsMarkingProgress(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Toggle a done step back to pending
  const handleToggleStepPending = async (stepId: string) => {
    if (isMarkingProgress) return;
    setIsMarkingProgress(true);

    try {
      const { error: updateError } = await supabase
        .from("experiment_checkins")
        .update({ status: "pending" })
        .eq("id", stepId);

      if (updateError) {
        console.warn("Could not update step:", updateError.message);
        setToast("Error al desmarcar el paso");
        return;
      }

      setToast("Paso marcado como pendiente");
      await fetchCheckins();
    } catch (error) {
      console.error("Error toggling step to pending:", error);
      setToast("Error al desmarcar el paso");
    } finally {
      setIsMarkingProgress(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Delete a step
  const handleDeleteStep = async () => {
    if (!stepToDelete || isDeletingStep) return;
    setIsDeletingStep(true);

    try {
      const { error } = await supabase
        .from("experiment_checkins")
        .delete()
        .eq("id", stepToDelete.id);

      if (error) {
        console.warn("Could not delete step:", error.message);
        setToast("Error al eliminar el paso");
        return;
      }

      setToast("Paso eliminado");
      setStepToDelete(null);
      await fetchCheckins();
    } catch (error) {
      console.error("Error deleting step:", error);
      setToast("Error al eliminar el paso");
    } finally {
      setIsDeletingStep(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Step detail modal handlers
  const openStepDetail = (step: ExperimentCheckin) => {
    setSelectedStep(step);
    setStepUserContent(step.user_content || "");
  };

  const closeStepDetail = () => {
    setSelectedStep(null);
    setStepUserContent("");
  };

  const handleSaveStepContent = async () => {
    if (!selectedStep) return;
    setIsSavingStepContent(true);

    try {
      const { error } = await supabase
        .from("experiment_checkins")
        .update({ user_content: stepUserContent })
        .eq("id", selectedStep.id);

      if (error) throw error;

      // Update local state
      setCheckins((prev) =>
        prev.map((c) =>
          c.id === selectedStep.id ? { ...c, user_content: stepUserContent } : c
        )
      );
      setSelectedStep((prev) =>
        prev ? { ...prev, user_content: stepUserContent } : null
      );
      setToast("Contenido guardado");
    } catch {
      setToast("Error al guardar contenido");
    } finally {
      setIsSavingStepContent(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleGenerateIdeas = async () => {
    if (!selectedStep || !experiment) return;
    setIsGeneratingIdeas(true);

    try {
      const res = await fetch("/api/generate-step-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: experiment.title,
          projectDescription: experiment.description,
          stepTitle: selectedStep.step_title,
          stepDescription: selectedStep.step_description,
        }),
      });

      const data = await res.json();
      if (data.success && data.content) {
        setStepUserContent(data.content);
        setToast("Borrador generado. ¡Edítalo a tu gusto!");
      } else {
        setToast("No se pudo generar el borrador");
      }
    } catch {
      setToast("Error al generar ideas");
    } finally {
      setIsGeneratingIdeas(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Handler to generate Vicu recommendation
  const handleGenerateRecommendation = async () => {
    if (!experiment || isLoadingRecommendation) return;
    setIsLoadingRecommendation(true);

    try {
      const res = await fetch("/api/generate-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experiment.id }),
      });

      const data = await res.json();
      if (data.success && data.recommendation) {
        setVicuRecommendation(data.recommendation);
        setToast("Recomendación generada");
      } else {
        setToast("Error al generar recomendación");
      }
    } catch {
      setToast("Error al generar recomendación");
    } finally {
      setIsLoadingRecommendation(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Map recommendation action to experiment status
  const mapRecommendationToStatus = (action: string): ExperimentStatus => {
    switch (action.toLowerCase()) {
      case "escalar":
        return "scale";
      case "iterar":
        return "iterate";
      case "pausar":
        return "paused";
      case "cerrar":
        return "kill";
      default:
        return "scale"; // default to "En marcha"
    }
  };

  // Handler to accept Vicu recommendation and update status
  const handleAcceptRecommendation = async () => {
    if (!experiment || !vicuRecommendation || isStatusUpdating) return;

    const newStatus = mapRecommendationToStatus(vicuRecommendation.action);

    setIsStatusUpdating(true);
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ status: newStatus })
        .eq("id", experiment.id);

      if (error) throw error;

      setExperiment((prev) => prev ? { ...prev, status: newStatus } : null);
      setToast(`Estado cambiado a ${STATUS_LABELS[newStatus]}`);
    } catch {
      setToast("Error al actualizar estado");
    } finally {
      setIsStatusUpdating(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Objetivo editable handlers
  const handleSaveObjective = async () => {
    if (!experiment) return;
    setIsSavingObjective(true);
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ description: objectiveInput })
        .eq("id", experiment.id);
      if (error) throw error;
      setExperiment((prev) => prev ? { ...prev, description: objectiveInput } : null);
      setIsEditingObjective(false);
      setToast("Objetivo actualizado");
    } catch {
      setToast("Error al guardar objetivo");
    } finally {
      setIsSavingObjective(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Delete experiment handler (soft delete)
  const handleDeleteExperiment = async () => {
    if (!experiment) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", experiment.id);
      if (error) throw error;
      setToast("Objetivo eliminado");
      setTimeout(() => {
        router.push("/hoy");
      }, 500);
    } catch {
      setToast("Error al eliminar");
      setIsDeleting(false);
    }
  };

  const handleSurfaceTypeChange = async (newSurface: SurfaceType, shouldRegenerate: boolean) => {
    if (!experiment || isSavingSurface) return;
    setIsSavingSurface(true);

    try {
      // Update the surface type
      const { error } = await supabase.from("experiments").update({ surface_type: newSurface }).eq("id", experiment.id);
      if (error) throw error;
      setExperiment((prev) => (prev ? { ...prev, surface_type: newSurface } : null));

      // If regeneration requested, delete existing actions and regenerate
      if (shouldRegenerate) {
        setIsRegenerating(true);
        setIsSurfaceModalOpen(false);

        // Delete existing actions
        await supabase.from("experiment_actions").delete().eq("experiment_id", experiment.id);
        setActions([]);

        // Regenerate actions with new surface type
        const res = await fetch("/api/generate-attack-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experiment_id: experiment.id,
            surface_type: newSurface,
            deadline: experiment.deadline,
          }),
        });
        const data = await res.json();
        if (data.success && data.actions) {
          setActions(data.actions);
          setToast("Superficie y plan actualizados");
        } else {
          setToast("Superficie actualizada, error al regenerar plan");
        }
        setIsRegenerating(false);
      } else {
        setIsSurfaceModalOpen(false);
        setToast("Superficie actualizada");
      }
    } catch {
      setToast("Error al cambiar superficie");
    } finally {
      setIsSavingSurface(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const fetchActions = useCallback(async () => {
    try {
      const { data: actionsData, error } = await supabase
        .from("experiment_actions")
        .select("*")
        .eq("experiment_id", id)
        .order("suggested_order", { ascending: true });
      if (error) {
        setActionsError(true);
        return;
      }
      if (actionsData) setActions(actionsData);
    } catch {
      setActionsError(true);
    }
  }, [id]);

  const fetchCheckins = useCallback(async () => {
    try {
      const { data: checkinsData, error } = await supabase
        .from("experiment_checkins")
        .select("*")
        .eq("experiment_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        console.warn("Could not fetch checkins:", error.message);
        return;
      }
      if (checkinsData) setCheckins(checkinsData);
    } catch (err) {
      console.warn("Error fetching checkins:", err);
    }
  }, [id]);

  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const { data: expData, error: expError } = await supabase.from("experiments").select("*").eq("id", id).single();
      if (expError) {
        setLoading(false);
        return;
      }
      setExperiment(expData);
      // Load existing vicu recommendation if present
      if (expData.vicu_recommendation) {
        setVicuRecommendation(expData.vicu_recommendation as VicuRecommendationData);
      }
      const { count: visitsCount } = await supabase.from("events").select("*", { count: "exact", head: true }).eq("experiment_id", id).eq("type", "visit");
      const { count: leadsCount } = await supabase.from("events").select("*", { count: "exact", head: true }).eq("experiment_id", id).eq("type", "form_submit");
      const visits = visitsCount || 0;
      const leads = leadsCount || 0;
      setStats({ visits, leads, conversionRate: visits > 0 ? (leads / visits) * 100 : 0 });
      await fetchActions();
      await fetchCheckins();
      setLoading(false);
    }
    fetchData();
  }, [id, fetchActions, fetchCheckins]);

  useEffect(() => {
    if (!loading && actions.length === 0 && !actionsError) {
      const interval = setInterval(fetchActions, 3000);
      return () => clearInterval(interval);
    }
  }, [loading, actions.length, actionsError, fetchActions]);

  const handleCopyContent = async (actionId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(actionId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleMarkDone = async (actionId: string) => {
    try {
      const res = await fetch("/api/experiment-actions/mark-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId }),
      });
      if (res.ok) {
        setActions((prev) => prev.map((a) => a.id === actionId ? { ...a, status: "done" as const, done_at: new Date().toISOString() } : a));
      }
    } catch (error) {
      console.error("Error marking action as done:", error);
    }
  };

  const handleGenerateMore = async (channel: string) => {
    if (generatingChannel) return;
    setGeneratingChannel(channel);
    try {
      const res = await fetch("/api/generate-more-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: id, channel }),
      });
      const data = await res.json();
      if (data.success && data.actions) {
        setActions((prev) => [...prev, ...data.actions]);
        setToast(`${data.count} nuevas acciones generadas`);
      } else {
        setToast("Error al generar nuevas acciones");
      }
    } catch {
      setToast("Error al generar nuevas acciones");
    } finally {
      setGeneratingChannel(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const openEditModal = () => {
    if (!experiment) return;
    setEditForm({
      target_audience: experiment.target_audience || "",
      main_pain: experiment.main_pain || "",
      main_promise: experiment.main_promise || "",
      main_cta: experiment.main_cta || "",
      success_goal: experiment.success_goal_number && experiment.success_goal_unit ? `${experiment.success_goal_number} ${experiment.success_goal_unit}` : "",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveBrief = async () => {
    if (!experiment) return;
    setIsSaving(true);
    try {
      const goalMatch = editForm.success_goal.match(/(\d+)\s*(.+)/);
      const success_goal_number = goalMatch ? parseInt(goalMatch[1], 10) : null;
      const success_goal_unit = goalMatch ? goalMatch[2].trim().toLowerCase() : null;
      const { error: updateError } = await supabase.from("experiments").update({
        target_audience: editForm.target_audience || null,
        main_pain: editForm.main_pain || null,
        main_promise: editForm.main_promise || null,
        main_cta: editForm.main_cta || null,
        success_goal_number,
        success_goal_unit,
      }).eq("id", experiment.id);
      if (updateError) throw updateError;
      if (experiment.surface_type === "landing" || !experiment.surface_type) {
        const copyRes = await fetch("/api/generate-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: experiment.description,
            target_audience: editForm.target_audience,
            main_pain: editForm.main_pain,
            main_promise: editForm.main_promise,
            main_cta: editForm.main_cta,
          }),
        });
        const copyData = await copyRes.json();
        if (copyData.success && copyData.copy) setCopy(copyData.copy);
      }
      setExperiment((prev) => prev ? { ...prev, target_audience: editForm.target_audience || null, main_pain: editForm.main_pain || null, main_promise: editForm.main_promise || null, main_cta: editForm.main_cta || null, success_goal_number, success_goal_unit } : null);
      setIsEditModalOpen(false);
      setToast("Brief actualizado");
    } catch {
      setToast("Error al guardar el brief");
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-slate-400">Cargando experimento...</p>
        </div>
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Experimento no encontrado</p>
      </div>
    );
  }

  const hasGoal = experiment.success_goal_number !== null;
  const goalReached = hasGoal && stats.leads >= (experiment.success_goal_number || 0);
  const actionsByChannel = actions.reduce((acc, action) => {
    if (!acc[action.channel]) acc[action.channel] = [];
    acc[action.channel].push(action);
    return acc;
  }, {} as Record<string, ExperimentAction[]>);
  const deadlineInfo = experiment.deadline ? formatDeadline(experiment.deadline, experiment.deadline_source) : null;
  // Use checkins for progress instead of actions
  const progressInfo = getProgressMessage(completedSteps, totalSteps);

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 card-glass text-slate-50 rounded-xl shadow-lg animate-fade-in-down">
          {toast}
        </div>
      )}

      {/* Edit Brief Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsEditModalOpen(false)} />
          <div className="relative w-full max-w-lg card-premium p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
            <h3 className="text-xl font-semibold text-slate-50 mb-4">Editar brief</h3>
            <div className="flex flex-col gap-4">
              {[
                { label: "Audiencia objetivo", key: "target_audience" },
                { label: "Dolor principal", key: "main_pain" },
                { label: "Promesa", key: "main_promise" },
                { label: "Acción deseada", key: "main_cta" },
                { label: "Meta de éxito", key: "success_goal", placeholder: "Ej: 10 leads" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-400 mb-1">{label}</label>
                  <input
                    type="text"
                    value={editForm[key as keyof typeof editForm]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-50 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setIsEditModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-white/5 transition-all">Cancelar</button>
              <button onClick={handleSaveBrief} disabled={isSaving} className="flex-1 px-4 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all disabled:opacity-50">
                {isSaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deadline Modal */}
      {isDeadlineModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsDeadlineModalOpen(false)} />
          <div className="relative w-full max-w-sm card-premium p-6 animate-scale-in">
            <h3 className="text-xl font-semibold text-slate-50 mb-4">
              {experiment?.deadline ? "Editar fecha límite" : "Agregar fecha límite"}
            </h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-400 mb-2">¿Cuándo debe terminar este experimento?</label>
              <input
                type="date"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-50 focus:outline-none focus:border-indigo-500/50"
              />
              <p className="text-xs text-slate-500 mt-2">Las fechas de cada acción se recalcularán automáticamente.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setIsDeadlineModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-slate-300 font-medium hover:bg-white/5 transition-all">Cancelar</button>
              <button onClick={handleSaveDeadline} disabled={isSavingDeadline || !deadlineInput} className="flex-1 px-4 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all disabled:opacity-50">
                {isSavingDeadline ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Surface Type Modal - HIDDEN from UI (functionality kept in backend) */}

      <main className="max-w-5xl mx-auto px-4 py-8 md:py-10">
        {/* Header with navigation - Vicu now uses /hoy as main home */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/hoy" className="text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a Hoy
          </Link>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="text-sm text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
            title="Eliminar objetivo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card - Surface type (Ritual/Landing/Mensajes) hidden from UI */}
            <div className="card-premium px-5 py-4">
              <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 tracking-tight mb-3">{experiment.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE_COLORS[experiment.status || "testing"]}`}>
                  {STATUS_LABELS[experiment.status || "testing"]}
                </span>
                {deadlineInfo && (
                  <button onClick={openDeadlineModal} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/10 hover:border-indigo-500/50 transition-colors flex items-center gap-1">
                    {deadlineInfo.textShort}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
                {!deadlineInfo && (
                  <button onClick={openDeadlineModal} className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/10 hover:border-indigo-500/50 transition-colors">
                    + Deadline
                  </button>
                )}
              </div>
            </div>

            {/* Objetivo del proyecto - Editable */}
            <div className="card-premium px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Objetivo</h3>
                {!isEditingObjective && (
                  <button
                    onClick={() => {
                      setObjectiveInput(experiment.description || "");
                      setIsEditingObjective(true);
                    }}
                    className="text-slate-500 hover:text-indigo-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
              {isEditingObjective ? (
                <div className="space-y-3">
                  <textarea
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    placeholder="¿Por qué es importante este proyecto para ti?"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-50 focus:outline-none focus:border-indigo-500/50 resize-none"
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingObjective(false)}
                      className="px-4 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveObjective}
                      disabled={isSavingObjective}
                      className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-400 transition-all disabled:opacity-50"
                    >
                      {isSavingObjective ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-slate-300 leading-relaxed">
                  {experiment.description || (
                    <span className="text-slate-500 italic">
                      Agrega en una frase por qué este proyecto es importante para ti.
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Progress Card - Moved here, right after Objetivo */}
            {totalSteps > 0 && (
              <div className="card-premium px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">Progreso del plan</p>
                  <p className="text-lg font-semibold text-slate-50">{completedSteps} / {totalSteps}</p>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500" style={{ width: `${progressInfo.ratio * 100}%` }} />
                </div>
                <p className={`text-sm ${progressInfo.ratio === 1 ? "text-emerald-400" : progressInfo.ratio >= 0.5 ? "text-blue-400" : "text-slate-400"}`}>
                  {progressInfo.message}
                </p>
                {pendingSteps > 0 && (
                  <p className="text-xs text-indigo-400 mt-2">
                    {pendingSteps} {pendingSteps === 1 ? "paso pendiente" : "pasos pendientes"}
                  </p>
                )}
              </div>
            )}

            {/* Vicu Recommendation Card - Now placed after Progreso del plan */}
            {totalSteps > 0 && completedSteps === totalSteps ? (
              vicuRecommendation ? (
                <div className="card-premium px-5 py-5 border-indigo-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                      <span className="text-white text-lg font-bold">v</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-50">Recomendación de Vicu</h3>
                      <p className="text-sm text-slate-400">Basada en tu progreso</p>
                    </div>
                  </div>

                  {/* Action badge */}
                  <div className="mb-4">
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                      vicuRecommendation.action === "escalar" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                      vicuRecommendation.action === "iterar" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                      vicuRecommendation.action === "pausar" ? "bg-slate-500/20 text-slate-400 border border-slate-500/30" :
                      "bg-red-500/20 text-red-400 border border-red-500/30"
                    }`}>
                      {vicuRecommendation.action === "escalar" && "🚀 Cambiar a En marcha"}
                      {vicuRecommendation.action === "iterar" && "🔄 Cambiar a Ajustando"}
                      {vicuRecommendation.action === "pausar" && "⏸️ Cambiar a En pausa"}
                      {vicuRecommendation.action === "cerrar" && "✓ Cambiar a Cerrado"}
                    </span>
                  </div>

                  {/* Title and summary */}
                  <h4 className="text-base font-medium text-slate-100 mb-2">{vicuRecommendation.title}</h4>
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{vicuRecommendation.summary}</p>

                  {/* Reasons */}
                  {vicuRecommendation.reasons && vicuRecommendation.reasons.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">Por qué</p>
                      <ul className="space-y-1.5">
                        {vicuRecommendation.reasons.map((reason, i) => (
                          <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                            <span className="text-indigo-400 mt-1">•</span>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Next focus */}
                  {vicuRecommendation.suggested_next_focus && (
                    <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
                      <p className="text-xs text-indigo-400 uppercase tracking-wider mb-1 font-medium">Siguiente enfoque</p>
                      <p className="text-sm text-slate-200">{vicuRecommendation.suggested_next_focus}</p>
                    </div>
                  )}

                  {/* Accept recommendation button */}
                  <button
                    onClick={handleAcceptRecommendation}
                    disabled={isStatusUpdating}
                    className={`w-full px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                      vicuRecommendation.action === "escalar" ? "bg-emerald-500 hover:bg-emerald-400 text-white" :
                      vicuRecommendation.action === "iterar" ? "bg-amber-500 hover:bg-amber-400 text-white" :
                      vicuRecommendation.action === "pausar" ? "bg-slate-500 hover:bg-slate-400 text-white" :
                      "bg-red-500 hover:bg-red-400 text-white"
                    }`}
                  >
                    {isStatusUpdating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Actualizando...</span>
                      </>
                    ) : (
                      <>
                        {vicuRecommendation.action === "escalar" && "🚀"}
                        {vicuRecommendation.action === "iterar" && "🔄"}
                        {vicuRecommendation.action === "pausar" && "⏸️"}
                        {vicuRecommendation.action === "cerrar" && "✓"}
                        <span>
                          Aceptar: Cambiar a {
                            vicuRecommendation.action === "escalar" ? "En marcha" :
                            vicuRecommendation.action === "iterar" ? "Ajustando" :
                            vicuRecommendation.action === "pausar" ? "En pausa" :
                            "Cerrado"
                          }
                        </span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="card-premium px-5 py-5 border-emerald-500/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-emerald-400">¡Plan completado!</h3>
                      <p className="text-sm text-slate-400">Completaste todos los pasos</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 mb-4">
                    Has completado {completedSteps} de {totalSteps} pasos. Genera una recomendación de Vicu para saber qué hacer a continuación.
                  </p>
                  <button
                    onClick={handleGenerateRecommendation}
                    disabled={isLoadingRecommendation}
                    className="w-full px-4 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoadingRecommendation ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Generando recomendación...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">✨</span>
                        <span>Generar recomendación de Vicu</span>
                      </>
                    )}
                  </button>
                </div>
              )
            ) : completedSteps >= 2 && (
              /* Minimal recommendation while plan is in progress */
              <div className="card-premium px-4 py-3 border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-bold">v</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${recommendation.color.bg} ${recommendation.color.text}`}>
                      {recommendation.tagLabel}
                    </span>
                    <p className="text-sm text-slate-300">{recommendation.title}</p>
                  </div>
                </div>
              </div>
            )}

            {/* HOY CON ESTE PROYECTO - Bloque principal con copy dinámico según estado */}
            <div className="card-accent px-5 py-5 border-indigo-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <span className="text-white text-lg font-bold">v</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">{getTodayCopyForStatus(experiment.status).title}</h2>
                  <p className="text-sm text-slate-400">{getTodayCopyForStatus(experiment.status).description}</p>
                </div>
              </div>

              {/* Estado de avance de hoy */}
              <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <p className="text-sm text-slate-400">
                  {experiment.last_checkin_at && new Date(experiment.last_checkin_at).toDateString() === new Date().toDateString() ? (
                    <span className="text-emerald-400 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Ya marcaste avance hoy
                    </span>
                  ) : experiment.last_checkin_at ? (
                    <>Último avance: <span className="text-slate-300">{formatLastCheckin(experiment.last_checkin_at)}</span></>
                  ) : (
                    <span className="text-amber-400">Aún no has marcado ningún avance</span>
                  )}
                </p>
              </div>

              {/* Flujo inline */}
              {inlineStep === "select_state" && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-300 mb-3">¿Cómo vas con este proyecto hoy?</p>
                  {STATE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleInlineStateSelect(option.value)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left group"
                    >
                      <span className="text-xl">{option.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-slate-100 group-hover:text-indigo-300 transition-colors text-sm">
                          {option.label}
                        </p>
                        <p className="text-xs text-slate-500">{option.description}</p>
                      </div>
                      <svg className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}

              {inlineStep === "loading" && (
                <div className="py-6 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-sm text-slate-400">Vicu está pensando el mejor paso para ti...</p>
                </div>
              )}

              {inlineStep === "show_step" && inlineNextStep && (
                <div className="space-y-4">
                  {/* Step header with improved typography */}
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-indigo-600/20 flex items-center justify-center border border-indigo-500/20">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 font-medium">Tu siguiente paso</p>
                      <h3 className="text-lg font-semibold text-slate-50 leading-tight tracking-tight">{inlineNextStep.next_step_title}</h3>
                    </div>
                  </div>

                  {/* Description with better readability */}
                  <p className="text-[15px] text-slate-300 leading-relaxed pl-[52px]">{inlineNextStep.next_step_description}</p>

                  {/* Effort pill with refined styling */}
                  <div className="flex items-center gap-2 pl-[52px]">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                      inlineNextStep.effort === "muy_pequeno"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : inlineNextStep.effort === "pequeno"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                        : "bg-orange-500/15 text-orange-400 border border-orange-500/20"
                    }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {EFFORT_LABELS[inlineNextStep.effort].text}
                    </span>
                  </div>

                  {/* Actions - premium button styling */}
                  <div className="space-y-3 pt-3 pl-[52px]">
                    {/* Primary buttons row */}
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <button
                        onClick={handleInlineWillDoStep}
                        disabled={isMarkingProgress}
                        className="flex-1 px-5 py-3 rounded-2xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 text-[15px] shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.01] active:scale-[0.99]"
                      >
                        {isMarkingProgress ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span>Lo haré</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleInlineDidItStep}
                        disabled={isMarkingProgress}
                        className="flex-1 px-5 py-3 rounded-2xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 text-[15px] shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 hover:scale-[1.01] active:scale-[0.99]"
                      >
                        {isMarkingProgress ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Ya lo hice</span>
                          </>
                        )}
                      </button>
                    </div>
                    {/* Secondary button - subtle but accessible */}
                    <button
                      onClick={handleInlineRegenerateStep}
                      disabled={isMarkingProgress}
                      className="w-full px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all duration-200 flex items-center justify-center gap-2 border border-transparent hover:border-white/10"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Otra idea</span>
                    </button>
                  </div>

                  <button
                    onClick={handleInlineBack}
                    className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors pt-2"
                  >
                    ← Cambiar mi estado
                  </button>
                </div>
              )}
            </div>

            {/* Mobile-only Metrics - HIDDEN for now (not functional) */}
            {/*
            <div className="lg:hidden card-premium px-5 py-4">
              ... metrics content hidden ...
            </div>
            */}

            {/* Mobile-only Progress Tracking */}
            <div className="lg:hidden card-premium px-5 py-4">
              <h3 className="text-sm font-medium text-slate-400 mb-3">Seguimiento</h3>
              <div className="flex items-center justify-between mb-4">
                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div>
                    <p className="text-2xl font-semibold text-slate-50">{experiment.checkins_count || 0}</p>
                    <p className="text-xs text-slate-500">Check-ins totales</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <p className="text-2xl font-semibold text-slate-50">{experiment.streak_days || 0}</p>
                      {(experiment.streak_days || 0) > 0 && <span className="text-orange-400">🔥</span>}
                    </div>
                    <p className="text-xs text-slate-500">Días de racha</p>
                  </div>
                </div>
              </div>
              {experiment.last_checkin_at && new Date(experiment.last_checkin_at).toDateString() === new Date().toDateString() ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Avance marcado hoy</span>
                </div>
              ) : (
                <button
                  onClick={openMoverModal}
                  className="w-full px-4 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Mover proyecto</span>
                </button>
              )}
            </div>

            {/* Self Result Selector - shows after completing 50% of actions */}
            {doneActions >= totalActions * 0.5 && totalActions > 0 && (
              <div className="card-premium px-5 py-4">
                <p className="text-sm font-medium text-slate-400 mb-3">¿Cómo sientes que fue el resultado?</p>
                <div className="flex flex-wrap gap-2">
                  {(["alto", "medio", "bajo"] as const).map((result) => (
                    <button
                      key={result}
                      onClick={() => handleSelfResultChange(result)}
                      disabled={isSavingSelfResult}
                      className={`chip-interactive px-4 py-2 rounded-full text-sm font-medium border ${
                        experiment.self_result === result
                          ? result === "alto" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : result === "medio" ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                          : "bg-white/5 text-slate-400 border-white/10 hover:border-white/20"
                      } disabled:opacity-50`}
                    >
                      {SELF_RESULT_LABELS[result]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Progress Card moved to after Objetivo section */}

            {/* Goal Status - Only show when goal is reached (yellow "Aún no llegas a la meta" message removed) */}
            {hasGoal && goalReached && (
              <div className="card-premium px-5 py-4 border-emerald-500/30">
                <p className="font-medium text-emerald-400">
                  Meta alcanzada. Considera escalar este experimento.
                </p>
              </div>
            )}

            {/* Messages Bank - Hidden from UI (surface_type logic removed) */}


            {/* Historial de avances (Check-ins) */}
            {checkins.length > 0 && (
              <div className="mt-8">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-slate-50">Historial de avances</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Tus últimos pasos en este proyecto
                  </p>
                </div>
                <div className="space-y-3">
                  {checkins.map((checkin) => {
                    const isPending = checkin.status === "pending";
                    const hasContent = !!checkin.user_content;
                    return (
                      <div
                        key={checkin.id}
                        className={`card-premium px-4 py-3 cursor-pointer hover:border-white/20 transition-all group/card ${isPending ? "border-indigo-500/20" : ""}`}
                        onClick={() => openStepDetail(checkin)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Toggle checkbox - clickable for both pending and done */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPending) {
                                handleMarkStepDone(checkin.id);
                              } else {
                                handleToggleStepPending(checkin.id);
                              }
                            }}
                            disabled={isMarkingProgress}
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 transition-all disabled:opacity-50 ${
                              isPending
                                ? "bg-indigo-500/20 hover:bg-indigo-500/30 border-2 border-transparent hover:border-indigo-500/50"
                                : "bg-emerald-500/20 hover:bg-emerald-500/10 border-2 border-transparent hover:border-amber-500/50"
                            }`}
                            title={isPending ? "Marcar como completado" : "Desmarcar como pendiente"}
                          >
                            <svg className={`w-4 h-4 transition-colors ${isPending ? "text-indigo-400" : "text-emerald-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {checkin.step_title ? (
                                <p className="font-medium text-slate-100 truncate">{checkin.step_title}</p>
                              ) : (
                                <p className="font-medium text-slate-100">Avance registrado</p>
                              )}
                              {isPending && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                  Pendiente
                                </span>
                              )}
                              {hasContent && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                  Con notas
                                </span>
                              )}
                            </div>
                            {checkin.step_description && (
                              <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{checkin.step_description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                              <span>{new Date(checkin.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                              {checkin.effort && (
                                <span className={`px-2 py-0.5 rounded-full ${
                                  checkin.effort === "muy_pequeno" ? "bg-emerald-500/20 text-emerald-400" :
                                  checkin.effort === "pequeno" ? "bg-amber-500/20 text-amber-400" :
                                  "bg-orange-500/20 text-orange-400"
                                }`}>
                                  {checkin.effort === "muy_pequeno" ? "~5 min" : checkin.effort === "pequeno" ? "~20 min" : "~1 hora"}
                                </span>
                              )}
                              {checkin.user_state && (
                                <span className="text-slate-500">
                                  {checkin.user_state === "not_started" ? "Empezando" :
                                   checkin.user_state === "stuck" ? "Destrabando" : "Avanzando"}
                                </span>
                              )}
                              {/* Visual cue that card is clickable */}
                              <span className="ml-auto text-slate-600 group-hover/card:text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </span>
                            </div>
                          </div>
                          {/* Delete button - appears on hover */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStepToDelete(checkin);
                            }}
                            className="flex-shrink-0 p-2 rounded-lg text-slate-600 opacity-0 group-hover/card:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Eliminar paso"
                            aria-label="Eliminar paso"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column (1/3) - Hidden on mobile */}
          <div className="hidden lg:block space-y-6">
            {/* Metrics Card - HIDDEN for now (not functional) */}
            {/*
            <div className="card-premium px-5 py-4">
              <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Métricas</h3>
              ... content hidden ...
            </div>
            */}

            {/* Status Selector */}
            <div className="card-premium px-5 py-4">
              <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider">Estado</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABELS) as ExperimentStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={isStatusUpdating}
                    className={`chip-interactive px-3 py-1.5 rounded-full text-xs font-medium border ${
                      experiment.status === status ? STATUS_BADGE_COLORS[status] : "bg-white/5 text-slate-400 border-white/10 hover:border-white/20"
                    } disabled:opacity-50`}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress Tracking Card */}
            <div className="card-premium px-5 py-4">
              <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Seguimiento</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                  <p className="text-xl font-semibold text-slate-50">{experiment.checkins_count || 0}</p>
                  <p className="text-xs text-slate-500">Check-ins</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-xl font-semibold text-slate-50">{experiment.streak_days || 0}</p>
                    {(experiment.streak_days || 0) > 0 && <span className="text-orange-400">🔥</span>}
                  </div>
                  <p className="text-xs text-slate-500">Días de racha</p>
                </div>
              </div>
              {experiment.last_checkin_at && new Date(experiment.last_checkin_at).toDateString() === new Date().toDateString() ? (
                <div className="flex items-center gap-2 text-emerald-400 text-sm justify-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Avance marcado hoy</span>
                </div>
              ) : (
                <button
                  onClick={openMoverModal}
                  className="w-full px-4 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Mover proyecto</span>
                </button>
              )}
            </div>

            {/* Brief Card */}
            <div className="card-premium px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Brief</h3>
                <button onClick={openEditModal} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Editar</button>
              </div>
              <dl className="space-y-3 text-sm">
                {experiment.target_audience && (
                  <div>
                    <dt className="text-slate-500">Audiencia</dt>
                    <dd className="text-slate-200 mt-0.5">{experiment.target_audience}</dd>
                  </div>
                )}
                {experiment.main_pain && (
                  <div>
                    <dt className="text-slate-500">Dolor</dt>
                    <dd className="text-slate-200 mt-0.5">{experiment.main_pain}</dd>
                  </div>
                )}
                {experiment.main_promise && (
                  <div>
                    <dt className="text-slate-500">Promesa</dt>
                    <dd className="text-slate-200 mt-0.5">{experiment.main_promise}</dd>
                  </div>
                )}
                {experiment.main_cta && (
                  <div>
                    <dt className="text-slate-500">Acción</dt>
                    <dd className="text-slate-200 mt-0.5">{experiment.main_cta}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Ver Landing button - Hidden from UI (surface_type logic removed) */}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && experiment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isDeleting && setIsDeleteModalOpen(false)}
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
                ¿Estás seguro de que quieres eliminar <span className="font-medium text-slate-100">&ldquo;{experiment.title}&rdquo;</span>?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium hover:border-slate-500 hover:text-slate-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteExperiment}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
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

      {/* Mover Proyecto Modal */}
      {moverModal.isOpen && experiment && (
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
                    {experiment.title}
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
                        disabled={isMarkingProgress}
                        className="flex-1 px-5 py-3 rounded-xl bg-indigo-500 text-white font-medium hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isMarkingProgress ? (
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
                        disabled={isMarkingProgress}
                        className="flex-1 px-5 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isMarkingProgress ? (
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
                      disabled={isMarkingProgress}
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

      {/* Messages Bank Modal */}
      <MessagesBankModal
        isOpen={isMessagesBankOpen}
        onClose={() => setIsMessagesBankOpen(false)}
        actions={actions}
        actionsByChannel={actionsByChannel}
        onCopyContent={handleCopyContent}
        onMarkDone={handleMarkDone}
        onGenerateMore={handleGenerateMore}
        generatingChannel={generatingChannel}
        copiedId={copiedId}
        actionsError={actionsError}
      />

      {/* Step Detail Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeStepDetail}
          />

          {/* Modal */}
          <div className="relative bg-slate-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl border border-slate-700/50 flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-700/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      selectedStep.status === "done"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {selectedStep.status === "done" ? "Completado" : "Pendiente"}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {selectedStep.step_title}
                  </h3>
                </div>
                <button
                  onClick={closeStepDetail}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Step Description */}
              {selectedStep.step_description && (
                <div className="bg-slate-700/30 rounded-xl p-4">
                  <p className="text-sm text-slate-400 mb-1">Descripción</p>
                  <p className="text-slate-200">{selectedStep.step_description}</p>
                </div>
              )}

              {/* User Content Textarea */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Tus notas o borrador
                </label>
                <textarea
                  value={stepUserContent}
                  onChange={(e) => setStepUserContent(e.target.value)}
                  placeholder="Escribe aquí tu contenido, notas o borrador para este paso..."
                  className="w-full h-40 px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                />
              </div>

              {/* Generate Ideas Button */}
              <button
                onClick={handleGenerateIdeas}
                disabled={isGeneratingIdeas}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-purple-300 hover:from-purple-600/30 hover:to-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGeneratingIdeas ? (
                  <>
                    <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                    <span>Generando borrador...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>Generar borrador con Vicu</span>
                  </>
                )}
              </button>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-700/50 bg-slate-800/50">
              <div className="flex gap-3">
                <button
                  onClick={closeStepDetail}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveStepContent}
                  disabled={isSavingStepContent}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingStepContent ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Step Confirmation Modal */}
      {stepToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !isDeletingStep && setStepToDelete(null)}
          />

          {/* Modal */}
          <div className="relative bg-slate-800 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-700/50 overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-0">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white text-center">
                ¿Eliminar este paso?
              </h3>
              <p className="text-sm text-slate-400 text-center mt-2">
                {stepToDelete.step_title || "Avance registrado"}
              </p>
              <p className="text-xs text-slate-500 text-center mt-1">
                Esta acción no afectará otros datos del proyecto.
              </p>
            </div>

            {/* Actions */}
            <div className="p-5 flex gap-3">
              <button
                onClick={() => setStepToDelete(null)}
                disabled={isDeletingStep}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteStep}
                disabled={isDeletingStep}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingStep ? (
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
      )}
    </div>
  );
}
