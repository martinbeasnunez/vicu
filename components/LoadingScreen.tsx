"use client";

import Image from "next/image";

interface LoadingScreenProps {
  text?: string;
}

export default function LoadingScreen({ text = "Cargando..." }: LoadingScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050816]">
      <div className="flex flex-col items-center gap-8">
        {/* Logo container with effects */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-xl animate-pulse" />

          {/* Main logo */}
          <Image
            src="/vicu-logo.png"
            alt="Vicu"
            width={192}
            height={192}
            className="relative w-48 h-48 animate-pulse"
            priority
          />

          {/* Spinning ring */}
          <div
            className="absolute inset-0 w-48 h-48 border-2 border-transparent border-t-indigo-500 border-r-indigo-500/50 rounded-full animate-spin"
            style={{ animationDuration: "1.5s" }}
          />
        </div>

        {/* Loading text */}
        <p className="text-slate-400 text-sm animate-pulse">{text}</p>
      </div>
    </div>
  );
}
