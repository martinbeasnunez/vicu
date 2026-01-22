"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useExperimentStore } from "@/lib/experiment-store";
import { AuthGuard } from "@/components/auth-guard";
import WhatsAppOnboardingModal from "@/components/WhatsAppOnboardingModal";
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
import LoadingScreen from "@/components/LoadingScreen";
import PedirAyudaModal from "@/components/PedirAyudaModal";
import PedirAyudaStepModal from "@/components/PedirAyudaStepModal";
import CrearPasoConAyudaModal from "@/components/CrearPasoConAyudaModal";
import { ActionAssignment } from "@/components/AssignmentBadge";
import { StepAssignment } from "@/app/api/step-assignments/route";
import type { CurrentState, EffortLevel, NextStepResponse } from "@/app/api/next-step/route";
import type { VicuRecommendationData, ExperimentStage } from "@/app/api/generate-recommendation/route";

// Helper component to render text with clickable links
function LinkifiedText({ text }: { text: string }) {
  // Match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0;
          const isYouTube = part.includes("youtube.com") || part.includes("youtu.be");
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 ${isYouTube ? "text-red-400 hover:text-red-300" : "text-indigo-400 hover:text-indigo-300"} underline underline-offset-2 transition-colors`}
            >
              {isYouTube ? (
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )}
              {isYouTube ? "Buscar en YouTube" : "Abrir enlace"}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

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
    label: "No he empezado",
    icon: "🚀",
    description: "Procrastinando, sin claridad, o no sé por dónde empezar",
  },
  {
    value: "stuck",
    label: "Me trabé",
    icon: "🤔",
    description: "Overthinking, perfeccionismo, o perdí el momentum",
  },
  {
    value: "going_well",
    label: "Voy bien",
    icon: "💪",
    description: "Tengo ritmo y quiero el siguiente paso",
  },
];

// Effort labels
const EFFORT_LABELS: Record<EffortLevel, { text: string; color: string }> = {
  muy_pequeno: { text: "~5 min", color: "text-emerald-400" },
  pequeno: { text: "~20 min", color: "text-amber-400" },
  medio: { text: "~1 hora", color: "text-orange-400" },
};

// Phase type for project breakdown
interface ObjectivePhase {
  id: string;
  name: string;
  description: string;
  exit_criteria: string;
}

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
  // Project phases
  phases: ObjectivePhase[] | null;
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

// Type for individual user note
interface UserNote {
  id: string;
  content: string;
  created_at: string;
  fromVicu?: boolean; // true if this note was generated by Vicu
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
  user_notes: UserNote[];
  for_stage: ExperimentStage | null;
}

// Status badge colors for dark theme - MVP cycle states
const STATUS_BADGE_COLORS: Record<ExperimentStatus, string> = {
  queued: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  building: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  testing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  adjusting: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  achieved: "bg-green-500/20 text-green-400 border-green-500/30",
  paused: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  discarded: "bg-red-500/20 text-red-400 border-red-500/30",
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
    case "queued": // Por empezar
      return {
        title: "Por empezar",
        description: "Define qué vas a construir y prepárate para dar el primer paso.",
      };
    case "building": // Construyendo
      return {
        title: "Construyendo tu MVP",
        description: "Crea la primera versión mínima. No busques perfección, busca algo funcional.",
      };
    case "testing": // Probando
      return {
        title: "Probando en el mundo real",
        description: "Ya lanzaste algo. Ahora observa qué pasa y recoge feedback.",
      };
    case "adjusting": // Ajustando
      return {
        title: "Ajustando basado en datos",
        description: "Tienes feedback. Haz cambios específicos y prepara la siguiente prueba.",
      };
    case "paused": // Pausado
      return {
        title: "Pausado",
        description: "Este objetivo está pausado. Cuando quieras retomarlo, Vicu te ayuda.",
      };
    case "achieved": // Logrado
      return {
        title: "Objetivo logrado",
        description: "¡Felicitaciones! Completaste este objetivo.",
      };
    case "discarded": // Descartado
      return {
        title: "Descartado",
        description: "Este objetivo fue descartado. Puedes crear uno nuevo cuando quieras.",
      };
    default:
      return {
        title: "Hoy con este proyecto",
        description: "Vicu te ayuda a dar el siguiente paso sin soltar tu objetivo.",
      };
  }
}

// Helper to build next step suggestion based on stage and optional next focus
function buildNextStepFromStage(status: ExperimentStatus, nextFocus?: string | null): {
  title: string;
  description: string;
  estimatedMinutes: number;
} {
  const base = nextFocus?.trim() || "";

  switch (status) {
    case "queued": // Por empezar
      return {
        title: "Define qué vas a construir primero",
        description: base || "Clarifica el objetivo y elige el primer paso más pequeño.",
        estimatedMinutes: 10,
      };
    case "building": // Construyendo
      return {
        title: "Construye la primera versión",
        description: base || "Crea algo mínimo y funcional. No busques perfección.",
        estimatedMinutes: 20,
      };
    case "testing": // Probando
      return {
        title: "Prueba y recoge feedback",
        description: base || "Lanza lo que tienes y observa qué pasa. Mide resultados.",
        estimatedMinutes: 15,
      };
    case "adjusting": // Ajustando
      return {
        title: "Ajusta basado en lo que aprendiste",
        description: base || "Analiza el feedback y haz cambios específicos.",
        estimatedMinutes: 20,
      };
    case "paused":
      return {
        title: "Retoma cuando estés listo",
        description: base || "Este objetivo está pausado. Cuando quieras volver, empieza con algo pequeño.",
        estimatedMinutes: 5,
      };
    case "achieved":
      return {
        title: "Objetivo logrado",
        description: base || "¡Completaste este objetivo! Crea uno nuevo cuando quieras.",
        estimatedMinutes: 0,
      };
    case "discarded":
      return {
        title: "Objetivo descartado",
        description: base || "Este objetivo fue descartado. Crea uno nuevo si quieres empezar algo diferente.",
        estimatedMinutes: 0,
      };
    default:
      return {
        title: "Define tu siguiente paso",
        description: base || "Elige una acción pequeña y concreta para seguir avanzando.",
        estimatedMinutes: 10,
      };
  }
}

// Stage labels for recommendation history - MVP cycle states
const STAGE_LABELS: Record<ExperimentStage, string> = {
  queued: "Por empezar",
  building: "Construyendo",
  testing: "Probando",
  adjusting: "Ajustando",
  achieved: "Logrado",
  paused: "Pausado",
  discarded: "Descartado",
};

// State machine: determines next stage transition based on current stage and recommendation action
interface StageTransition {
  nextStage: ExperimentStage;
  label: string;
  emoji: string;
  buttonColor: string;
}

// Map recommendation actions to their target stages
const ACTION_TO_STAGE: Record<string, ExperimentStage> = {
  seguir_construyendo: "building",
  probar: "testing",
  ajustar: "adjusting",
  logrado: "achieved",
  pausar: "paused",
  descartar: "discarded",
};

// Valid forward transitions in the MVP cycle
const VALID_TRANSITIONS: Record<ExperimentStage, ExperimentStage[]> = {
  queued: ["building", "paused", "discarded"],
  building: ["testing", "paused", "discarded"],
  testing: ["adjusting", "achieved", "paused", "discarded"],
  adjusting: ["achieved", "testing", "paused", "discarded"], // Can go back to testing or forward to achieved
  achieved: [],
  paused: ["building", "testing", "adjusting", "discarded"], // Resume to any active state
  discarded: [],
};

// Default next stage in the MVP cycle (when plan is complete)
const DEFAULT_NEXT_STAGE: Record<ExperimentStage, ExperimentStage | null> = {
  queued: "building",
  building: "testing",
  testing: "adjusting",
  adjusting: "achieved",
  achieved: null,
  paused: "building",
  discarded: null,
};

const STAGE_EMOJIS: Record<ExperimentStage, string> = {
  queued: "📋",
  building: "🔨",
  testing: "🧪",
  adjusting: "🔄",
  achieved: "🎉",
  paused: "⏸️",
  discarded: "🗑️",
};

const STAGE_COLORS: Record<ExperimentStage, string> = {
  queued: "bg-slate-500 hover:bg-slate-400",
  building: "bg-blue-500 hover:bg-blue-400",
  testing: "bg-purple-500 hover:bg-purple-400",
  adjusting: "bg-amber-500 hover:bg-amber-400",
  achieved: "bg-green-500 hover:bg-green-400",
  paused: "bg-zinc-500 hover:bg-zinc-400",
  discarded: "bg-red-500 hover:bg-red-400",
};

function getRecommendationAction(
  currentStage: ExperimentStage,
  stageProgress: { isComplete: boolean },
  recommendationAction?: string
): StageTransition | null {
  // No transitions for finished states
  if (currentStage === "achieved" || currentStage === "discarded") {
    return null;
  }

  // Only show transition when plan is complete
  if (!stageProgress.isComplete) {
    return null;
  }

  // If we have a recommendation action, check if it's a valid transition
  if (recommendationAction && ACTION_TO_STAGE[recommendationAction]) {
    const nextStage = ACTION_TO_STAGE[recommendationAction];

    // Don't transition to the same stage
    if (nextStage === currentStage) {
      // "seguir_construyendo" means keep working, use default progression
      // Fall through to default logic below
    }
    // Check if this is a valid transition
    else if (VALID_TRANSITIONS[currentStage]?.includes(nextStage)) {
      return {
        nextStage,
        label: `Aceptar: Cambiar a ${STAGE_LABELS[nextStage]}`,
        emoji: STAGE_EMOJIS[nextStage],
        buttonColor: STAGE_COLORS[nextStage],
      };
    }
    // Invalid transition (e.g., adjusting -> building), fall through to default
  }

  // Default MVP cycle progression
  const defaultNext = DEFAULT_NEXT_STAGE[currentStage];
  if (!defaultNext) {
    return null;
  }

  const isResume = currentStage === "paused";
  return {
    nextStage: defaultNext,
    label: isResume
      ? `Retomar: Cambiar a ${STAGE_LABELS[defaultNext]}`
      : `Aceptar: Cambiar a ${STAGE_LABELS[defaultNext]}`,
    emoji: STAGE_EMOJIS[defaultNext],
    buttonColor: STAGE_COLORS[defaultNext],
  };
}

// Fallback description for steps without one
const DESCRIPTION_FALLBACK = "Describe brevemente qué harás en este paso para acercarte a tu objetivo.";

function ensureStepDescription(description: string | null | undefined, title?: string | null): string {
  if (description && description.trim().length > 0) {
    return description.trim();
  }
  if (title && title.trim().length > 0) {
    return `Acción: ${title.trim()}`;
  }
  return DESCRIPTION_FALLBACK;
}

function ExperimentPageContent() {
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
  const [toastType, setToastType] = useState<"default" | "vicu-working" | "vicu-success">("default");
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

  // Objetivo collapsed state - collapsed by default
  const [isObjectiveExpanded, setIsObjectiveExpanded] = useState(false);

  // Plan colapsable state
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);

  // Brief collapsable state (inside Objetivo)
  const [isBriefExpanded, setIsBriefExpanded] = useState(false);

  // Messages bank modal state
  const [isMessagesBankOpen, setIsMessagesBankOpen] = useState(false);

  // Pedir ayuda (assignments) state
  const [assignmentsByAction, setAssignmentsByAction] = useState<Record<string, ActionAssignment[]>>({});
  const [pedirAyudaAction, setPedirAyudaAction] = useState<ExperimentAction | null>(null);

  // Pedir ayuda para pasos (step assignments) state
  const [stepAssignmentsByCheckin, setStepAssignmentsByCheckin] = useState<Record<string, StepAssignment[]>>({});
  const [pedirAyudaCheckin, setPedirAyudaCheckin] = useState<ExperimentCheckin | null>(null);
  const [showCrearPasoModal, setShowCrearPasoModal] = useState(false);

  // Step detail modal state
  const [selectedStep, setSelectedStep] = useState<ExperimentCheckin | null>(null);
  const [stepUserNotes, setStepUserNotes] = useState<UserNote[]>([]);
  const [newNoteInput, setNewNoteInput] = useState("");
  const [stepSaveStatus, setStepSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [vicuSuggestion, setVicuSuggestion] = useState<string | null>(null);
  const [savedVicuSuggestions, setSavedVicuSuggestions] = useState<string[]>([]); // Legacy, keeping for backwards compat
  const [isVicuHelpExpanded, setIsVicuHelpExpanded] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Mini-chat state for step help
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Delete step confirmation modal state
  const [stepToDelete, setStepToDelete] = useState<ExperimentCheckin | null>(null);
  const [isDeletingStep, setIsDeletingStep] = useState(false);

  // Regenerate steps state
  const [isRegeneratingSteps, setIsRegeneratingSteps] = useState(false);

  // Vicu recommendation state
  const [vicuRecommendation, setVicuRecommendation] = useState<VicuRecommendationData | null>(null);
  const [vicuRecommendationHistory, setVicuRecommendationHistory] = useState<VicuRecommendationData[]>([]);
  const [isLoadingRecommendation, setIsLoadingRecommendation] = useState(false);
  const [hasAcceptedRecommendation, setHasAcceptedRecommendation] = useState(false);
  const [acceptedStatus, setAcceptedStatus] = useState<ExperimentStatus | null>(null);
  const [lastRecommendationStage, setLastRecommendationStage] = useState<ExperimentStage | null>(null);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [newStepsGenerated, setNewStepsGenerated] = useState<number>(0); // Track when new steps are generated
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "updating" | "generating_steps" | "generating_recommendation">("idle");

  // Mover proyecto modal state (kept for compatibility)
  const [moverModal, setMoverModal] = useState<MoverModalState>({
    isOpen: false,
    step: "select_state",
    selectedState: null,
    nextStep: null,
  });

  // WhatsApp onboarding modal state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [hasCheckedWhatsApp, setHasCheckedWhatsApp] = useState(false);

  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.status === "done").length;

  // Checkins-based progress (for "Progreso del plan")
  // Filter by current stage if available, otherwise show all
  const currentStage = experiment?.status as ExperimentStage | undefined;
  const currentStageCheckins = useMemo(() => {
    if (!currentStage) return checkins;
    // Include steps that either match current stage or have no stage (legacy steps)
    return checkins.filter((c) => !c.for_stage || c.for_stage === currentStage);
  }, [checkins, currentStage]);

  const totalSteps = currentStageCheckins.length;
  const completedSteps = currentStageCheckins.filter((c) => c.status === "done").length;
  const pendingSteps = currentStageCheckins.filter((c) => c.status === "pending").length;

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

      // Insert check-in record (ensure description is never empty)
      const checkinRecord = {
        experiment_id: experiment.id,
        status: "done",
        user_state: checkinData?.userState || null,
        step_title: checkinData?.stepTitle || null,
        step_description: checkinData?.stepDescription
          ? ensureStepDescription(checkinData.stepDescription, checkinData.stepTitle)
          : null,
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
        step_description: ensureStepDescription(inlineNextStep.next_step_description, inlineNextStep.next_step_title),
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

      // Note: When all steps are completed, the Vicu recommendation card will appear
      // allowing the user to click "Aceptar: Cambiar a En marcha" to transition
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

  // Regenerate steps handler - for when AI hallucinated or objective changed
  const handleRegenerateSteps = async () => {
    if (!experiment || isRegeneratingSteps) return;
    setIsRegeneratingSteps(true);

    // Show animated Vicu working toast
    setToastType("vicu-working");
    setToast("Regenerando pasos...");

    try {
      const res = await fetch("/api/regenerate-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experiment.id,
          for_stage: experiment.status,
        }),
      });

      const data = await res.json();
      if (data.success && data.steps) {
        await fetchCheckins();
        setToastType("vicu-success");
        setToast(`${data.steps.length} pasos nuevos`);
      } else {
        setToastType("default");
        setToast("Error al regenerar pasos");
      }
    } catch (error) {
      console.error("Error regenerating steps:", error);
      setToastType("default");
      setToast("Error al regenerar pasos");
    } finally {
      setIsRegeneratingSteps(false);
      setTimeout(() => {
        setToast(null);
        setToastType("default");
      }, 3000);
    }
  };

  // Step detail modal handlers
  const openStepDetail = (step: ExperimentCheckin) => {
    setSelectedStep(step);
    setStepUserNotes(step.user_notes || []);
    setNewNoteInput("");
  };

  const closeStepDetail = () => {
    setSelectedStep(null);
    setStepUserNotes([]);
    setNewNoteInput("");
    setVicuSuggestion(null);
    setSavedVicuSuggestions([]);
    setIsVicuHelpExpanded(false);
    setStepSaveStatus("idle");
    // Clear chat state
    setChatMessages([]);
    setChatInput("");
    setIsChatOpen(false);
  };

  // Save notes to database
  const handleSaveNotes = async (notes: UserNote[]) => {
    if (!selectedStep) return;
    setStepSaveStatus("saving");

    try {
      const { error } = await supabase
        .from("experiment_checkins")
        .update({ user_notes: notes })
        .eq("id", selectedStep.id);

      if (error) throw error;

      // Update local state
      setCheckins((prev) =>
        prev.map((c) =>
          c.id === selectedStep.id ? { ...c, user_notes: notes } : c
        )
      );
      setSelectedStep((prev) =>
        prev ? { ...prev, user_notes: notes } : null
      );
      setStepSaveStatus("saved");
      setTimeout(() => setStepSaveStatus("idle"), 2000);
    } catch {
      setStepSaveStatus("idle");
      setToast("Error al guardar");
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Add a new note
  const handleAddNote = async () => {
    if (!selectedStep || !newNoteInput.trim()) return;

    const newNote: UserNote = {
      id: crypto.randomUUID(),
      content: newNoteInput.trim(),
      created_at: new Date().toISOString(),
    };

    const updatedNotes = [...stepUserNotes, newNote];
    setStepUserNotes(updatedNotes);
    setNewNoteInput("");
    await handleSaveNotes(updatedNotes);
  };

  // Delete a note
  const handleDeleteNote = async (noteId: string) => {
    if (!selectedStep) return;

    const updatedNotes = stepUserNotes.filter((n) => n.id !== noteId);
    setStepUserNotes(updatedNotes);
    await handleSaveNotes(updatedNotes);
  };

  const handleGenerateIdeas = async () => {
    if (!selectedStep || !experiment) return;
    setIsGeneratingIdeas(true);
    setIsVicuHelpExpanded(true);

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
        // Store suggestion separately - NEVER overwrite user notes
        setVicuSuggestion(data.content);
      } else {
        setToast("No se pudo generar ideas");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Error al generar ideas");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // Send message to Vicu mini-chat
  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || !selectedStep || !experiment || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/step-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectTitle: experiment.title,
          projectDescription: experiment.description,
          stepTitle: selectedStep.step_title,
          stepDescription: selectedStep.step_description,
          currentSuggestion: vicuSuggestion,
          userNotes: stepUserNotes.map((n) => n.content),
          messages: chatMessages,
          userMessage,
        }),
      });

      const data = await res.json();
      if (data.success && data.content) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      } else {
        setToast("No se pudo obtener respuesta");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Error al enviar mensaje");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Copy Vicu suggestion to clipboard
  const handleCopySuggestion = async () => {
    if (!vicuSuggestion) return;
    try {
      await navigator.clipboard.writeText(vicuSuggestion);
      setToast("Copiado al portapapeles");
      setTimeout(() => setToast(null), 2000);
    } catch {
      setToast("Error al copiar");
      setTimeout(() => setToast(null), 2000);
    }
  };

  // Save current Vicu suggestion as a note (with fromVicu flag)
  const handleSaveSuggestion = async () => {
    if (!vicuSuggestion || !selectedStep) return;

    const newNote: UserNote = {
      id: crypto.randomUUID(),
      content: vicuSuggestion,
      created_at: new Date().toISOString(),
      fromVicu: true,
    };

    const updatedNotes = [...stepUserNotes, newNote];
    setStepUserNotes(updatedNotes);
    setVicuSuggestion(null);
    await handleSaveNotes(updatedNotes);
    setToast("Idea guardada en notas");
    setTimeout(() => setToast(null), 2000);
  };

  // Delete a saved Vicu suggestion
  const handleDeleteSavedSuggestion = (index: number) => {
    setSavedVicuSuggestions((prev) => prev.filter((_, i) => i !== index));
  };

  // Handler to generate Vicu recommendation
  const handleGenerateRecommendation = async (forceNew = false, previousNextFocus?: string) => {
    if (!experiment || isLoadingRecommendation) return;
    setIsLoadingRecommendation(true);

    try {
      const res = await fetch("/api/generate-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experiment.id,
          force_new: forceNew,
          previous_next_focus: previousNextFocus,
        }),
      });

      const data = await res.json();
      if (data.success && data.recommendation) {
        setVicuRecommendation(data.recommendation);
        setLastRecommendationStage(experiment.status as ExperimentStage);
        // Reset accepted state for new recommendations
        if (forceNew) {
          setHasAcceptedRecommendation(false);
          setAcceptedStatus(null);
        }
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

  // Map recommendation action to experiment status - MVP cycle actions
  const mapRecommendationToStatus = (action: string): ExperimentStatus => {
    switch (action.toLowerCase()) {
      case "seguir_construyendo":
        return "building";
      case "probar":
        return "testing";
      case "ajustar":
        return "adjusting";
      case "logrado":
        return "achieved";
      case "pausar":
        return "paused";
      case "descartar":
        return "discarded";
      default:
        return "building"; // default to "Construyendo"
    }
  };

  // Handler to accept stage transition using state machine
  const handleAcceptStageTransition = async (transition: StageTransition) => {
    if (!experiment || isStatusUpdating || hasAcceptedRecommendation) return;

    const newStatus = transition.nextStage;
    const previousNextFocus = vicuRecommendation?.suggested_next_focus;

    setIsStatusUpdating(true);
    setTransitionPhase("updating");
    try {
      const { error } = await supabase
        .from("experiments")
        .update({ status: newStatus })
        .eq("id", experiment.id);

      if (error) throw error;

      // Move current recommendation to history before clearing
      if (vicuRecommendation) {
        setVicuRecommendationHistory((prev) => [...prev, vicuRecommendation]);
      }

      // Update local experiment state FIRST so recommendation API uses new stage
      const updatedExperiment = { ...experiment, status: newStatus };
      setExperiment(updatedExperiment);
      setToast(`Estado cambiado a ${STATUS_LABELS[newStatus]}`);

      // Generate new steps for the new stage (except for finished states)
      if (newStatus !== "achieved" && newStatus !== "discarded") {
        setTransitionPhase("generating_steps");
        const stepsDescription = previousNextFocus || `Pasos para la etapa ${STAGE_LABELS[newStatus]}`;
        try {
          const stepsRes = await fetch("/api/generate-initial-steps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              experiment_id: experiment.id,
              title: experiment.title,
              description: stepsDescription,
              experiment_type: experiment.experiment_type,
              surface_type: experiment.surface_type,
              for_stage: newStatus,
            }),
          });
          const stepsData = await stepsRes.json();
          // Refresh checkins to show new steps
          await fetchCheckins();
          // Track that new steps were generated
          if (stepsData.count) {
            setNewStepsGenerated(stepsData.count);
            // Clear the indicator after 5 seconds
            setTimeout(() => setNewStepsGenerated(0), 5000);
          }
        } catch (err) {
          console.error("Error generating stage steps:", err);
        }

        // Generate NEW recommendation for the new stage
        setTransitionPhase("generating_recommendation");
        setIsLoadingRecommendation(true);
        try {
          const res = await fetch("/api/generate-recommendation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              experiment_id: experiment.id,
              force_new: true,
              previous_next_focus: previousNextFocus,
            }),
          });

          const data = await res.json();
          if (data.success && data.recommendation) {
            setVicuRecommendation(data.recommendation);
            setLastRecommendationStage(newStatus as ExperimentStage);
            // Reset accepted state for new recommendation - ready for next cycle
            setHasAcceptedRecommendation(false);
            setAcceptedStatus(null);
          } else {
            // If recommendation fails, still clear state for fresh start
            setVicuRecommendation(null);
            setHasAcceptedRecommendation(false);
            setAcceptedStatus(null);
          }
        } catch (err) {
          console.error("Error generating stage recommendation:", err);
          setVicuRecommendation(null);
          setHasAcceptedRecommendation(false);
          setAcceptedStatus(null);
        } finally {
          setIsLoadingRecommendation(false);
        }
      } else {
        // For finished states (achieved/discarded), just mark as accepted without generating new recommendation
        setHasAcceptedRecommendation(true);
        setAcceptedStatus(newStatus);
        setVicuRecommendation(null);
      }
    } catch {
      setToast("Error al actualizar estado");
    } finally {
      setIsStatusUpdating(false);
      setTransitionPhase("idle");
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Legacy handler for AI-based recommendations (deprecated, kept for compatibility)
  const handleAcceptRecommendation = async () => {
    if (!experiment || !vicuRecommendation || isStatusUpdating || hasAcceptedRecommendation) return;

    const currentStage = experiment.status as ExperimentStage;
    const transition = getRecommendationAction(currentStage, { isComplete: true }, vicuRecommendation.action);

    if (transition) {
      await handleAcceptStageTransition(transition);
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

      // Show animated Vicu working toast
      setToastType("vicu-working");
      setToast("Regenerando pasos...");

      // Auto-regenerate steps when objective changes
      try {
        const res = await fetch("/api/regenerate-steps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experiment_id: experiment.id,
            for_stage: experiment.status,
          }),
        });
        const data = await res.json();
        if (data.success) {
          await fetchCheckins();
          setToastType("vicu-success");
          setToast("Pasos actualizados");
        }
      } catch (regenErr) {
        console.error("Error regenerating steps:", regenErr);
        setToastType("default");
        setToast("Objetivo guardado");
      }
    } catch {
      setToastType("default");
      setToast("Error al guardar objetivo");
    } finally {
      setIsSavingObjective(false);
      setTimeout(() => {
        setToast(null);
        setToastType("default");
      }, 3000);
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

  // Fetch assignments for all actions
  const fetchAssignments = useCallback(async () => {
    if (actions.length === 0) return;
    try {
      const actionIds = actions.map(a => a.id);
      const { data: assignmentsData, error } = await supabase
        .from("action_assignments")
        .select("id, action_id, helper_name, status, responded_at")
        .in("action_id", actionIds);
      if (error) {
        console.warn("Could not fetch assignments:", error.message);
        return;
      }
      if (assignmentsData) {
        // Group by action_id
        const grouped: Record<string, ActionAssignment[]> = {};
        assignmentsData.forEach((a) => {
          if (!grouped[a.action_id]) grouped[a.action_id] = [];
          grouped[a.action_id].push({
            id: a.id,
            helper_name: a.helper_name,
            status: a.status,
            responded_at: a.responded_at,
          });
        });
        setAssignmentsByAction(grouped);
      }
    } catch (err) {
      console.warn("Error fetching assignments:", err);
    }
  }, [actions]);

  // Fetch step assignments for all checkins
  const fetchStepAssignments = useCallback(async () => {
    if (checkins.length === 0) return;
    try {
      const checkinIds = checkins.map(c => c.id);
      const { data: assignmentsData, error } = await supabase
        .from("step_assignments")
        .select("id, checkin_id, helper_name, status, responded_at")
        .in("checkin_id", checkinIds);
      if (error) {
        console.warn("Could not fetch step assignments:", error.message);
        return;
      }
      if (assignmentsData) {
        // Group by checkin_id
        const grouped: Record<string, StepAssignment[]> = {};
        assignmentsData.forEach((a) => {
          if (!grouped[a.checkin_id]) grouped[a.checkin_id] = [];
          grouped[a.checkin_id].push(a as StepAssignment);
        });
        setStepAssignmentsByCheckin(grouped);
      }
    } catch (err) {
      console.warn("Error fetching step assignments:", err);
    }
  }, [checkins]);

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
        // Track the stage this recommendation was generated for
        const rec = expData.vicu_recommendation as VicuRecommendationData;
        if (rec.for_stage) {
          setLastRecommendationStage(rec.for_stage);
        }
      }
      // Load recommendation history if present
      if (expData.vicu_recommendation_history && Array.isArray(expData.vicu_recommendation_history)) {
        setVicuRecommendationHistory(expData.vicu_recommendation_history as VicuRecommendationData[]);
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

  // Fetch assignments when actions change
  useEffect(() => {
    if (actions.length > 0) {
      fetchAssignments();
    }
  }, [actions, fetchAssignments]);

  // Fetch step assignments when checkins change
  useEffect(() => {
    if (checkins.length > 0) {
      fetchStepAssignments();
    }
  }, [checkins, fetchStepAssignments]);

  // Check if user has WhatsApp configured - show modal if not
  useEffect(() => {
    if (loading || hasCheckedWhatsApp) return;

    async function checkWhatsApp() {
      try {
        const res = await fetch("/api/whatsapp/config");
        const data = await res.json();
        setHasCheckedWhatsApp(true);

        // Show modal if user doesn't have WhatsApp configured
        if (data.success && !data.is_active) {
          // Small delay to let the page render first
          setTimeout(() => setShowWhatsAppModal(true), 1500);
        }
      } catch {
        setHasCheckedWhatsApp(true);
      }
    }

    checkWhatsApp();
  }, [loading, hasCheckedWhatsApp]);

  useEffect(() => {
    if (!loading && actions.length === 0 && !actionsError) {
      const interval = setInterval(fetchActions, 3000);
      return () => clearInterval(interval);
    }
  }, [loading, actions.length, actionsError, fetchActions]);

  // Auto-trigger new recommendation when stage changes AND all steps of the stage are completed
  // This effect watches for: stage change + plan completion + recommendation not yet generated for this stage
  useEffect(() => {
    if (!experiment || loading || isLoadingRecommendation) return;

    const currentStage = experiment.status as ExperimentStage;
    const allStepsCompleted = totalSteps > 0 && completedSteps === totalSteps;

    // Check if we need a new recommendation:
    // 1. All steps are completed
    // 2. Either no recommendation exists, OR the existing recommendation is for a different stage
    const needsNewRecommendation =
      allStepsCompleted &&
      (!vicuRecommendation ||
        (vicuRecommendation.for_stage && vicuRecommendation.for_stage !== currentStage));

    // Only auto-generate if we haven't already generated for this stage
    if (needsNewRecommendation && lastRecommendationStage !== currentStage) {
      // Get the previous recommendation's next focus to use as context
      const previousNextFocus = vicuRecommendation?.suggested_next_focus;
      handleGenerateRecommendation(true, previousNextFocus);
    }
  }, [experiment?.status, totalSteps, completedSteps, loading]);

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

  // Handler for when a help request is successfully created
  const handleAssignmentCreated = (assignment: { id: string; helper_name: string; status: string; public_url: string }) => {
    if (!pedirAyudaAction) return;
    // Add the new assignment to the local state
    setAssignmentsByAction((prev) => ({
      ...prev,
      [pedirAyudaAction.id]: [
        ...(prev[pedirAyudaAction.id] || []),
        {
          id: assignment.id,
          helper_name: assignment.helper_name,
          status: assignment.status as "pending" | "completed" | "declined" | "expired",
          responded_at: null,
        },
      ],
    }));
    // Copy the public URL to clipboard
    navigator.clipboard.writeText(assignment.public_url);
    setToast(`Link copiado. Envíalo a ${assignment.helper_name}`);
    setTimeout(() => setToast(null), 4000);
  };

  // Handler for when a step help request is successfully created
  const handleStepAssignmentCreated = (assignment: { id: string; helper_name: string; status: string; public_url: string }) => {
    if (!pedirAyudaCheckin) return;
    // Add the new assignment to the local state
    setStepAssignmentsByCheckin((prev) => ({
      ...prev,
      [pedirAyudaCheckin.id]: [
        ...(prev[pedirAyudaCheckin.id] || []),
        {
          id: assignment.id,
          checkin_id: pedirAyudaCheckin.id,
          helper_name: assignment.helper_name,
          status: assignment.status as "pending" | "completed" | "declined" | "expired",
          responded_at: null,
        } as StepAssignment,
      ],
    }));
    // Copy the public URL to clipboard
    navigator.clipboard.writeText(assignment.public_url);
    setToast(`Link copiado. Envíalo a ${assignment.helper_name}`);
    setTimeout(() => setToast(null), 4000);
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
    return <LoadingScreen />;
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
      {/* Toast - with Vicu logo animation for special states */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-sm z-50 px-4 py-3 sm:px-5 rounded-2xl shadow-2xl animate-fade-in-down flex items-center gap-3 ${
          toastType === "vicu-working" || toastType === "vicu-success"
            ? "bg-gradient-to-r from-indigo-600/95 to-purple-600/95 backdrop-blur-md border border-indigo-400/30"
            : "card-glass"
        }`}>
          {(toastType === "vicu-working" || toastType === "vicu-success") && (
            <div className="relative w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 flex items-center justify-center">
              {/* Vicu logo */}
              <Image
                src="/vicu-logo.png"
                alt="Vicu"
                width={32}
                height={32}
                className={`w-7 h-7 sm:w-8 sm:h-8 ${toastType === "vicu-working" ? "animate-bounce" : "animate-scale-in"}`}
              />
              {/* Spinning ring around logo when working */}
              {toastType === "vicu-working" && (
                <div className="absolute inset-0 w-9 h-9 sm:w-10 sm:h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              {/* Success checkmark overlay */}
              {toastType === "vicu-success" && (
                <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 rounded-full flex items-center justify-center animate-scale-in shadow-lg">
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          )}
          <span className={`font-medium text-sm sm:text-base ${
            toastType === "vicu-working" || toastType === "vicu-success" ? "text-white" : "text-slate-50"
          }`}>
            {toast}
          </span>
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

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-10">
        {/* Header with navigation - Vicu now uses /hoy as main home */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <Link href="/hoy" className="text-xs sm:text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden xs:inline">Volver a</span> Hoy
          </Link>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="text-xs sm:text-sm text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
            title="Eliminar objetivo"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="hidden sm:inline">Eliminar</span>
          </button>
        </div>

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column (2/3) */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Header Card - Surface type (Ritual/Landing/Mensajes) hidden from UI */}
            <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-slate-50 tracking-tight mb-2 sm:mb-3">{experiment.title}</h1>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border ${STATUS_BADGE_COLORS[experiment.status || "testing"]}`}>
                  {STATUS_LABELS[experiment.status || "testing"]}
                </span>
                {deadlineInfo && (
                  <button onClick={openDeadlineModal} className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-white/5 text-slate-400 border border-white/10 hover:border-indigo-500/50 transition-colors flex items-center gap-1">
                    {deadlineInfo.textShort}
                    <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
                {!deadlineInfo && (
                  <button onClick={openDeadlineModal} className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-white/5 text-slate-400 border border-white/10 hover:border-indigo-500/50 transition-colors">
                    + Deadline
                  </button>
                )}
              </div>
            </div>

            {/* Objetivo del proyecto - Collapsible by default, now includes Brief */}
            <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => !isEditingObjective && setIsObjectiveExpanded(!isObjectiveExpanded)}
                  className="flex items-center gap-1.5 sm:gap-2 text-left flex-1 min-w-0"
                >
                  <svg
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 transition-transform duration-200 flex-shrink-0 ${isObjectiveExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 className="text-xs sm:text-sm font-medium text-slate-400 uppercase tracking-wider">Objetivo</h3>
                </button>
                {!isEditingObjective && (
                  <button
                    onClick={() => {
                      setObjectiveInput(experiment.description || "");
                      setIsEditingObjective(true);
                      setIsObjectiveExpanded(true);
                    }}
                    className="text-slate-500 hover:text-indigo-400 transition-colors flex-shrink-0 p-1"
                    title="Editar objetivo"
                  >
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Collapsed preview - show first ~80 chars */}
              {!isObjectiveExpanded && !isEditingObjective && experiment.description && (
                <p className="text-slate-400 text-xs sm:text-sm mt-1.5 sm:mt-2 line-clamp-1">
                  {experiment.description.length > 80
                    ? experiment.description.slice(0, 80) + "..."
                    : experiment.description}
                </p>
              )}

              {/* Expanded view */}
              {(isObjectiveExpanded || isEditingObjective) && (
                <div className="mt-3 space-y-4">
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
                          onClick={() => {
                            setIsEditingObjective(false);
                            setIsObjectiveExpanded(false);
                          }}
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

                  {/* Brief del objetivo - Accordion inside Objetivo */}
                  {!isEditingObjective && (experiment.target_audience || experiment.main_pain || experiment.main_promise || experiment.main_cta) && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <button
                        onClick={() => setIsBriefExpanded(!isBriefExpanded)}
                        className="flex items-center justify-between w-full text-left group"
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isBriefExpanded ? "rotate-90" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="text-sm font-medium text-slate-400">Brief del objetivo</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal();
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Editar
                        </button>
                      </button>

                      {isBriefExpanded && (
                        <dl className="mt-3 space-y-2.5 text-sm pl-5">
                          {experiment.target_audience && (
                            <div className="flex gap-2">
                              <dt className="text-slate-500 flex-shrink-0 w-20">Audiencia</dt>
                              <dd className="text-slate-300">{experiment.target_audience}</dd>
                            </div>
                          )}
                          {experiment.main_pain && (
                            <div className="flex gap-2">
                              <dt className="text-slate-500 flex-shrink-0 w-20">Dolor</dt>
                              <dd className="text-slate-300">{experiment.main_pain}</dd>
                            </div>
                          )}
                          {experiment.main_promise && (
                            <div className="flex gap-2">
                              <dt className="text-slate-500 flex-shrink-0 w-20">Promesa</dt>
                              <dd className="text-slate-300">{experiment.main_promise}</dd>
                            </div>
                          )}
                          {experiment.main_cta && (
                            <div className="flex gap-2">
                              <dt className="text-slate-500 flex-shrink-0 w-20">Acción</dt>
                              <dd className="text-slate-300">{experiment.main_cta}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Progress Card - Moved here, right after Objetivo */}
            {totalSteps > 0 && (
              <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
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

            {/* Fases del proyecto - Shows macro phases */}
            {experiment.phases && experiment.phases.length > 0 && (
              <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Fases del proyecto</h3>
                  <span className="text-xs text-slate-500">
                    Fase actual: <span className="text-indigo-400">{
                      experiment.status === "queued" || experiment.status === "building" ? experiment.phases[0]?.name :
                      experiment.status === "testing" ? experiment.phases[1]?.name || experiment.phases[0]?.name :
                      experiment.status === "adjusting" ? experiment.phases[2]?.name || experiment.phases[1]?.name :
                      experiment.phases[experiment.phases.length - 1]?.name
                    }</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {experiment.phases.map((phase, index) => {
                    // Determine if this phase is current, completed, or pending
                    const isCurrentPhase =
                      ((experiment.status === "queued" || experiment.status === "building") && index === 0) ||
                      (experiment.status === "testing" && index === 1) ||
                      (experiment.status === "adjusting" && index === 2) ||
                      (experiment.status === "achieved" || experiment.status === "discarded" || experiment.status === "paused");
                    const isCompleted =
                      (experiment.status === "testing" && index === 0) ||
                      (experiment.status === "adjusting" && index <= 1) ||
                      ((experiment.status === "achieved" || experiment.status === "discarded" || experiment.status === "paused") && experiment.phases && index < experiment.phases.length - 1);

                    return (
                      <div
                        key={phase.id}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all ${
                          isCurrentPhase
                            ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                            : isCompleted
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-white/5 border-white/10 text-slate-400"
                        }`}
                        title={`${phase.description}\n\nCriterio de salida: ${phase.exit_criteria}`}
                      >
                        <div className="flex items-center gap-2">
                          {isCompleted && (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {isCurrentPhase && !isCompleted && (
                            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                          )}
                          <span className="text-sm font-medium whitespace-nowrap">{phase.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Show current phase details */}
                {(() => {
                  const currentPhaseIndex =
                    (experiment.status === "queued" || experiment.status === "building") ? 0 :
                    experiment.status === "testing" ? 1 :
                    experiment.status === "adjusting" ? 2 :
                    experiment.phases.length - 1;
                  const currentPhase = experiment.phases[currentPhaseIndex];
                  if (!currentPhase) return null;
                  return (
                    <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-sm text-slate-300 leading-relaxed">{currentPhase.description}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        <span className="text-slate-400">Para avanzar:</span> {currentPhase.exit_criteria}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Vicu Recommendation Card - State Machine based */}
            {(() => {
              const currentStage = experiment.status as ExperimentStage;
              const stageProgress = { isComplete: totalSteps > 0 && completedSteps === totalSteps };
              const stageTransition = getRecommendationAction(currentStage, stageProgress, vicuRecommendation?.action);

              // Loading state: show progress card during transition
              if (transitionPhase !== "idle") {
                const targetStage = acceptedStatus || "siguiente etapa";
                return (
                  <div className="card-premium px-3 sm:px-5 py-4 sm:py-5 border-indigo-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-50">Preparando nueva etapa</h3>
                        <p className="text-sm text-slate-400">
                          {transitionPhase === "updating" && "Cambiando estado..."}
                          {transitionPhase === "generating_steps" && "Generando nuevos pasos..."}
                          {transitionPhase === "generating_recommendation" && "Preparando recomendación..."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Progress steps */}
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-2.5">
                            {transitionPhase === "updating" ? (
                              <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                            ) : (
                              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            <span className={`text-sm ${transitionPhase === "updating" ? "text-slate-200" : "text-slate-400"}`}>
                              Cambiando a {typeof targetStage === "string" && STATUS_LABELS[targetStage as ExperimentStage] ? STATUS_LABELS[targetStage as ExperimentStage] : targetStage}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {transitionPhase === "generating_steps" ? (
                              <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                            ) : transitionPhase === "generating_recommendation" ? (
                              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-slate-600" />
                            )}
                            <span className={`text-sm ${transitionPhase === "generating_steps" ? "text-slate-200" : transitionPhase === "generating_recommendation" ? "text-slate-400" : "text-slate-500"}`}>
                              Generando nuevos pasos para esta etapa
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {transitionPhase === "generating_recommendation" ? (
                              <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-slate-600" />
                            )}
                            <span className={`text-sm ${transitionPhase === "generating_recommendation" ? "text-slate-200" : "text-slate-500"}`}>
                              Preparando recomendación de Vicu
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Context message */}
                      <p className="text-xs text-slate-500 text-center">
                        Esto puede tomar unos segundos...
                      </p>
                    </div>
                  </div>
                );
              }

              // Achieved/Discarded state: show summary only
              if (currentStage === "achieved" || currentStage === "discarded") {
                return (
                  <div className="card-premium px-3 sm:px-5 py-4 sm:py-5 border-slate-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/25">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-300">
                          {currentStage === "achieved" ? "Objetivo logrado" : "Objetivo descartado"}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {currentStage === "achieved" ? "Has completado este objetivo" : "Este objetivo fue descartado"}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400">
                      {currentStage === "achieved"
                        ? "¡Felicitaciones! Puedes revisar tu historial de recomendaciones abajo o crear un nuevo objetivo."
                        : "Este objetivo fue descartado. Puedes revisar tu historial o crear un nuevo objetivo."}
                    </p>
                  </div>
                );
              }

              // Paused state: show paused message
              if (currentStage === "paused") {
                return (
                  <div className="card-premium px-3 sm:px-5 py-4 sm:py-5 border-slate-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/25">
                        <span className="text-white text-lg">⏸️</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-300">Objetivo en pausa</h3>
                        <p className="text-sm text-slate-500">Retómalo cuando estés listo</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-400">
                      Este objetivo está pausado. Cuando quieras retomarlo, cambia su estado manualmente.
                    </p>
                  </div>
                );
              }

              // Plan complete + transition available: show transition card
              if (stageTransition) {
                return (
                  <div className="card-premium px-3 sm:px-5 py-4 sm:py-5 border-indigo-500/20">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                        <span className="text-white text-lg font-bold">v</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-50">Recomendación de Vicu</h3>
                        <p className="text-sm text-slate-400">Basada en tu progreso</p>
                      </div>
                    </div>

                    {/* Success banner if just accepted */}
                    {hasAcceptedRecommendation && acceptedStatus && (
                      <div className="mb-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-sm font-medium text-emerald-400">
                            Estado cambiado a {STATUS_LABELS[acceptedStatus]}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Stage transition badge */}
                    <div className="mb-4">
                      <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                        stageTransition.nextStage === "testing" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
                        stageTransition.nextStage === "adjusting" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                        stageTransition.nextStage === "achieved" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                        "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                      }`}>
                        {stageTransition.emoji} {stageTransition.label.replace("Aceptar: ", "")}
                      </span>
                    </div>

                    {/* Completion message */}
                    <h4 className="text-base font-medium text-slate-100 mb-2">
                      ¡Plan de {STAGE_LABELS[currentStage]} completado!
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed mb-4">
                      Has completado {completedSteps} de {totalSteps} pasos de esta etapa.
                      {stageTransition.nextStage === "achieved"
                        ? " ¡Felicitaciones! Es hora de celebrar el logro."
                        : stageTransition.nextStage === "discarded"
                          ? " Este objetivo será descartado."
                          : ` Es hora de avanzar a la siguiente fase: ${STAGE_LABELS[stageTransition.nextStage]}.`
                      }
                    </p>

                    {/* Next stage info - what will happen */}
                    {stageTransition.nextStage !== "achieved" && stageTransition.nextStage !== "discarded" && (
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 mb-4">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">Al aceptar</p>
                        <ul className="space-y-1.5 text-sm text-slate-400">
                          <li className="flex items-start gap-2">
                            <span className="text-emerald-400 mt-0.5">✓</span>
                            El estado cambiará a {STAGE_LABELS[stageTransition.nextStage]}
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-emerald-400 mt-0.5">✓</span>
                            Se generarán nuevos pasos para esta etapa
                          </li>
                        </ul>
                      </div>
                    )}

                    {/* AI recommendation details if available */}
                    {vicuRecommendation && (
                      <>
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

                        {vicuRecommendation.suggested_next_focus && stageTransition.nextStage !== "achieved" && stageTransition.nextStage !== "discarded" && (
                          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-4">
                            <p className="text-xs text-indigo-400 uppercase tracking-wider mb-1 font-medium">Siguiente enfoque</p>
                            <p className="text-sm text-slate-200">{vicuRecommendation.suggested_next_focus}</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Accept transition button */}
                    {!hasAcceptedRecommendation && (
                      <button
                        onClick={() => handleAcceptStageTransition(stageTransition)}
                        disabled={transitionPhase !== "idle"}
                        className={`w-full px-4 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-white active:scale-[0.98] ${
                          transitionPhase !== "idle" ? "opacity-70 cursor-wait" : stageTransition.buttonColor
                        }`}
                      >
                        {transitionPhase !== "idle" ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>
                              {transitionPhase === "updating" && "Cambiando estado..."}
                              {transitionPhase === "generating_steps" && "Generando nuevos pasos..."}
                              {transitionPhase === "generating_recommendation" && "Preparando siguiente etapa..."}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{stageTransition.emoji}</span>
                            <span>{stageTransition.label}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              }

              // Plan in progress: show minimal progress indicator
              if (completedSteps >= 2 && totalSteps > 0) {
                return (
                  <div className="card-premium px-3 sm:px-4 py-2.5 sm:py-3 border-white/5">
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
                );
              }

              // Default: no card shown
              return null;
            })()}

            {/* Recommendation History - Collapsible section */}
            {vicuRecommendationHistory.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${isHistoryExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span>Recomendaciones anteriores ({vicuRecommendationHistory.length})</span>
                </button>

                {isHistoryExpanded && (
                  <div className="mt-3 space-y-3">
                    {[...vicuRecommendationHistory].reverse().map((rec, index) => (
                      <div
                        key={`${rec.generated_at}-${index}`}
                        className="card-glass px-4 py-3 opacity-70"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {/* Stage badge */}
                          {rec.for_stage && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              rec.for_stage === "queued" ? "bg-slate-500/20 text-slate-400" :
                              rec.for_stage === "building" ? "bg-blue-500/20 text-blue-400" :
                              rec.for_stage === "testing" ? "bg-purple-500/20 text-purple-400" :
                              rec.for_stage === "adjusting" ? "bg-amber-500/20 text-amber-400" :
                              rec.for_stage === "achieved" ? "bg-green-500/20 text-green-400" :
                              rec.for_stage === "paused" ? "bg-zinc-500/20 text-zinc-400" :
                              "bg-red-500/20 text-red-400"
                            }`}>
                              {STAGE_LABELS[rec.for_stage]}
                            </span>
                          )}
                          {/* Action badge */}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            rec.action === "seguir_construyendo" ? "bg-blue-500/10 text-blue-400/80" :
                            rec.action === "probar" ? "bg-purple-500/10 text-purple-400/80" :
                            rec.action === "ajustar" ? "bg-amber-500/10 text-amber-400/80" :
                            rec.action === "logrado" ? "bg-green-500/10 text-green-400/80" :
                            rec.action === "pausar" ? "bg-zinc-500/10 text-zinc-400/80" :
                            "bg-red-500/10 text-red-400/80"
                          }`}>
                            {rec.action === "seguir_construyendo" && "Construir"}
                            {rec.action === "probar" && "Probar"}
                            {rec.action === "ajustar" && "Ajustar"}
                            {rec.action === "logrado" && "Logrado"}
                            {rec.action === "pausar" && "Pausar"}
                            {rec.action === "descartar" && "Descartar"}
                          </span>
                          {/* Date */}
                          <span className="text-xs text-slate-500 ml-auto">
                            {new Date(rec.generated_at).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 font-medium">{rec.title}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{rec.summary}</p>
                        {rec.suggested_next_focus && (
                          <p className="text-xs text-indigo-400/70 mt-2 italic">
                            Enfoque: {rec.suggested_next_focus}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pasos del objetivo - Unified list of pending and completed steps */}
            {checkins.length > 0 && (
              <div className="mt-8">
                {/* New steps indicator */}
                {newStepsGenerated > 0 && (
                  <div className="mb-4 p-3 rounded-xl bg-indigo-500/20 border border-indigo-500/30 animate-pulse">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span className="text-sm font-medium text-indigo-400">
                        ¡{newStepsGenerated} nuevos pasos generados para esta etapa!
                      </span>
                    </div>
                  </div>
                )}
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-50">Pasos del objetivo</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Lo que viene y lo que ya hiciste
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Add step button */}
                    <button
                      onClick={() => setShowCrearPasoModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all"
                      title="Agregar un paso manualmente"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Agregar paso</span>
                    </button>
                    {/* Regenerate steps button */}
                    <button
                      onClick={handleRegenerateSteps}
                      disabled={isRegeneratingSteps}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-wait"
                      title="Regenerar pasos con IA (útil si el objetivo cambió)"
                    >
                      {isRegeneratingSteps ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                          <span>Regenerando...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Regenerar pasos</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {/* Sort: pending first, then done (by created_at desc) */}
                  {[...checkins]
                    .sort((a, b) => {
                      // Pending items first
                      if (a.status === "pending" && b.status !== "pending") return -1;
                      if (a.status !== "pending" && b.status === "pending") return 1;
                      // Within same status, sort by created_at (newest first for done, oldest first for pending)
                      const dateA = new Date(a.created_at).getTime();
                      const dateB = new Date(b.created_at).getTime();
                      if (a.status === "pending") return dateA - dateB; // Oldest pending first
                      return dateB - dateA; // Newest done first
                    })
                    .map((checkin) => {
                    const isPending = checkin.status === "pending";
                    const hasContent = !!checkin.user_content;
                    return (
                      <div
                        key={checkin.id}
                        className={`card-premium px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer hover:border-white/20 transition-all group/card ${isPending ? "border-indigo-500/20" : ""}`}
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
                            role="checkbox"
                            aria-checked={!isPending}
                            aria-label={isPending ? "Marcar como completado" : "Desmarcar como pendiente"}
                            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 cursor-pointer transition-all duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-wait ${
                              isPending
                                ? "bg-transparent border-2 border-slate-500 hover:border-indigo-400 hover:bg-indigo-500/10"
                                : "bg-emerald-500 border-2 border-emerald-400 hover:bg-emerald-400"
                            }`}
                            title={isPending ? "Marcar como completado" : "Desmarcar como pendiente"}
                          >
                            <svg
                              className={`w-4 h-4 transition-all duration-200 ${
                                isPending
                                  ? "text-slate-500 opacity-0 group-hover/card:opacity-50"
                                  : "text-white"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {checkin.step_title ? (
                                <p className="font-medium text-slate-100 truncate">{checkin.step_title}</p>
                              ) : (
                                <p className="font-medium text-slate-100">Avance registrado</p>
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
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
                              <span>{new Date(checkin.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                              {/* Pill de FASE del objetivo */}
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                (checkin.for_stage || experiment.status) === "queued" ? "bg-slate-500/20 text-slate-400" :
                                (checkin.for_stage || experiment.status) === "building" ? "bg-blue-500/20 text-blue-400" :
                                (checkin.for_stage || experiment.status) === "testing" ? "bg-purple-500/20 text-purple-400" :
                                (checkin.for_stage || experiment.status) === "adjusting" ? "bg-amber-500/20 text-amber-400" :
                                (checkin.for_stage || experiment.status) === "achieved" ? "bg-green-500/20 text-green-400" :
                                (checkin.for_stage || experiment.status) === "paused" ? "bg-zinc-500/20 text-zinc-400" :
                                "bg-red-500/20 text-red-400"
                              }`}>
                                {STAGE_LABELS[(checkin.for_stage || experiment.status) as ExperimentStage] || "Construyendo"}
                              </span>
                              {/* Pill de ESTADO del paso */}
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                isPending
                                  ? "bg-indigo-500/20 text-indigo-400"
                                  : "bg-emerald-500/20 text-emerald-400"
                              }`}>
                                {isPending ? "Pendiente" : "Completado"}
                              </span>
                              {checkin.effort && (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                  checkin.effort === "muy_pequeno" ? "bg-slate-500/20 text-slate-400" :
                                  checkin.effort === "pequeno" ? "bg-slate-500/20 text-slate-400" :
                                  "bg-slate-500/20 text-slate-400"
                                }`}>
                                  {checkin.effort === "muy_pequeno" ? "~5 min" : checkin.effort === "pequeno" ? "~20 min" : "~1 hora"}
                                </span>
                              )}
                              {/* Step assignment badge */}
                              {stepAssignmentsByCheckin[checkin.id]?.length > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 ${
                                  stepAssignmentsByCheckin[checkin.id].some(a => a.status === "completed")
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : stepAssignmentsByCheckin[checkin.id].some(a => a.status === "pending")
                                    ? "bg-indigo-500/20 text-indigo-400"
                                    : "bg-slate-500/20 text-slate-400"
                                }`}>
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                  </svg>
                                  {stepAssignmentsByCheckin[checkin.id][0].helper_name.split(" ")[0]}
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
                          {/* Action buttons - appear on hover */}
                          <div className="flex-shrink-0 flex flex-col gap-1">
                            {/* Pedir ayuda button - only for pending steps */}
                            {isPending && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPedirAyudaCheckin(checkin);
                                }}
                                className="p-2 rounded-lg text-slate-600 opacity-0 group-hover/card:opacity-100 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                                title="Pedir ayuda"
                                aria-label="Pedir ayuda con este paso"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              </button>
                            )}
                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setStepToDelete(checkin);
                              }}
                              className="p-2 rounded-lg text-slate-600 opacity-0 group-hover/card:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="Eliminar paso"
                              aria-label="Eliminar paso"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* HOY CON ESTE PROYECTO - Bloque principal con copy dinámico según estado */}
            {/* Hide this block when objective is finished (achieved/discarded) */}
            {experiment.status !== "achieved" && experiment.status !== "discarded" && (
            <div className="card-accent px-3 sm:px-5 py-4 sm:py-5 border-indigo-500/30">
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
            )}

            {/* Mobile-only Metrics - HIDDEN for now (not functional) */}
            {/*
            <div className="lg:hidden card-premium px-3 sm:px-5 py-3 sm:py-4">
              ... metrics content hidden ...
            </div>
            */}

            {/* Mobile-only Status Selector */}
            <div className="lg:hidden card-premium px-3 sm:px-5 py-3 sm:py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Estado</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_COLORS[experiment.status as ExperimentStatus]}`}>
                  {STATUS_LABELS[experiment.status as ExperimentStatus]}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUS_LABELS) as ExperimentStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={isStatusUpdating}
                    className={`chip-interactive px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      experiment.status === status
                        ? STATUS_BADGE_COLORS[status]
                        : "bg-white/5 text-slate-400 border-white/10 hover:border-white/20 active:scale-95"
                    } disabled:opacity-50`}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile-only Progress Tracking */}
            <div className="lg:hidden card-premium px-3 sm:px-5 py-3 sm:py-4">
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
              <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
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
              <div className="card-premium px-3 sm:px-5 py-3 sm:py-4 border-emerald-500/30">
                <p className="font-medium text-emerald-400">
                  Meta alcanzada. Considera escalar este experimento.
                </p>
              </div>
            )}

          </div>

          {/* Right Column (1/3) - Hidden on mobile */}
          <div className="hidden lg:block space-y-6">
            {/* Metrics Card - HIDDEN for now (not functional) */}
            {/*
            <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
              <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Métricas</h3>
              ... content hidden ...
            </div>
            */}

            {/* Status Selector */}
            <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
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
            <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
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

            {/* Brief Card - MOVED to inside Objetivo block above */}
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
        assignmentsByAction={assignmentsByAction}
        onRequestHelp={(action) => setPedirAyudaAction(action)}
      />

      {/* Pedir Ayuda Modal */}
      {pedirAyudaAction && (
        <PedirAyudaModal
          isOpen={!!pedirAyudaAction}
          onClose={() => setPedirAyudaAction(null)}
          action={pedirAyudaAction}
          onSuccess={handleAssignmentCreated}
        />
      )}

      {/* Pedir Ayuda Step Modal */}
      {pedirAyudaCheckin && (
        <PedirAyudaStepModal
          isOpen={!!pedirAyudaCheckin}
          onClose={() => setPedirAyudaCheckin(null)}
          checkin={pedirAyudaCheckin}
          onSuccess={handleStepAssignmentCreated}
        />
      )}

      {/* Crear Paso Con Ayuda Modal */}
      {experiment && (
        <CrearPasoConAyudaModal
          isOpen={showCrearPasoModal}
          onClose={() => setShowCrearPasoModal(false)}
          experimentId={experiment.id}
          experimentTitle={experiment.title}
          onSuccess={(data) => {
            // Add the new checkin to the list
            setCheckins((prev) => [data.checkin as ExperimentCheckin, ...prev]);
            // If there was an assignment, add it to the assignments map
            if (data.assignment) {
              setStepAssignmentsByCheckin((prev) => ({
                ...prev,
                [data.checkin.id]: [{
                  id: data.assignment!.id,
                  checkin_id: data.checkin.id,
                  assigned_by: "",
                  helper_name: data.assignment!.helper_name,
                  helper_contact: "",
                  contact_type: "whatsapp",
                  custom_message: null,
                  status: "pending",
                  access_token: "",
                  token_expires_at: "",
                  response_message: null,
                  responded_at: null,
                  notification_sent_at: null,
                  notification_message_id: null,
                  created_at: new Date().toISOString(),
                }],
              }));
            }
            setToastType("vicu-success");
            setToast(data.assignment ? "Paso creado y delegado" : "Paso creado");
            setShowCrearPasoModal(false);
          }}
        />
      )}

      {/* Step Detail Modal - Rediseñado */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeStepDetail}
          />

          {/* Modal */}
          <div className="relative bg-gradient-to-b from-slate-800 to-slate-850 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-hidden shadow-2xl border border-slate-700/30 flex flex-col sm:mx-4">

            {/* Header compacto */}
            <div className="relative px-5 pt-5 pb-4">
              {/* Status badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                selectedStep.status === "done"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  {selectedStep.status === "done"
                    ? <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    : <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                  }
                </svg>
                {selectedStep.status === "done" ? "Completado" : "Pendiente"}
              </div>

              {/* Close button */}
              <button
                onClick={closeStepDetail}
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded-full transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {/* Titulo */}
              <h2 className="text-xl font-bold text-white leading-snug mb-4">
                {selectedStep.step_title || "Paso del objetivo"}
              </h2>

              {/* Descripcion */}
              {selectedStep.step_description && (
                <div className="bg-slate-900/40 rounded-xl p-4 mb-4">
                  <p className="text-[15px] text-slate-300 leading-relaxed">{selectedStep.step_description}</p>
                </div>
              )}

              {/* Meta info */}
              <div className="flex items-center gap-3 mb-6">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(selectedStep.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
                {selectedStep.effort && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                    selectedStep.effort === "muy_pequeno" ? "bg-emerald-500/10 text-emerald-400" :
                    selectedStep.effort === "pequeno" ? "bg-amber-500/10 text-amber-400" :
                    "bg-orange-500/10 text-orange-400"
                  }`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {selectedStep.effort === "muy_pequeno" ? "~5 min" : selectedStep.effort === "pequeno" ? "~20 min" : "~1 hora"}
                  </span>
                )}
              </div>

              {/* Mis notas */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Mis notas
                  </h3>
                  <span className="text-xs text-slate-500">
                    {stepSaveStatus === "saving" && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <div className="w-2 h-2 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                        Guardando
                      </span>
                    )}
                    {stepSaveStatus === "saved" && (
                      <span className="text-emerald-400">Guardado</span>
                    )}
                    {stepSaveStatus === "idle" && stepUserNotes.length > 0 && `${stepUserNotes.length} nota${stepUserNotes.length > 1 ? "s" : ""}`}
                  </span>
                </div>

                {/* Input para nueva nota */}
                <div className="flex gap-2 mb-3">
                  <textarea
                    value={newNoteInput}
                    onChange={(e) => setNewNoteInput(e.target.value)}
                    placeholder="Escribe una nota..."
                    rows={2}
                    className="flex-1 px-3.5 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-transparent resize-none transition-all"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!newNoteInput.trim() || stepSaveStatus === "saving"}
                    className="self-end px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Agregar</span>
                  </button>
                </div>

                {/* Lista de notas */}
                {stepUserNotes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {stepUserNotes.map((note) => {
                      const isExpanded = expandedNoteId === note.id;
                      const isLongNote = note.content.length > 100;
                      return (
                        <div
                          key={note.id}
                          className={`p-3 rounded-lg group transition-colors cursor-pointer ${
                            note.fromVicu
                              ? "bg-purple-900/20 hover:bg-purple-900/30 border border-purple-500/20"
                              : "bg-slate-900/40 hover:bg-slate-900/60"
                          }`}
                          onClick={() => isLongNote && setExpandedNoteId(isExpanded ? null : note.id)}
                        >
                          <div className="flex items-start gap-2.5">
                            {note.fromVicu ? (
                              <span className="text-purple-400 mt-0.5 flex-shrink-0" title="Generado por Vicu">✨</span>
                            ) : (
                              <svg className="w-4 h-4 text-indigo-400/70 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <p className={`flex-1 text-sm leading-relaxed break-words ${
                              note.fromVicu ? "text-purple-200" : "text-slate-300"
                            } ${!isExpanded && isLongNote ? "line-clamp-2" : ""}`}>
                              {note.content}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                              disabled={stepSaveStatus === "saving"}
                              className="p-1 text-slate-600 hover:text-red-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {isLongNote && (
                            <p className="text-[10px] text-slate-500 mt-1 ml-6">
                              {isExpanded ? "Click para contraer" : "Click para expandir"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-3 bg-slate-900/20 rounded-lg">
                    Sin notas aun
                  </p>
                )}
              </div>

              {/* Ayuda de Vicu */}
              <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-xl border border-purple-500/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-purple-500/10">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Ayuda de Vicu
                  </h3>
                </div>

                <div className="p-4 space-y-3">
                  {!vicuSuggestion ? (
                    <button
                      onClick={handleGenerateIdeas}
                      disabled={isGeneratingIdeas}
                      className="w-full px-4 py-3 rounded-xl bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-medium"
                    >
                      {isGeneratingIdeas ? (
                        <>
                          <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                          Generando ideas...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Generar ideas
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-slate-900/50 rounded-lg p-3.5">
                        <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                          <LinkifiedText text={vicuSuggestion} />
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveSuggestion}
                          className="flex-1 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 transition-all flex items-center justify-center gap-1.5 text-xs font-medium"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Guardar
                        </button>
                        <button
                          onClick={handleGenerateIdeas}
                          disabled={isGeneratingIdeas}
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Otra idea
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* Footer with Chat and Close */}
            <div className="border-t border-slate-700/50 bg-slate-800/80">
              {/* Mini-chat for contextual help */}
              {isChatOpen ? (
                <div className="p-4 space-y-3 border-b border-slate-700/50">
                  {/* Chat messages */}
                  {chatMessages.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {chatMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`p-2.5 rounded-lg text-sm ${
                            msg.role === "user"
                              ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 ml-4"
                              : "bg-slate-700/50 border border-slate-600/50 text-slate-200 mr-4"
                          }`}
                        >
                          {msg.role === "assistant" && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                <span className="text-[8px] text-white font-bold">v</span>
                              </div>
                              <span className="text-[10px] text-indigo-400 font-medium">Vicu</span>
                            </div>
                          )}
                          <p className="whitespace-pre-wrap leading-relaxed">
                            <LinkifiedText text={msg.content} />
                          </p>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="p-2.5 rounded-lg bg-slate-700/50 border border-slate-600/50 mr-4">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                              <span className="text-[8px] text-white font-bold">v</span>
                            </div>
                            <span className="text-[10px] text-indigo-400 font-medium">Vicu</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <div className="w-3 h-3 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                            <span>Pensando...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick suggestions - only when no messages yet */}
                  {chatMessages.length === 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {["Simplifícalo", "Dame un ejemplo", "No entiendo", "Primer paso"].map((quickSuggestion) => (
                        <button
                          key={quickSuggestion}
                          onClick={async () => {
                            if (!selectedStep || !experiment || isChatLoading) return;
                            setChatMessages([{ role: "user", content: quickSuggestion }]);
                            setIsChatLoading(true);
                            try {
                              const res = await fetch("/api/step-chat", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  projectTitle: experiment.title,
                                  projectDescription: experiment.description,
                                  stepTitle: selectedStep.step_title,
                                  stepDescription: selectedStep.step_description,
                                  currentSuggestion: vicuSuggestion,
                                  userNotes: stepUserNotes.map((n) => n.content),
                                  messages: [],
                                  userMessage: quickSuggestion,
                                }),
                              });
                              const data = await res.json();
                              if (data.success && data.content) {
                                setChatMessages([
                                  { role: "user", content: quickSuggestion },
                                  { role: "assistant", content: data.content },
                                ]);
                              }
                            } catch {
                              setToast("Error al enviar mensaje");
                              setTimeout(() => setToast(null), 3000);
                            } finally {
                              setIsChatLoading(false);
                            }
                          }}
                          disabled={isChatLoading}
                          className="px-2.5 py-1.5 text-xs bg-slate-700/50 border border-slate-600/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-full transition-colors disabled:opacity-50"
                        >
                          {quickSuggestion}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Chat input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendChatMessage();
                        }
                      }}
                      placeholder={chatMessages.length === 0 ? "¿En qué necesitas ayuda?" : "Escribe tu mensaje..."}
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
                      disabled={isChatLoading}
                    />
                    <button
                      onClick={handleSendChatMessage}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Action buttons */}
              <div className="p-4 sm:p-5 flex gap-3">
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className={`flex-1 px-4 py-2.5 sm:py-3 rounded-xl font-medium text-sm sm:text-base transition-colors flex items-center justify-center gap-2 ${
                    isChatOpen
                      ? "bg-slate-600 text-white hover:bg-slate-500"
                      : "bg-indigo-600 text-white hover:bg-indigo-500"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {isChatOpen ? "Cerrar chat" : "Ayúdame"}
                </button>
                <button
                  onClick={closeStepDetail}
                  className="flex-1 px-4 py-2.5 sm:py-3 rounded-xl bg-slate-700 text-white hover:bg-slate-600 transition-colors font-medium text-sm sm:text-base"
                >
                  Cerrar
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

      {/* WhatsApp Onboarding Modal */}
      <WhatsAppOnboardingModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        onSuccess={() => {
          setShowWhatsAppModal(false);
          setToast("Recordatorios activados");
          setTimeout(() => setToast(null), 3000);
        }}
      />
    </div>
  );
}

// Wrap with AuthGuard
export default function ExperimentPage() {
  return (
    <AuthGuard>
      <ExperimentPageContent />
    </AuthGuard>
  );
}
