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
  steps: {
    total: number;
    completed: number;
    completed_today: number;
    completed_week: number;
    completion_rate: number;
  };
  reminders: {
    sent_today: number;
    sent_week: number;
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


        {/* Daily Activity Chart */}
        {data.daily_activity && data.daily_activity.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-8">
            <h2 className="text-lg font-semibold mb-4">Actividad ultimos 7 dias</h2>
            <div className="flex items-end gap-2 h-32">
              {data.daily_activity.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-1 items-end h-24">
                    <div
                      className="flex-1 bg-emerald-500 rounded-t"
                      style={{ height: `${(day.checkins / maxCheckins) * 100}%`, minHeight: day.checkins > 0 ? 4 : 0 }}
                      title={`${day.checkins} checkins`}
                    />
                    <div
                      className="flex-1 bg-amber-500 rounded-t"
                      style={{ height: `${(day.objectives_created / maxObjectives) * 100}%`, minHeight: day.objectives_created > 0 ? 4 : 0 }}
                      title={`${day.objectives_created} objetivos creados`}
                    />
                    <div
                      className="flex-1 bg-blue-500 rounded-t"
                      style={{ height: `${(day.reminders_sent / maxReminders) * 100}%`, minHeight: day.reminders_sent > 0 ? 4 : 0 }}
                      title={`${day.reminders_sent} recordatorios`}
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
              <h2 className="text-lg font-semibold">Usuarios ({data.users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/50 text-left text-sm text-slate-400">
                    <th className="p-3">Email</th>
                    <th className="p-3">WhatsApp</th>
                    <th className="p-3">Objetivos</th>
                    <th className="p-3">Activo 7d</th>
                    <th className="p-3">Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                      <td className="p-3 text-sm">{u.email || "-"}</td>
                      <td className="p-3">
                        {u.whatsapp_active ? (
                          <span className="text-emerald-400 text-sm" title={u.phone || ""}>
                            {u.phone ? `+${u.phone.slice(0, 2)}...${u.phone.slice(-4)}` : "Si"}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">{u.active_objectives || 0}</td>
                      <td className="p-3">
                        {u.active_last_7d ? (
                          <span className="text-emerald-400 text-sm">Si</span>
                        ) : (
                          <span className="text-slate-500 text-sm">-</span>
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
