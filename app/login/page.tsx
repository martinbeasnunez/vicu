"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { signInWithGoogle, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Show error from callback if present
  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const errorMessages: Record<string, string> = {
        "no_code": "Error de autenticación. Intenta de nuevo.",
        "auth_failed": "Error de autenticación. Intenta de nuevo.",
      };
      setMessage({
        type: "error",
        text: errorMessages[error] || `Error: ${error}`,
      });
    }
  }, [searchParams]);

  // If already logged in, redirect to /hoy
  if (user) {
    router.push("/hoy");
    return null;
  }

  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage(null);

    const { error } = await signInWithGoogle();

    if (error) {
      setMessage({ type: "error", text: "Error al iniciar sesión. Intenta de nuevo." });
      setLoading(false);
    }
    // If successful, the page will redirect to Google
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
          <h2 className="text-lg font-semibold text-white mb-2 text-center">Iniciar sesión</h2>
          <p className="text-sm text-slate-400 mb-6 text-center">
            Usa tu cuenta de Google para entrar a Vicu
          </p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full px-4 py-3 bg-white hover:bg-gray-100 disabled:bg-gray-300 text-gray-800 rounded-xl font-medium transition-colors flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continuar con Google</span>
              </>
            )}
          </button>

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

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
