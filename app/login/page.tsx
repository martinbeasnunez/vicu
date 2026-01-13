"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp">("email");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const { signInWithEmail, verifyOtp, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Show error from callback if present
  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const errorMessages: Record<string, string> = {
        "no_code": "El enlace no es válido. Solicita uno nuevo.",
        "auth_failed": "Error de autenticación. Intenta de nuevo.",
        "Email link is invalid or has expired": "El enlace expiró. Solicita uno nuevo.",
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setMessage(null);

    const { error } = await signInWithEmail(email.trim());

    if (error) {
      setMessage({ type: "error", text: "Error al enviar el código. Intenta de nuevo." });
    } else {
      setStep("otp");
      setMessage({
        type: "success",
        text: "Te enviamos un código de 6 dígitos a tu correo.",
      });
      // Focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    }

    setLoading(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);

    const newOtp = [...otpCode];
    newOtp[index] = digit;
    setOtpCode(newOtp);

    // Auto-focus next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (digit && index === 5) {
      const fullCode = newOtp.join("");
      if (fullCode.length === 6) {
        handleOtpSubmit(fullCode);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Handle backspace - go to previous input
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split("");
      setOtpCode(newOtp);
      handleOtpSubmit(pastedData);
    }
  };

  const handleOtpSubmit = async (code?: string) => {
    const finalCode = code || otpCode.join("");
    if (finalCode.length !== 6) return;

    setLoading(true);
    setMessage(null);

    const { error } = await verifyOtp(email.trim(), finalCode);

    if (error) {
      setMessage({ type: "error", text: "Código incorrecto o expirado. Intenta de nuevo." });
      setOtpCode(["", "", "", "", "", ""]);
      otpInputRefs.current[0]?.focus();
    }
    // Success is handled by auth state change -> redirect

    setLoading(false);
  };

  const handleBackToEmail = () => {
    setStep("email");
    setOtpCode(["", "", "", "", "", ""]);
    setMessage(null);
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
          {step === "email" ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-2">Iniciar sesión</h2>
              <p className="text-sm text-slate-400 mb-6">
                Ingresa tu correo y te enviaremos un código de 6 dígitos.
              </p>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                    "Enviar código"
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-white mb-2">Ingresa el código</h2>
              <p className="text-sm text-slate-400 mb-6">
                Enviamos un código de 6 dígitos a <span className="text-white">{email}</span>
              </p>

              <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
                {otpCode.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpInputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-12 h-14 text-center text-xl font-bold bg-slate-900/50 border border-slate-600/50 rounded-xl text-white focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                    disabled={loading}
                  />
                ))}
              </div>

              <button
                onClick={() => handleOtpSubmit()}
                disabled={loading || otpCode.join("").length !== 6}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  "Verificar código"
                )}
              </button>

              <button
                onClick={handleBackToEmail}
                className="w-full text-sm text-slate-400 hover:text-white transition-colors"
              >
                ← Cambiar correo
              </button>
            </>
          )}

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
