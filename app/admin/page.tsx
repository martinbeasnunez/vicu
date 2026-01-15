"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "martin@getlavado.com";

interface DashboardData {
  overview: {
    total_users: number;
    whatsapp_users: number;
    new_users_week: number;
    new_users_month: number;
    active_users_week: number;
  };
  objectives: {
    total: number;
    active: number;
  };
  reminders: {
    sent_today: number;
    sent_week: number;
  };
  funnel: {
    registered: number;
    has_objective: number;
    has_whatsapp: number;
    has_both: number;
    has_activity: number;
    active_7d: number;
    rate_objective: number;
    rate_whatsapp: number;
    rate_both: number;
    rate_activity: number;
    rate_active_7d: number;
  };
  at_risk_users: Array<{
    id: string;
    email: string;
    created_at: string;
    whatsapp_active: boolean;
    total_objectives: number;
    total_checkins: number;
    days_since_activity: number | null;
    risk_reason: string;
    registered_days_ago: number;
  }>;
  engagement: {
    avg_checkins_per_user: number;
    whatsapp_response_rate: number;
    action_completion_rate: number;
    total_checkins: number;
    whatsapp_checkins: number;
  };
  daily_activity: Array<{
    date: string;
    checkins: number;
    objectives_created: number;
    reminders_sent: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    created_at: string;
    whatsapp_active: boolean;
    phone: string | null;
    total_objectives: number;
    active_objectives: number;
    active_last_7d: boolean;
    total_checkins: number;
    whatsapp_checkins: number;
    whatsapp_interactions: number;
    last_activity: string | null;
    days_since_activity: number | null;
  }>;
  generated_at: string;
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <p className="text-slate-400 text-sm">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ count: number; users: { email: string }[] } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ sent: number; failed: number; scheduled?: string } | null>(null);
  const [emailSchedule, setEmailSchedule] = useState("8am");

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }

    // Check if user is admin
    if (!user || user.email !== ADMIN_EMAIL) {
      router.push("/hoy");
      return;
    }

    // Check if we have a session with token
    if (!session?.access_token) {
      setError("No hay sesion activa");
      setLoading(false);
      return;
    }

    // Fetch dashboard data
    const fetchData = async () => {
      try {
        const res = await fetch("/api/admin/dashboard", {
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({ error: "Error desconocido" }));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }

        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, session, authLoading, router]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Cargando...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-4">Error: {error}</div>
          <a href="/hoy" className="text-slate-400 hover:text-white">
            Volver a Vicu
          </a>
        </div>
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">No hay datos</div>
      </div>
    );
  }

  // Helper functions
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es", { month: "short", day: "numeric" });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const maxCheckins = Math.max(...(data.daily_activity?.map(d => d.checkins) || [1]), 1);
  const maxObjectives = Math.max(...(data.daily_activity?.map(d => d.objectives_created) || [1]), 1);
  const maxReminders = Math.max(...(data.daily_activity?.map(d => d.reminders_sent) || [1]), 1);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Vicu Admin</h1>
            <p className="text-slate-400 text-sm">Dashboard de metricas</p>
          </div>
          <div className="text-right text-sm text-slate-500">
            {data.generated_at && `Actualizado: ${formatFullDate(data.generated_at)}`}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard
            title="Usuarios totales"
            value={data.overview?.total_users || 0}
          />
          <StatCard
            title="Con WhatsApp"
            value={data.overview?.whatsapp_users || 0}
            subtitle={data.overview?.total_users ? `${Math.round((data.overview.whatsapp_users / data.overview.total_users) * 100)}% del total` : ""}
          />
          <StatCard
            title="Activos (7d)"
            value={data.overview?.active_users_week || 0}
            subtitle="Con pasos completados"
          />
          <StatCard
            title="Nuevos (7d)"
            value={data.overview?.new_users_week || 0}
          />
          <StatCard
            title="Nuevos (30d)"
            value={data.overview?.new_users_month || 0}
          />
        </div>

        {/* Objectives */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <StatCard
            title="Objetivos activos"
            value={data.objectives?.active || 0}
            subtitle={`de ${data.objectives?.total || 0} totales`}
          />
          <StatCard
            title="Recordatorios (7d)"
            value={data.reminders?.sent_week || 0}
          />
        </div>

        {/* Conversion Funnel */}
        {data.funnel && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-8">
            <h2 className="text-lg font-semibold mb-4">Funnel de Conversion</h2>
            <div className="space-y-3">
              {[
                { label: "Registrados", value: data.funnel.registered, rate: 100, color: "bg-slate-500" },
                { label: "Con objetivo", value: data.funnel.has_objective, rate: data.funnel.rate_objective, color: "bg-amber-500" },
                { label: "Con WhatsApp", value: data.funnel.has_whatsapp, rate: data.funnel.rate_whatsapp, color: "bg-blue-500" },
                { label: "Con ambos", value: data.funnel.has_both, rate: data.funnel.rate_both, color: "bg-purple-500" },
                { label: "Con actividad", value: data.funnel.has_activity, rate: data.funnel.rate_activity, color: "bg-emerald-500" },
                { label: "Activos 7d", value: data.funnel.active_7d, rate: data.funnel.rate_active_7d, color: "bg-green-400" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-28 text-sm text-slate-400">{step.label}</div>
                  <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${step.color} transition-all duration-500`}
                      style={{ width: `${step.rate}%` }}
                    />
                  </div>
                  <div className="w-20 text-right">
                    <span className="text-white font-medium">{step.value}</span>
                    <span className="text-slate-400 text-sm ml-1">({step.rate}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Email Re-engagement Campaign */}
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Email Re-engagement</h2>
              <p className="text-slate-400 text-sm">Usuarios con 0 objetivos</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!session?.access_token) return;
                  try {
                    const res = await fetch("/api/admin/send-reengagement", {
                      headers: { Authorization: `Bearer ${session.access_token}` },
                    });
                    const json = await res.json();
                    setEmailPreview(json);
                    setEmailResult(null);
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
              >
                Ver lista
              </button>
              {emailPreview && emailPreview.count > 0 && (
                <>
                  <select
                    value={emailSchedule}
                    onChange={(e) => setEmailSchedule(e.target.value)}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm"
                  >
                    <option value="">Ahora</option>
                    <option value="8am">8am Peru</option>
                    <option value="9am">9am Peru</option>
                    <option value="10am">10am Peru</option>
                    <option value="12pm">12pm Peru</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!session?.access_token || emailSending) return;
                      setEmailSending(true);
                      try {
                        const res = await fetch("/api/admin/send-reengagement", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${session.access_token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            dryRun: false,
                            scheduledAt: emailSchedule || undefined,
                          }),
                        });
                        const json = await res.json();
                        setEmailResult({ sent: json.sent, failed: json.failed, scheduled: json.scheduled });
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                    disabled={emailSending}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    {emailSending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>{emailSchedule ? `Programar ${emailPreview.count}` : `Enviar ${emailPreview.count}`}</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {emailResult && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg p-3 mb-4">
              <p className="text-emerald-300">
                {emailResult.scheduled ? (
                  <>Programados: {emailResult.sent} para {new Date(emailResult.scheduled).toLocaleString("es-PE", { timeZone: "America/Lima" })}</>
                ) : (
                  <>Enviados: {emailResult.sent} | Fallidos: {emailResult.failed}</>
                )}
              </p>
            </div>
          )}

          {emailPreview && (
            <div className="space-y-2">
              {emailPreview.count === 0 ? (
                <p className="text-slate-400 text-sm">No hay usuarios con 0 objetivos</p>
              ) : (
                <>
                  <p className="text-slate-300 text-sm mb-2">{emailPreview.count} usuarios recibirian el email:</p>
                  <div className="max-h-40 overflow-y-auto bg-slate-900/50 rounded-lg p-2">
                    {emailPreview.users.slice(0, 20).map((u, i) => (
                      <div key={i} className="text-sm text-slate-400 py-1 border-b border-slate-700/50 last:border-0">
                        {u.email}
                      </div>
                    ))}
                    {emailPreview.count > 20 && (
                      <div className="text-xs text-slate-500 pt-2">+{emailPreview.count - 20} mas...</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Engagement Metrics */}
        {data.engagement && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="Promedio checkins/user"
              value={data.engagement.avg_checkins_per_user}
              subtitle="Usuarios con actividad"
            />
            <StatCard
              title="Respuesta WhatsApp"
              value={`${data.engagement.whatsapp_response_rate}%`}
              subtitle="Users que respondieron"
            />
            <StatCard
              title="Completion rate"
              value={`${data.engagement.action_completion_rate}%`}
              subtitle="Acciones completadas"
            />
            <StatCard
              title="Checkins total"
              value={data.engagement.total_checkins}
              subtitle={`${data.engagement.whatsapp_checkins} via WhatsApp`}
            />
          </div>
        )}

        {/* At-Risk Users */}
        {data.at_risk_users && data.at_risk_users.length > 0 && (
          <div className="bg-red-900/20 rounded-xl border border-red-800/50 overflow-hidden mb-8">
            <div className="p-4 border-b border-red-800/50 flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <h2 className="text-lg font-semibold text-red-300">Usuarios en Riesgo ({data.at_risk_users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-red-900/30 text-left text-sm text-red-300">
                    <th className="p-3">Email</th>
                    <th className="p-3">Razon</th>
                    <th className="p-3">Objetivos</th>
                    <th className="p-3">Checkins</th>
                    <th className="p-3">Dias desde registro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.at_risk_users.slice(0, 10).map((u) => (
                    <tr key={u.id} className="border-t border-red-800/30 hover:bg-red-900/20">
                      <td className="p-3 text-sm text-slate-300">{u.email || "-"}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-800/50 text-red-300">
                          {u.risk_reason}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-slate-400">{u.total_objectives}</td>
                      <td className="p-3 text-sm text-slate-400">{u.total_checkins}</td>
                      <td className="p-3 text-sm text-slate-400">{u.registered_days_ago}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.at_risk_users.length > 10 && (
              <div className="p-3 text-center text-sm text-red-300/60">
                +{data.at_risk_users.length - 10} mas usuarios en riesgo
              </div>
            )}
          </div>
        )}

        {/* Daily Activity Chart */}
        {data.daily_activity && data.daily_activity.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-8">
            <h2 className="text-lg font-semibold mb-4">Actividad ultimos 7 dias</h2>
            <div className="flex items-end gap-2 h-40">
              {data.daily_activity.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex gap-1 text-[10px] text-slate-400">
                    <span className="text-emerald-400">{day.checkins}</span>
                    <span className="text-amber-400">{day.objectives_created}</span>
                    <span className="text-blue-400">{day.reminders_sent}</span>
                  </div>
                  <div className="w-full flex gap-1 items-end h-24">
                    <div
                      className="flex-1 bg-emerald-500 rounded-t"
                      style={{ height: `${(day.checkins / maxCheckins) * 100}%`, minHeight: day.checkins > 0 ? 4 : 0 }}
                    />
                    <div
                      className="flex-1 bg-amber-500 rounded-t"
                      style={{ height: `${(day.objectives_created / maxObjectives) * 100}%`, minHeight: day.objectives_created > 0 ? 4 : 0 }}
                    />
                    <div
                      className="flex-1 bg-blue-500 rounded-t"
                      style={{ height: `${(day.reminders_sent / maxReminders) * 100}%`, minHeight: day.reminders_sent > 0 ? 4 : 0 }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(day.date)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span className="text-slate-400">Checkins</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded" />
                <span className="text-slate-400">Objetivos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded" />
                <span className="text-slate-400">Recordatorios</span>
              </div>
            </div>
          </div>
        )}

        {/* Users List */}
        {data.users && data.users.length > 0 && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold">Todos los Usuarios ({data.users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/50 text-left text-sm text-slate-400">
                    <th className="p-3">Email</th>
                    <th className="p-3">Obj</th>
                    <th className="p-3">Pasos</th>
                    <th className="p-3">WhatsApp</th>
                    <th className="p-3">Visto</th>
                    <th className="p-3">Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-3 text-sm">{u.email || "-"}</td>
                      <td className="p-3 text-sm">{u.total_objectives || 0}</td>
                      <td className="p-3 text-sm">
                        <span className={u.total_checkins > 0 ? "text-emerald-400" : "text-slate-500"}>
                          {u.total_checkins || 0}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        {u.whatsapp_active ? (
                          u.whatsapp_interactions > 0 ? (
                            <span className="text-emerald-400">{u.whatsapp_interactions} resp</span>
                          ) : (
                            <span className="text-amber-400">activo</span>
                          )
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        {u.days_since_activity !== null ? (
                          <span className={u.days_since_activity <= 7 ? "text-emerald-400" : "text-amber-400"}>
                            {u.days_since_activity === 0 ? "Hoy" : `hace ${u.days_since_activity}d`}
                          </span>
                        ) : (
                          <span className="text-slate-500">nunca</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-slate-400">{u.created_at ? formatDate(u.created_at) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <a href="/hoy" className="text-slate-400 hover:text-white text-sm">
            ← Volver a Vicu
          </a>
        </div>
      </div>
    </div>
  );
}
