"use client";

import { useState } from "react";
import { X, Loader2, MessageCircle, Copy, Check, Sparkles } from "lucide-react";

interface ExperimentCheckin {
  id: string;
  step_title: string | null;
  step_description: string | null;
}

interface PedirAyudaStepModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkin: ExperimentCheckin;
  onSuccess: (data: {
    id: string;
    helper_name: string;
    helper_contact: string;
    status: string;
    public_url: string;
    access_token: string;
    notification_sent: boolean;
  }) => void;
}

export default function PedirAyudaStepModal({
  isOpen,
  onClose,
  checkin,
  onSuccess,
}: PedirAyudaStepModalProps) {
  const [helperName, setHelperName] = useState("");
  const [helperContact, setHelperContact] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helperName.trim() || !helperContact.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Add country code if not present
      let fullPhone = helperContact.trim();
      if (!fullPhone.startsWith("51")) {
        fullPhone = "51" + fullPhone;
      }

      const res = await fetch("/api/step-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkin_id: checkin.id,
          helper_name: helperName.trim(),
          helper_contact: fullPhone,
          contact_type: "whatsapp",
          custom_message: customMessage.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear la solicitud");
        return;
      }

      setPublicUrl(data.public_url);
      setWhatsappSent(data.notification_sent === true);
      setShowSuccess(true);

      onSuccess({
        id: data.assignment.id,
        helper_name: data.assignment.helper_name,
        helper_contact: data.assignment.helper_contact,
        status: data.assignment.status,
        public_url: data.public_url,
        access_token: data.assignment.access_token,
        notification_sent: data.notification_sent === true,
      });
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
    setHelperName("");
    setHelperContact("");
    setCustomMessage("");
    setShowSuccess(false);
    setPublicUrl("");
    setCopied(false);
    setWhatsappSent(false);
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
          {/* Success content */}
          <div className="p-8 text-center">
            <div className={`w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center shadow-lg ${
              whatsappSent
                ? "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/30"
                : "bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-indigo-500/30"
            }`}>
              {whatsappSent ? (
                <Check className="w-8 h-8 text-white" />
              ) : (
                <MessageCircle className="w-8 h-8 text-white" />
              )}
            </div>

            <h3 className="text-xl font-semibold text-white mb-2">
              {whatsappSent ? "¡WhatsApp enviado!" : "¡Link creado!"}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              {whatsappSent ? (
                <><span className="text-white font-medium">{helperName}</span> ya recibió el mensaje</>
              ) : (
                <>Envíale el link a <span className="text-white font-medium">{helperName}</span></>
              )}
            </p>

            {/* WhatsApp sent badge */}
            {whatsappSent && (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">
                <Check className="w-4 h-4" />
                WhatsApp enviado automáticamente
              </div>
            )}

            {/* Link preview */}
            <div className="bg-slate-800/80 rounded-xl p-4 mb-4 border border-slate-700/50">
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

            {/* WhatsApp shortcut - only show prominently if not auto-sent */}
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

      <div className="relative w-full sm:max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 sm:mx-4 animate-in slide-in-from-bottom duration-300">
        {/* Drag indicator (mobile) */}
        <div className="sm:hidden w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Delegar paso</h2>
                <p className="text-sm text-slate-400">Pide ayuda a alguien</p>
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

        {/* Step preview - compact card */}
        <div className="mx-6 mb-5 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-white text-sm leading-snug">
                {checkin.step_title || "Paso del objetivo"}
              </p>
              {checkin.step_description && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  {checkin.step_description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Helper name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              ¿A quién le pides ayuda?
            </label>
            <input
              type="text"
              value={helperName}
              onChange={(e) => setHelperName(e.target.value)}
              placeholder="Nombre de tu contacto"
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              required
              autoFocus
            />
          </div>

          {/* WhatsApp number */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Su WhatsApp
            </label>
            <div className="flex gap-2">
              <div className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-slate-400 flex items-center font-medium">
                +51
              </div>
              <input
                type="tel"
                value={helperContact}
                onChange={(e) => setHelperContact(formatPhoneDisplay(e.target.value))}
                placeholder="999 888 777"
                className="flex-1 bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                required
              />
            </div>
          </div>

          {/* Custom message - collapsible */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Mensaje adicional <span className="text-slate-500 font-normal">(opcional)</span>
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ej: Si puedes esta semana sería genial..."
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none text-sm"
              rows={2}
            />
          </div>

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
            disabled={loading || !helperName.trim() || !helperContact.trim()}
            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold py-4 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creando link...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Crear link para {helperName || "enviar"}
              </>
            )}
          </button>

          {/* Helper text */}
          <p className="text-xs text-slate-500 text-center">
            Te daremos un link para que {helperName || "tu contacto"} pueda marcar el paso como hecho
          </p>
        </form>
      </div>
    </div>
  );
}
