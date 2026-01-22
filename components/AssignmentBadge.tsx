"use client";

import { Clock, CheckCircle, XCircle, AlertCircle, User } from "lucide-react";

export interface ActionAssignment {
  id: string;
  helper_name: string;
  status: "pending" | "completed" | "declined" | "expired";
  responded_at: string | null;
}

interface AssignmentBadgeProps {
  assignment: ActionAssignment;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: "Esperando",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
    borderClass: "border-amber-500/20",
  },
  completed: {
    icon: CheckCircle,
    label: "Ayudó",
    bgClass: "bg-emerald-500/10",
    textClass: "text-emerald-400",
    borderClass: "border-emerald-500/20",
  },
  declined: {
    icon: XCircle,
    label: "No pudo",
    bgClass: "bg-slate-500/10",
    textClass: "text-slate-400",
    borderClass: "border-slate-500/20",
  },
  expired: {
    icon: AlertCircle,
    label: "Expiró",
    bgClass: "bg-red-500/10",
    textClass: "text-red-400",
    borderClass: "border-red-500/20",
  },
};

export default function AssignmentBadge({ assignment, onClick }: AssignmentBadgeProps) {
  const config = STATUS_CONFIG[assignment.status];
  const Icon = config.icon;

  // Truncate name if too long
  const displayName = assignment.helper_name.length > 12
    ? assignment.helper_name.substring(0, 12) + "..."
    : assignment.helper_name;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all hover:scale-105 ${config.bgClass} ${config.textClass} ${config.borderClass}`}
      title={`${assignment.helper_name} - ${config.label}`}
    >
      <User className="w-3 h-3" />
      <span className="max-w-[80px] truncate">{displayName}</span>
      <Icon className="w-3 h-3" />
    </button>
  );
}

// Compact version for tighter spaces
export function AssignmentBadgeCompact({ assignment, onClick }: AssignmentBadgeProps) {
  const config = STATUS_CONFIG[assignment.status];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all hover:scale-110 ${config.bgClass} ${config.borderClass}`}
      title={`${assignment.helper_name} - ${config.label}`}
    >
      <Icon className={`w-4 h-4 ${config.textClass}`} />
    </button>
  );
}
