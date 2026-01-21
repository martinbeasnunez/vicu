"use client";

import { useState, useEffect } from "react";
import { UserStats, Badge, getLevelName, BADGE_INFO } from "@/lib/gamification";

interface RecentActivity {
  id: string;
  type: "checkin" | "badge" | "level_up" | "project_completed";
  description: string;
  date: string;
  xp?: number;
}

interface ProfileSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userStats: UserStats | null;
  whatsappPhone?: string;
  onWhatsappConfigure: () => void;
  onSignOut: () => void;
}

export default function ProfileSlideOver({
  isOpen,
  onClose,
  userEmail,
  userStats,
  whatsappPhone,
  onWhatsappConfigure,
  onSignOut,
}: ProfileSlideOverProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Fetch recent activity when panel opens
  useEffect(() => {
    if (isOpen && userStats?.user_id && userStats.user_id !== "none") {
      fetchRecentActivity();
    }
  }, [isOpen, userStats?.user_id]);

  const fetchRecentActivity = async () => {
    if (!userStats?.user_id) return;

    setLoadingActivity(true);
    try {
      const response = await fetch("/api/user/activity");
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data.activities || []);
      }
    } catch (error) {
      console.error("Error fetching activity:", error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== "ELIMINAR") return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/user", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Error al eliminar cuenta");
      }

      // Sign out and redirect
      onSignOut();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Error al eliminar cuenta");
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return date.toLocaleDateString("es", { day: "numeric", month: "short" });
  };

  if (!isOpen) return null;

  const stats = userStats || {
    xp: 0,
    level: 1,
    streak_days: 0,
    total_checkins: 0,
    total_projects_completed: 0,
    badges: [] as Badge[],
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-hidden">
        <div className="flex h-full flex-col bg-slate-900 border-l border-slate-700 shadow-2xl animate-slide-in-right">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-lg font-semibold text-slate-50">Tu perfil</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* User info section */}
            <div className="px-5 py-5 border-b border-slate-800/50">
              {/* Email */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="text-slate-100 truncate">{userEmail}</p>
                </div>
              </div>

              {/* WhatsApp */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  whatsappPhone ? "bg-emerald-500/20" : "bg-slate-700"
                }`}>
                  <svg className={`w-5 h-5 ${whatsappPhone ? "text-emerald-400" : "text-slate-400"}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-400">WhatsApp</p>
                  {whatsappPhone ? (
                    <p className="text-slate-100">{whatsappPhone}</p>
                  ) : (
                    <button
                      onClick={onWhatsappConfigure}
                      className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Configurar recordatorios
                    </button>
                  )}
                </div>
                {whatsappPhone && (
                  <button
                    onClick={onWhatsappConfigure}
                    className="px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            </div>

            {/* Stats section */}
            <div className="px-5 py-5 border-b border-slate-800/50">
              <h3 className="text-sm font-medium text-slate-400 mb-4">Tus estadísticas</h3>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {/* Streak */}
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">🔥</div>
                  <div className="text-xl font-bold text-orange-400">{stats.streak_days}</div>
                  <div className="text-xs text-slate-400">días racha</div>
                </div>

                {/* XP */}
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">⭐</div>
                  <div className="text-xl font-bold text-amber-400">{stats.xp.toLocaleString()}</div>
                  <div className="text-xs text-slate-400">XP total</div>
                </div>

                {/* Level */}
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">📈</div>
                  <div className="text-xl font-bold text-indigo-400">{stats.level}</div>
                  <div className="text-xs text-slate-400">{getLevelName(stats.level)}</div>
                </div>
              </div>

              {/* Secondary stats */}
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Avances:</span>
                  <span className="text-slate-200 font-medium">{stats.total_checkins}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Logrados:</span>
                  <span className="text-emerald-400 font-medium">{stats.total_projects_completed}</span>
                </div>
              </div>

              {/* Badges */}
              {stats.badges && stats.badges.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs text-slate-400 mb-2">Badges desbloqueados</p>
                  <div className="flex flex-wrap gap-2">
                    {stats.badges.map((badge) => {
                      const info = BADGE_INFO[badge.id];
                      return (
                        <div
                          key={badge.id}
                          className="group relative px-2.5 py-1.5 bg-slate-800 rounded-lg border border-slate-700 cursor-default"
                          title={info?.name || badge.id}
                        >
                          <span className="text-lg">{info?.icon || "🏆"}</span>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-700 rounded text-xs text-slate-200 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                            {info?.name || badge.id}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Recent activity section */}
            <div className="px-5 py-5 border-b border-slate-800/50">
              <h3 className="text-sm font-medium text-slate-400 mb-4">Actividad reciente</h3>

              {loadingActivity ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                        {activity.type === "checkin" && <span className="text-sm">✓</span>}
                        {activity.type === "badge" && <span className="text-sm">🏆</span>}
                        {activity.type === "level_up" && <span className="text-sm">📈</span>}
                        {activity.type === "project_completed" && <span className="text-sm">🎯</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 leading-tight">{activity.description}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(activity.date)}</p>
                      </div>
                      {activity.xp && (
                        <span className="text-xs text-amber-400 font-medium">+{activity.xp} XP</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  Aún no hay actividad. ¡Marca tu primer avance!
                </p>
              )}
            </div>

            {/* Actions section */}
            <div className="px-5 py-5">
              {/* Sign out */}
              <button
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-all mb-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Cerrar sesión
              </button>

              {/* Delete account */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar mi cuenta
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            {/* Warning icon */}
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg font-semibold text-slate-50 text-center mb-2">
              Eliminar cuenta
            </h3>
            <p className="text-sm text-slate-400 text-center mb-4">
              Esta acción es <span className="text-red-400 font-medium">permanente e irreversible</span>.
            </p>

            {/* What will be deleted */}
            <div className="bg-slate-800/50 rounded-lg p-3 mb-4 text-sm">
              <p className="text-slate-300 mb-2">Se eliminará:</p>
              <ul className="text-slate-400 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="text-red-400">•</span>
                  Todos tus objetivos y avances
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-400">•</span>
                  Tu progreso, XP y badges
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-400">•</span>
                  Configuración de WhatsApp
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-red-400">•</span>
                  Tu cuenta de usuario
                </li>
              </ul>
            </div>

            {/* Confirmation input */}
            <div className="mb-4">
              <label className="block text-sm text-slate-300 mb-2">
                Escribe <span className="font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">ELIMINAR</span> para confirmar:
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value.toUpperCase())}
                disabled={isDeleting}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 disabled:opacity-50"
                placeholder="ELIMINAR"
                autoComplete="off"
              />
            </div>

            {deleteError && (
              <p className="text-sm text-red-400 mb-4 text-center">{deleteError}</p>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInput("");
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== "ELIMINAR" || isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar cuenta"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
