"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Target, MessageCircle, Sparkles, Check, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#050816] to-[#020617]">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] -z-10" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[100px] -z-10" />

        <div className="max-w-5xl mx-auto px-6 pt-12 pb-20 sm:pt-20 sm:pb-32">
          {/* Logo */}
          <div className="flex justify-center mb-12 animate-fade-in">
            <Image
              src="/vicu-logo.png"
              alt="Vicu"
              width={80}
              height={80}
              className="drop-shadow-2xl"
            />
          </div>

          {/* Hero content */}
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8 animate-fade-in-down">
              <Sparkles className="w-4 h-4" />
              <span>Beta privada</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold text-white leading-tight tracking-tight mb-6 animate-fade-in-up">
              Deja de pensar.
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                Empieza a avanzar.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up stagger-1">
              Vicu es tu compañero de IA que convierte tus metas en pasos claros
              y te manda recordatorios por WhatsApp para que no dejes nada a medias.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up stagger-2">
              <Link
                href="/login"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
              >
                Probar Vicu gratis
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <span className="text-slate-500 text-sm">
                Sin tarjeta de crédito
              </span>
            </div>
          </div>

          {/* App Preview - MacBook + iPhone */}
          <div className="mt-16 sm:mt-24 animate-fade-in-up stagger-3">
            <div className="relative mx-auto max-w-5xl px-4">
              {/* Glow effect */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-indigo-600/30 rounded-full blur-[120px] -z-10" />

              {/* Devices container */}
              <div className="relative flex justify-center items-end">
                {/* MacBook - Main device */}
                <div className="relative w-full max-w-[700px] z-10">
                  <Image
                    src="/vicu-web-macbook.png"
                    alt="Vicu - Dashboard"
                    width={1400}
                    height={900}
                    className="w-full h-auto"
                    priority
                  />
                </div>

                {/* iPhone - Floating on the right */}
                <div className="absolute right-0 sm:right-4 md:right-8 bottom-4 sm:bottom-8 w-[100px] sm:w-[140px] md:w-[180px] z-20">
                  <Image
                    src="/vicu-web-iphone.png"
                    alt="Vicu - WhatsApp"
                    width={360}
                    height={720}
                    className="w-full h-auto drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-4">
              Tienes metas grandes.
              <br />
              <span className="text-slate-400">Pero algo te frena.</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: "🤯",
                title: "Demasiados pensamientos",
                description: "Tienes muchas ideas pero no sabes por dónde empezar"
              },
              {
                icon: "📅",
                title: "Siempre para mañana",
                description: "Te propones cosas y terminas postergándolas indefinidamente"
              },
              {
                icon: "🔄",
                title: "Empiezas, pero no terminas",
                description: "Comienzas con energía y después pierdes el momentum"
              }
            ].map((item, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
              >
                <span className="text-3xl mb-4 block">{item.icon}</span>
                <h3 className="text-lg font-medium text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 sm:py-28 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-600/5 via-transparent to-transparent -z-10" />

        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
              <Check className="w-4 h-4" />
              <span>La solución</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-4">
              Vicu te ayuda a lograr lo que te propones
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Con inteligencia artificial y recordatorios por WhatsApp
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative p-8 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08] hover:border-indigo-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 group">
              <div className="absolute -top-4 left-8 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-medium text-slate-300">
                1
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Target className="w-6 h-6 text-indigo-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-3">Cuenta tu meta</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Escribe qué quieres lograr. Vicu entiende tu objetivo y lo descompone.</p>
            </div>

            {/* Step 2 */}
            <div className="relative p-8 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08] hover:border-purple-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5 group">
              <div className="absolute -top-4 left-8 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-medium text-slate-300">
                2
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-3">Recibe tu siguiente paso</h3>
              <p className="text-slate-400 text-sm leading-relaxed">La IA analiza tu meta y te sugiere exactamente qué hacer ahora.</p>
            </div>

            {/* Step 3 */}
            <div className="relative p-8 rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08] hover:border-emerald-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 group">
              <div className="absolute -top-4 left-8 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-sm font-medium text-slate-300">
                3
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <MessageCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-3">Recordatorios en WhatsApp</h3>
              <p className="text-slate-400 text-sm leading-relaxed">Vicu te escribe para que avances. Responde y marca tu progreso.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof / Beta Section */}
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-indigo-600/10 to-transparent border border-indigo-500/20">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Cupos limitados
            </div>

            <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-4">
              Únete a la beta privada
            </h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Estamos invitando a un grupo pequeño de personas que quieren
              dejar de procrastinar y empezar a lograr sus metas.
            </p>

            <Link
              href="/login"
              className="group inline-flex items-center gap-2 px-8 py-4 bg-white text-slate-900 font-medium rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-white/10"
            >
              Quiero entrar
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/vicu-logo.png"
                alt="Vicu"
                width={32}
                height={32}
              />
              <span className="text-slate-400 text-sm">
                © 2026 Vicu. Tu compañero de metas.
              </span>
            </div>
            <div className="text-slate-500 text-sm">
              Hecho con amor en LatAm
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
