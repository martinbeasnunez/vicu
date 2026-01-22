"use client";

import { useState, useEffect, use } from "react";
import { CheckCircle, XCircle, Clock, AlertCircle, Loader2 } from "lucide-react";

interface StepAssignmentData {
  id: string;
  helper_name: string;
  status: "pending" | "completed" | "declined" | "expired";
  custom_message: string | null;
  responded_at: string | null;
  step_title: string;
  step_description: string | null;
  experiment_title: string;
}

export default function PublicStepAssignmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [assignment, setAssignment] = useState<StepAssignmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [responseMessage, setResponseMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitResult, setSubmitResult] = useState<"completed" | "declined" | null>(null);

  useEffect(() => {
    async function fetchAssignment() {
      try {
        const res = await fetch(`/api/step-assignments/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Error al cargar la solicitud");
          return;
        }

        setAssignment(data.assignment);
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }

    fetchAssignment();
  }, [token]);

  const handleRespond = async (response: "completed" | "declined") => {
    if (responding) return;
    setResponding(true);

    try {
      const res = await fetch(`/api/step-assignments/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response,
          message: responseMessage.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al enviar respuesta");
        return;
      }

      setSubmitted(true);
      setSubmitResult(response);
    } catch {
      setError("Error de conexión");
    } finally {
      setResponding(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">
              {error === "Esta solicitud ha expirado" ? "Solicitud expirada" : "Algo salió mal"}
            </h1>
            <p className="text-slate-400">
              {error === "Esta solicitud ha expirado"
                ? "Esta solicitud de ayuda ya no está disponible."
                : error}
            </p>
          </div>
          <p className="text-slate-500 text-sm mt-6">
            Powered by{" "}
            <a href="https://vicu.app" className="text-indigo-400 hover:underline">
              Vicu
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Success state after responding
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            {submitResult === "completed" ? (
              <>
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <h1 className="text-2xl font-semibold text-white mb-2">
                  ¡Gracias por tu ayuda!
                </h1>
                <p className="text-slate-400">
                  {assignment?.helper_name}, tu apoyo hace la diferencia.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-slate-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-8 h-8 text-slate-400" />
                </div>
                <h1 className="text-2xl font-semibold text-white mb-2">
                  Entendido
                </h1>
                <p className="text-slate-400">
                  Gracias por avisar. ¡Otra vez será!
                </p>
              </>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-6">
            ¿Tienes tus propios objetivos?{" "}
            <a href="https://vicu.app" className="text-indigo-400 hover:underline">
              Prueba Vicu gratis
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Already responded
  if (assignment && assignment.status !== "pending") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white mb-2">
              Ya respondiste a esta solicitud
            </h1>
            <p className="text-slate-400">
              Tu respuesta fue registrada el{" "}
              {assignment.responded_at
                ? new Date(assignment.responded_at).toLocaleDateString("es", {
                    day: "numeric",
                    month: "long",
                  })
                : "anteriormente"}
              .
            </p>
          </div>
          <p className="text-slate-500 text-sm mt-6">
            Powered by{" "}
            <a href="https://vicu.app" className="text-indigo-400 hover:underline">
              Vicu
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-300 px-3 py-1.5 rounded-full text-sm mb-4">
            <span>🤝</span>
            <span>Te pidieron una mano</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden">
          {/* Context */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-700/50">
            <p className="text-slate-400 text-sm mb-1">
              Para el objetivo:
            </p>
            <p className="text-white font-medium">
              {assignment?.experiment_title}
            </p>
          </div>

          {/* Step */}
          <div className="p-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              {assignment?.step_title}
            </h2>
            {assignment?.step_description && (
              <p className="text-slate-300 whitespace-pre-wrap">
                {assignment.step_description}
              </p>
            )}

            {assignment?.custom_message && (
              <div className="mt-4 p-3 bg-slate-700/30 rounded-lg border-l-2 border-indigo-400">
                <p className="text-slate-300 text-sm italic">
                  &ldquo;{assignment.custom_message}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Response */}
          <div className="p-6 bg-slate-800/50 border-t border-slate-700/50">
            <label className="block text-slate-400 text-sm mb-2">
              ¿Quieres dejar un mensaje? (opcional)
            </label>
            <textarea
              value={responseMessage}
              onChange={(e) => setResponseMessage(e.target.value)}
              placeholder="Ej: Ya está listo, cualquier cosa me avisas..."
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={2}
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => handleRespond("completed")}
                disabled={responding}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {responding ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Listo, ya lo hice</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleRespond("declined")}
                disabled={responding}
                className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50 text-slate-300 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-slate-500 text-sm text-center mt-6">
          ¿Tienes tus propios objetivos?{" "}
          <a href="https://vicu.app" className="text-indigo-400 hover:underline">
            Prueba Vicu gratis
          </a>
        </p>
      </div>
    </div>
  );
}
