"use client";

import { UserStats, getXpForNextLevel, getLevelName, Badge, getStreakStatus } from "@/lib/gamification";

interface GamificationPanelProps {
  stats: UserStats | null;
  loading?: boolean;
  compact?: boolean;
}

export default function GamificationPanel({ stats, loading, compact = false }: GamificationPanelProps) {
  if (loading) {
    return (
      <div className="card-premium px-5 py-4 animate-pulse">
        <div className="h-16 bg-white/5 rounded-xl" />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const xpProgress = getXpForNextLevel(stats.xp);
  const levelName = getLevelName(stats.level);
  const streakStatus = getStreakStatus(stats.last_checkin_date, stats.streak_days);
  const dailyProgress = Math.min(100, (stats.daily_checkins / stats.daily_goal) * 100);
  const dailyGoalMet = stats.daily_checkins >= stats.daily_goal;

  if (compact) {
    return (
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
        {/* Level */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white font-bold text-sm">{stats.level}</span>
          </div>
          <div>
            <p className="text-xs text-slate-400">{levelName}</p>
            <p className="text-sm font-medium text-slate-200">{stats.xp} XP</p>
          </div>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20">
          <span className="text-lg">🔥</span>
          <span className="font-semibold text-orange-400">{stats.streak_days}</span>
        </div>

        {/* Daily goal */}
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${dailyGoalMet ? "bg-emerald-500" : "bg-indigo-500"}`}
              style={{ width: `${dailyProgress}%` }}
            />
          </div>
          <span className="text-xs text-slate-400">
            {stats.daily_checkins}/{stats.daily_goal}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium px-5 py-4 space-y-4">
      {/* Header with level */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="text-white font-bold text-xl">{stats.level}</span>
            </div>
            {/* XP ring */}
            <svg className="absolute inset-0 w-14 h-14 -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="4"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="url(#xpGradient)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${xpProgress.progress * 1.5} 150`}
              />
              <defs>
                <linearGradient id="xpGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <p className="text-sm text-slate-400">Nivel {stats.level}</p>
            <p className="text-lg font-semibold text-slate-50">{levelName}</p>
          </div>
        </div>

        {/* Streak */}
        <div className="text-center">
          <div className={`flex items-center gap-1 px-4 py-2 rounded-xl ${
            streakStatus.isActive
              ? "bg-orange-500/20 border border-orange-500/30"
              : "bg-slate-500/20 border border-slate-500/30"
          }`}>
            <span className="text-2xl">{streakStatus.isActive ? "🔥" : "💤"}</span>
            <span className={`text-2xl font-bold ${streakStatus.isActive ? "text-orange-400" : "text-slate-400"}`}>
              {stats.streak_days}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {streakStatus.isActive ? "días de racha" : "racha perdida"}
          </p>
        </div>
      </div>

      {/* XP Progress */}
      <div>
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-slate-400">Progreso al nivel {stats.level + 1}</span>
          <span className="text-indigo-400 font-medium">{stats.xp} XP</span>
        </div>
        <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${xpProgress.progress}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {xpProgress.current} / {xpProgress.needed} XP para subir de nivel
        </p>
      </div>

      {/* Daily Goal */}
      <div className={`p-4 rounded-xl border ${
        dailyGoalMet
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-white/[0.02] border-white/10"
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{dailyGoalMet ? "✅" : "🎯"}</span>
            <span className="text-sm font-medium text-slate-200">Meta de hoy</span>
          </div>
          <span className={`text-sm font-bold ${dailyGoalMet ? "text-emerald-400" : "text-slate-300"}`}>
            {stats.daily_checkins} / {stats.daily_goal}
          </span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${dailyGoalMet ? "bg-emerald-500" : "bg-indigo-500"}`}
            style={{ width: `${dailyProgress}%` }}
          />
        </div>
        {dailyGoalMet ? (
          <p className="text-xs text-emerald-400 mt-2">
            ¡Meta cumplida! +{25} XP de bonus
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-2">
            Avanza en {stats.daily_goal - stats.daily_checkins} proyecto{stats.daily_goal - stats.daily_checkins !== 1 ? "s" : ""} más para cumplir tu meta
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
          <p className="text-xl font-semibold text-slate-50">{stats.total_checkins}</p>
          <p className="text-xs text-slate-500">Avances totales</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
          <p className="text-xl font-semibold text-slate-50">{stats.longest_streak}</p>
          <p className="text-xs text-slate-500">Mejor racha</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
          <p className="text-xl font-semibold text-slate-50">{stats.badges.length}</p>
          <p className="text-xs text-slate-500">Badges</p>
        </div>
      </div>

      {/* Recent badges */}
      {stats.badges.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Últimos logros</p>
          <div className="flex flex-wrap gap-2">
            {stats.badges.slice(-5).reverse().map((badge) => (
              <div
                key={badge.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20"
                title={badge.description}
              >
                <span>{badge.icon}</span>
                <span className="text-xs font-medium text-amber-400">{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// XP Gain animation component
interface XpGainProps {
  amount: number;
  onComplete: () => void;
}

export function XpGainAnimation({ amount, onComplete }: XpGainProps) {
  return (
    <div
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-xp-float"
      onAnimationEnd={onComplete}
    >
      <div className="px-6 py-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 shadow-2xl shadow-indigo-500/50">
        <span className="text-2xl font-bold text-white">+{amount} XP</span>
      </div>
    </div>
  );
}

// Badge unlock animation
interface BadgeUnlockProps {
  badge: Badge;
  onComplete: () => void;
}

export function BadgeUnlockAnimation({ badge, onComplete }: BadgeUnlockProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onComplete}
    >
      <div className="p-8 rounded-3xl bg-slate-900 border border-amber-500/30 shadow-2xl shadow-amber-500/20 text-center animate-scale-in">
        <div className="text-6xl mb-4 animate-bounce">{badge.icon}</div>
        <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">Nuevo logro desbloqueado</p>
        <h3 className="text-2xl font-bold text-slate-50 mb-2">{badge.name}</h3>
        <p className="text-slate-400">{badge.description}</p>
        <button
          onClick={onComplete}
          className="mt-6 px-6 py-2 rounded-full bg-amber-500 text-slate-900 font-medium hover:bg-amber-400 transition-colors"
        >
          ¡Genial!
        </button>
      </div>
    </div>
  );
}

// Level up animation
interface LevelUpProps {
  newLevel: number;
  onComplete: () => void;
}

export function LevelUpAnimation({ newLevel, onComplete }: LevelUpProps) {
  const levelName = getLevelName(newLevel);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onComplete}
    >
      <div className="p-8 rounded-3xl bg-gradient-to-br from-indigo-900 to-purple-900 border border-indigo-500/30 shadow-2xl shadow-indigo-500/20 text-center animate-scale-in">
        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/50 animate-pulse">
          <span className="text-4xl font-bold text-white">{newLevel}</span>
        </div>
        <p className="text-xs text-indigo-300 uppercase tracking-wider mb-1">¡Subiste de nivel!</p>
        <h3 className="text-3xl font-bold text-white mb-2">Nivel {newLevel}</h3>
        <p className="text-indigo-200 text-lg">{levelName}</p>
        <button
          onClick={onComplete}
          className="mt-6 px-8 py-3 rounded-full bg-white text-indigo-900 font-bold hover:bg-indigo-100 transition-colors"
        >
          ¡Vamos!
        </button>
      </div>
    </div>
  );
}
