"use client";

import { useState } from "react";
import { X, Send, Loader2, Phone, Mail, Users } from "lucide-react";

interface ExperimentAction {
  id: string;
  title: string;
  content: string;
}

interface PedirAyudaModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: ExperimentAction;
  onSuccess: (assignment: {
    id: string;
    helper_name: string;
    status: string;
    public_url: string;
  }) => void;
}

export default function PedirAyudaModal({
  isOpen,
  onClose,
  action,
  onSuccess,
}: PedirAyudaModalProps) {
  const [helperName, setHelperName] = useState("");
  const [helperContact, setHelperContact] = useState("");
  const [contactType, setContactType] = useState<"whatsapp" | "email">("whatsapp");
  const [customMessage, setCustomMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helperName.trim() || !helperContact.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: action.id,
          helper_name: helperName.trim(),
          helper_contact: helperContact.trim(),
          contact_type: contactType,
          custom_message: customMessage.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear la solicitud");
        return;
      }

      onSuccess({
        id: data.assignment.id,
        helper_name: data.assignment.helper_name,
        status: data.assignment.status,
        public_url: data.public_url,
      });

      // Reset form
      setHelperName("");
      setHelperContact("");
      setCustomMessage("");
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneDisplay = (phone: string) => {
    // Remove non-digits for processing
    const digits = phone.replace(/\D/g, "");
    return digits;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Pedir ayuda</h2>
              <p className="text-sm text-slate-400">Asigna esta tarea a alguien</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action preview */}
        <div className="px-6 py-4 bg-white/[0.02] border-b border-white/5">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tarea</p>
          <p className="text-white font-medium line-clamp-2">{action.title}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Helper name */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              ¿Quién te puede ayudar?
            </label>
            <input
              type="text"
              value={helperName}
              onChange={(e) => setHelperName(e.target.value)}
              placeholder="Ej: María García"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          {/* Contact type toggle */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              ¿Cómo le avisamos?
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setContactType("whatsapp")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                  contactType === "whatsapp"
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Phone className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setContactType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                  contactType === "email"
                    ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                }`}
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
            </div>
          </div>

          {/* Contact input */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              {contactType === "whatsapp" ? "Número de WhatsApp" : "Correo electrónico"}
            </label>
            {contactType === "whatsapp" ? (
              <div className="flex gap-2">
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 flex items-center">
                  +51
                </div>
                <input
                  type="tel"
                  value={helperContact}
                  onChange={(e) => setHelperContact(formatPhoneDisplay(e.target.value))}
                  placeholder="999 888 777"
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
            ) : (
              <input
                type="email"
                value={helperContact}
                onChange={(e) => setHelperContact(e.target.value)}
                placeholder="maria@ejemplo.com"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            )}
          </div>

          {/* Custom message */}
          <div>
            <label className="block text-sm text-slate-300 mb-2">
              Mensaje personalizado (opcional)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Ej: ¿Me puedes pasar el contacto de operaciones del club?"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              rows={2}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !helperName.trim() || !helperContact.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Enviar solicitud
              </>
            )}
          </button>

          <p className="text-xs text-slate-500 text-center">
            {contactType === "whatsapp"
              ? "Le enviaremos un WhatsApp con el link para responder"
              : "Le enviaremos un email con el link para responder"}
          </p>
        </form>
      </div>
    </div>
  );
}
