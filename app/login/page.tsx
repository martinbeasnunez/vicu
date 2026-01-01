"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { signInWithEmail, user } = useAuth();
  const router = useRouter();

  // If already logged in, redirect to /hoy
  if (user) {
    router.push("/hoy");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setMessage(null);

    const { error } = await signInWithEmail(email.trim());

    if (error) {
      setMessage({ type: "error", text: "Error al enviar el enlace. Intenta de nuevo." });
    } else {
      setMessage({
        type: "success",
        text: "Revisa tu correo. Te enviamos un enlace para iniciar sesión.",
      });
      setEmail("");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/vicu-logo.png"
            alt="Vicu"
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg shadow-indigo-500/25"
          />
          <h1 className="text-2xl font-bold text-white">Vicu</h1>
          <p className="text-slate-400 mt-1">Logra tus metas, un día a la vez</p>
        </div>

        {/* Login form */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700/50 shadow-xl">
          <h2 className="text-lg font-semibold text-white mb-2">Iniciar sesión</h2>
          <p className="text-sm text-slate-400 mb-6">
            Ingresa tu correo y te enviaremos un enlace mágico para entrar.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                Correo electrónico
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                disabled={loading}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                "Enviar enlace mágico"
              )}
            </button>
          </form>

          {/* Message */}
          {message && (
            <div
              className={`mt-4 p-3 rounded-xl text-sm ${
                message.type === "success"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Al continuar, aceptas los términos de uso de Vicu.
        </p>
      </div>
    </div>
  );
}
