"use client";

import { useState } from "react";
import { formatSuggestedDate } from "@/lib/experiment-helpers";
import { Users } from "lucide-react";
import AssignmentBadge, { ActionAssignment } from "./AssignmentBadge";

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

interface AttackPlanSectionProps {
  channel: string;
  actions: ExperimentAction[];
  defaultOpen?: boolean;
  onCopyContent: (actionId: string, content: string) => void;
  onMarkDone: (actionId: string) => void;
  onGenerateMore?: () => void;
  isGenerating?: boolean;
  copiedId: string | null;
  assignmentsByAction?: Record<string, ActionAssignment[]>;
  onRequestHelp?: (action: ExperimentAction) => void;
}

const STATUS_STYLES: Record<string, string> = {
  done: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  in_progress: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  blocked: "bg-red-500/20 text-red-400 border border-red-500/30",
  pending: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  done: "Hecho",
  in_progress: "En progreso",
  blocked: "Bloqueado",
  pending: "Pendiente",
};

export default function AttackPlanSection({
  channel,
  actions,
  defaultOpen = false,
  onCopyContent,
  onMarkDone,
  onGenerateMore,
  isGenerating = false,
  copiedId,
  assignmentsByAction = {},
  onRequestHelp,
}: AttackPlanSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.status === "done").length;
  const progress = totalActions > 0 ? (doneActions / totalActions) * 100 : 0;
  const isComplete = doneActions === totalActions && totalActions > 0;

  // Show "generate more" button only if at least 1 action is done
  const canGenerateMore = doneActions >= 1 && onGenerateMore;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all duration-200 hover:border-white/15">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-4">
          {/* Checkbox visual indicator */}
          <div
            className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
              isComplete
                ? "bg-emerald-500/20 border-emerald-500/50"
                : "border-white/20 bg-white/5"
            }`}
          >
            {isComplete && (
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>

          <div className="flex flex-col items-start gap-1">
            <h3 className="text-base font-semibold text-slate-50">{channel}</h3>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isComplete
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {doneActions}/{totalActions} {totalActions === 1 ? "acción" : "acciones"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Mini progress bar */}
          <div className="hidden sm:block w-28">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isComplete ? "bg-emerald-500" : "bg-indigo-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Chevron with smooth rotation */}
          <div className={`p-1 rounded-lg bg-white/5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
            <svg
              className="w-5 h-5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {/* Content - Collapsible with smooth animation */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 border-t border-white/5">
            <div className="space-y-3 pt-4">
              {actions.map((action, index) => (
                <div
                  key={action.id}
                  className={`p-4 rounded-xl border transition-all duration-200 ${
                    action.status === "done"
                      ? "bg-emerald-500/5 border-emerald-500/20"
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex gap-3">
                    {/* Large checkbox */}
                    <button
                      onClick={() => action.status !== "done" && onMarkDone(action.id)}
                      disabled={action.status === "done"}
                      className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                        action.status === "done"
                          ? "bg-emerald-500/20 border-emerald-500/50 cursor-default"
                          : "border-white/20 bg-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 cursor-pointer"
                      }`}
                    >
                      {action.status === "done" && (
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-[15px] ${action.status === "done" ? "text-slate-400 line-through" : "text-slate-50"}`}>
                            {action.title}
                          </p>
                          {action.suggested_due_date && action.status !== "done" && (
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="font-medium">{formatSuggestedDate(action.suggested_due_date)}</span>
                            </p>
                          )}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_STYLES[action.status]}`}>
                          {STATUS_LABELS[action.status]}
                        </span>
                      </div>

                      <pre className="whitespace-pre-wrap text-sm text-slate-300 bg-black/30 p-4 rounded-lg border border-white/5 mb-3 font-sans leading-relaxed">
                        {action.content}
                      </pre>

                      {/* Assignment badges */}
                      {assignmentsByAction[action.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {assignmentsByAction[action.id].map((assignment) => (
                            <AssignmentBadge key={assignment.id} assignment={assignment} />
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => onCopyContent(action.id, action.content)}
                          className={`text-sm px-4 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 ${
                            copiedId === action.id
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:border-white/20"
                          }`}
                        >
                          {copiedId === action.id ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              ¡Copiado!
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copiar
                            </>
                          )}
                        </button>
                        {(action.status === "pending" || action.status === "in_progress") && (
                          <>
                            <button
                              onClick={() => onMarkDone(action.id)}
                              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Marcar hecho
                            </button>
                            {onRequestHelp && (
                              <button
                                onClick={() => onRequestHelp(action)}
                                className="text-sm px-4 py-2 rounded-lg bg-white/5 text-slate-300 border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400 transition-all duration-200 flex items-center gap-2"
                                title="Pedir ayuda a alguien"
                              >
                                <Users className="w-4 h-4" />
                                Pedir ayuda
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Generate more actions button */}
              {canGenerateMore && (
                <button
                  onClick={onGenerateMore}
                  disabled={isGenerating}
                  className="w-full p-4 rounded-xl border-2 border-dashed border-white/10 text-slate-400 hover:border-indigo-500/40 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generando...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Generar más ideas para {channel}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
