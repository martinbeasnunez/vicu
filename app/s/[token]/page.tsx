"use client";

import { useState, useEffect, use } from "react";
import { CheckCircle, XCircle, Clock, AlertCircle, Loader2, MessageSquare, Target, Sparkles } from "lucide-react";

interface StepAssignmentData {
  id: string;
  helper_name: string;
  owner_name: string;
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
  const [showMessageInput, setShowMessageInput] = useState(false);

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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-slate-400">Cargando...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-8">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <AlertCircle className="w-8 h-8 text-amber-400" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              {error === "Esta solicitud ha expirado" ? "Solicitud expirada" : "Algo salió mal"}
            </h1>
            <p className="text-slate-400 text-sm">
              {error === "Esta solicitud ha expirado"
                ? "Esta solicitud de ayuda ya no está disponible."
                : error}
            </p>
          </div>
          <p className="text-slate-600 text-xs mt-6">
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
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-8">
            {submitResult === "completed" ? (
              <>
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">
                  ¡Eres crack!
                </h1>
                <p className="text-slate-400">
                  <span className="text-white font-medium">{assignment?.owner_name}</span> va a estar muy agradecido/a
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <XCircle className="w-10 h-10 text-slate-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">
                  Entendido
                </h1>
                <p className="text-slate-400">
                  Gracias por avisar. ¡Otra vez será!
                </p>
              </>
            )}
          </div>
          <div className="mt-8 p-4 bg-slate-800/30 rounded-2xl border border-slate-700/30">
            <p className="text-slate-400 text-sm mb-3">
              ¿Tienes tus propios objetivos?
            </p>
            <a
              href="https://vicu.app"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-5 rounded-xl transition-colors text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Prueba Vicu gratis
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Already responded
  if (assignment && assignment.status !== "pending") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl p-8">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-5">
              <Clock className="w-8 h-8 text-slate-400" />
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              Ya respondiste
            </h1>
            <p className="text-slate-400 text-sm">
              Tu respuesta fue registrada el{" "}
              {assignment.responded_at
                ? new Date(assignment.responded_at).toLocaleDateString("es", {
                    day: "numeric",
                    month: "long",
                  })
                : "anteriormente"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main form - Redesigned
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header with avatar */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30 text-white text-xl font-bold">
            {assignment?.owner_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <h1 className="text-xl font-bold text-white mb-1">
            {assignment?.owner_name} te pidió ayuda
          </h1>
          <p className="text-slate-400 text-sm">
            Para su objetivo: <span className="text-slate-300">{assignment?.experiment_title}</span>
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-3xl overflow-hidden">

          {/* Custom message - PROMINENT if exists */}
          {assignment?.custom_message && (
            <div className="p-5 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-b border-slate-700/50">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-indigo-400 font-medium uppercase tracking-wide mb-1">
                    Mensaje de {assignment.owner_name?.split(" ")[0]}
                  </p>
                  <p className="text-white font-medium leading-relaxed">
                    {assignment.custom_message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step details */}
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Target className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                  {assignment?.custom_message ? "Contexto del paso" : "Lo que necesita"}
                </p>
                <h2 className="text-white font-semibold leading-snug">
                  {assignment?.step_title}
                </h2>
                {assignment?.step_description && (
                  <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                    {assignment.step_description}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Response section */}
          <div className="p-5 bg-slate-900/50 border-t border-slate-700/50">
            {/* Optional message toggle */}
            {!showMessageInput ? (
              <button
                onClick={() => setShowMessageInput(true)}
                className="w-full text-left text-sm text-slate-500 hover:text-slate-300 mb-4 flex items-center gap-2 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Agregar mensaje (opcional)
              </button>
            ) : (
              <div className="mb-4">
                <textarea
                  value={responseMessage}
                  onChange={(e) => setResponseMessage(e.target.value)}
                  placeholder="Ej: Listo, te paso el contacto por WhatsApp..."
                  className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none text-sm"
                  rows={2}
                  autoFocus
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleRespond("completed")}
                disabled={responding}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-emerald-500/50 disabled:to-emerald-600/50 text-white font-semibold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 text-slate-400 hover:text-slate-200 font-medium py-4 px-5 rounded-xl transition-all flex items-center justify-center"
                title="No puedo ayudar"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-slate-600 text-xs mb-2">
            ¿Tienes tus propios objetivos?
          </p>
          <a
            href="https://vicu.app"
            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
          >
            Prueba Vicu gratis →
          </a>
        </div>
      </div>
    </div>
  );
}
