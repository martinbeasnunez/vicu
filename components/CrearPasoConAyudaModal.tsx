"use client";

import { useState } from "react";
import { X, Loader2, MessageCircle, Copy, Check, Sparkles, Plus, ArrowRight } from "lucide-react";

interface CrearPasoConAyudaModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: string;
  experimentTitle: string;
  onSuccess: (data: {
    checkin: { id: string; step_title: string };
    assignment?: {
      id: string;
      helper_name: string;
      public_url: string;
    };
  }) => void;
}

export default function CrearPasoConAyudaModal({
  isOpen,
  onClose,
  experimentId,
  experimentTitle,
  onSuccess,
}: CrearPasoConAyudaModalProps) {
  // Step data
  const [stepTitle, setStepTitle] = useState("");
  const [stepDescription, setStepDescription] = useState("");

  // Assignment data (optional)
  const [wantsHelp, setWantsHelp] = useState(true);
  const [helperName, setHelperName] = useState("");
  const [helperContact, setHelperContact] = useState("");
  const [customMessage, setCustomMessage] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [createdCheckin, setCreatedCheckin] = useState<{ id: string; step_title: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stepTitle.trim()) return;
    if (wantsHelp && (!helperName.trim() || !helperContact.trim())) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Create the checkin (step)
      const checkinRes = await fetch("/api/experiment-checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experimentId,
          step_title: stepTitle.trim(),
          step_description: stepDescription.trim() || undefined,
        }),
      });

      const checkinData = await checkinRes.json();

      if (!checkinRes.ok) {
        setError(checkinData.error || "Error al crear el paso");
        return;
      }

      const newCheckin = checkinData.checkin;
      setCreatedCheckin(newCheckin);

      // 2. If wants help, create the assignment
      if (wantsHelp) {
        let fullPhone = helperContact.trim();
        if (!fullPhone.startsWith("51")) {
          fullPhone = "51" + fullPhone;
        }

        const assignRes = await fetch("/api/step-assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkin_id: newCheckin.id,
            helper_name: helperName.trim(),
            helper_contact: fullPhone,
            contact_type: "whatsapp",
            custom_message: customMessage.trim() || undefined,
          }),
        });

        const assignData = await assignRes.json();

        if (!assignRes.ok) {
          // Step was created but assignment failed - still show success but note the error
          setError(`Paso creado, pero error al asignar: ${assignData.error}`);
          onSuccess({ checkin: newCheckin });
          setShowSuccess(true);
          return;
        }

        setPublicUrl(assignData.public_url);
        setWhatsappSent(assignData.notification_sent === true);
        setShowSuccess(true);

        onSuccess({
          checkin: newCheckin,
          assignment: {
            id: assignData.assignment.id,
            helper_name: assignData.assignment.helper_name,
            public_url: assignData.public_url,
          },
        });
      } else {
        // Just created the step, no assignment
        setShowSuccess(true);
        onSuccess({ checkin: newCheckin });
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    setStepTitle("");
    setStepDescription("");
    setWantsHelp(true);
    setHelperName("");
    setHelperContact("");
    setCustomMessage("");
    setShowSuccess(false);
    setPublicUrl("");
    setCopied(false);
    setWhatsappSent(false);
    setCreatedCheckin(null);
    setError(null);
    onClose();
  };

  const formatPhoneDisplay = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return digits;
  };

  // Success state
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={handleClose}
        />
        <div className="relative w-full sm:max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 sm:mx-4 animate-in slide-in-from-bottom duration-300">
          <div className="p-8 text-center">
            <div className={`w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center shadow-lg ${
              publicUrl
                ? whatsappSent
                  ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30"
                  : "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/30"
                : "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30"
            }`}>
              {publicUrl ? (
                whatsappSent ? <Check className="w-8 h-8 text-white" /> : <MessageCircle className="w-8 h-8 text-white" />
              ) : (
                <Check className="w-8 h-8 text-white" />
              )}
            </div>

            <h3 className="text-xl font-semibold text-white mb-2">
              {publicUrl
                ? whatsappSent
                  ? "¡Paso creado y WhatsApp enviado!"
                  : "¡Paso creado!"
                : "¡Paso creado!"}
            </h3>

            <p className="text-slate-400 text-sm mb-4">
              {createdCheckin?.step_title}
            </p>

            {publicUrl && (
              <>
                {whatsappSent && (
                  <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">
                    <Check className="w-4 h-4" />
                    WhatsApp enviado a {helperName}
                  </div>
                )}

                {/* Link preview */}
                <div className="bg-slate-800/80 rounded-xl p-4 mb-4 border border-slate-700/50 text-left">
                  <p className="text-xs text-slate-500 mb-2">Link para {helperName}</p>
                  <p className="text-sm text-indigo-400 font-mono truncate">{publicUrl}</p>
                </div>

                {/* Copy button */}
                <button
                  onClick={handleCopyLink}
                  className={`w-full py-3.5 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-5 h-5" />
                      ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      Copiar link
                    </>
                  )}
                </button>

                {!whatsappSent && (
                  <a
                    href={`https://wa.me/51${helperContact}?text=${encodeURIComponent(`Hola ${helperName}! Te pido una mano con algo: ${publicUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full py-3.5 px-4 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Enviar por WhatsApp
                  </a>
                )}
              </>
            )}

            <button
              onClick={handleClose}
              className="mt-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={handleClose}
      />

      <div className="relative w-full sm:max-w-md bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 sm:mx-4 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        {/* Drag indicator (mobile) */}
        <div className="sm:hidden w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 sticky top-0 bg-gradient-to-b from-slate-800 to-slate-800/95 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Plus className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Crear y delegar</h2>
                <p className="text-sm text-slate-400">Nuevo paso con ayuda</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 -mr-2 rounded-xl text-slate-500 hover:text-white hover:bg-slate-700/50 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Experiment context */}
        <div className="mx-6 mb-4 px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <p className="text-xs text-slate-500">Para el objetivo:</p>
          <p className="text-sm text-slate-300 font-medium truncate">{experimentTitle}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          {/* Section: What step */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-400">
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold">1</div>
              <span className="text-sm font-medium">¿Qué necesitas?</span>
            </div>

            <div>
              <input
                type="text"
                value={stepTitle}
                onChange={(e) => setStepTitle(e.target.value)}
                placeholder="Ej: Conseguir intro al Real Inca Club"
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <textarea
                value={stepDescription}
                onChange={(e) => setStepDescription(e.target.value)}
                placeholder="Detalles adicionales (opcional)"
                className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none text-sm"
                rows={2}
              />
            </div>
          </div>

          {/* Toggle: Want help? */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <span className="text-sm text-white font-medium">Delegar a alguien</span>
            </div>
            <button
              type="button"
              onClick={() => setWantsHelp(!wantsHelp)}
              className={`w-12 h-7 rounded-full transition-all ${
                wantsHelp ? "bg-violet-600" : "bg-slate-700"
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                wantsHelp ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          {/* Section: Who helps (conditional) */}
          {wantsHelp && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-violet-400">
                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold">2</div>
                <span className="text-sm font-medium">¿Quién te puede ayudar?</span>
              </div>

              <div>
                <input
                  type="text"
                  value={helperName}
                  onChange={(e) => setHelperName(e.target.value)}
                  placeholder="Nombre de tu contacto"
                  className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                  required={wantsHelp}
                />
              </div>

              <div className="flex gap-2">
                <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-slate-400 flex items-center font-medium">
                  +51
                </div>
                <input
                  type="tel"
                  value={helperContact}
                  onChange={(e) => setHelperContact(formatPhoneDisplay(e.target.value))}
                  placeholder="999 888 777"
                  className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                  required={wantsHelp}
                />
              </div>

              <div>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Mensaje personalizado (opcional)"
                  className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all resize-none text-sm"
                  rows={2}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !stepTitle.trim() || (wantsHelp && (!helperName.trim() || !helperContact.trim()))}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {wantsHelp ? "Creando y enviando..." : "Creando paso..."}
              </>
            ) : (
              <>
                {wantsHelp ? (
                  <>
                    <ArrowRight className="w-5 h-5" />
                    Crear y enviar a {helperName || "contacto"}
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" />
                    Crear paso
                  </>
                )}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
