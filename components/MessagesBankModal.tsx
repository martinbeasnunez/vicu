"use client";

import AttackPlanSection from "./AttackPlanSection";

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

interface MessagesBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  actions: ExperimentAction[];
  actionsByChannel: Record<string, ExperimentAction[]>;
  onCopyContent: (actionId: string, content: string) => void;
  onMarkDone: (actionId: string) => void;
  onGenerateMore: (channel: string) => void;
  generatingChannel: string | null;
  copiedId: string | null;
  actionsError: boolean;
}

export default function MessagesBankModal({
  isOpen,
  onClose,
  actions,
  actionsByChannel,
  onCopyContent,
  onMarkDone,
  onGenerateMore,
  generatingChannel,
  copiedId,
  actionsError,
}: MessagesBankModalProps) {
  if (!isOpen) return null;

  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.status === "done").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-slate-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">
              Banco de mensajes
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {totalActions > 0
                ? `${doneActions} de ${totalActions} mensajes usados`
                : "Mensajes sugeridos para tu estrategia"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {totalActions === 0 ? (
            <div className="py-8 text-center">
              {actionsError ? (
                <p className="text-slate-400">
                  No pudimos generar los mensajes. Intenta recargar.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-slate-400">Preparando mensajes...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(actionsByChannel).map(([channel, channelActions]) => (
                <AttackPlanSection
                  key={channel}
                  channel={channel}
                  actions={channelActions}
                  defaultOpen={true}
                  onCopyContent={onCopyContent}
                  onMarkDone={onMarkDone}
                  onGenerateMore={() => onGenerateMore(channel)}
                  isGenerating={generatingChannel === channel}
                  copiedId={copiedId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
