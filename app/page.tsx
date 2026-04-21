import Image from "next/image";

export const metadata = {
  title: "Vicu — pausado",
  description: "Vicu se pausó en abril 2026. Gracias a quienes lo usaron.",
};

export default function PausedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#050816] to-[#020617] flex items-center justify-center px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] -z-10" />

      <div className="text-center max-w-xl">
        <div className="flex justify-center mb-10">
          <Image
            src="/vicu-logo.png"
            alt="Vicu"
            width={72}
            height={72}
            className="drop-shadow-2xl opacity-80"
          />
        </div>

        <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight mb-6">
          Vicu se pausó.
        </h1>

        <p className="text-slate-400 text-lg leading-relaxed mb-10">
          Gracias a quienes lo usaron. Fue un experimento lindo mientras duró.
        </p>

        <a
          href="https://twitter.com/martinbeasnunez"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm text-slate-300 hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-colors"
        >
          <span>@martinbeasnunez</span>
        </a>
      </div>
    </div>
  );
}
