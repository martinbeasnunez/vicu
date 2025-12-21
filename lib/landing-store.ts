import { create } from "zustand";

export interface LandingCopy {
  titulo: string;
  subtitulo: string;
  bullets: [string, string, string];
  placeholders: {
    nombre: string;
    email: string;
    mensaje: string;
  };
  boton: string;
}

const defaultCopy: LandingCopy = {
  titulo: "Lavandería profesional para tu empresa en Lima",
  subtitulo:
    "Servicio de lavandería B2B con recojo y entrega en tu oficina. Uniformes, manteles, sábanas y más. Sin contratos, sin mínimos.",
  bullets: [
    "Recojo y entrega gratis en toda Lima Metropolitana",
    "Entrega en 24-48 horas con seguimiento en tiempo real",
    "Facturación mensual y precios corporativos",
  ],
  placeholders: {
    nombre: "Nombre de contacto",
    email: "Email corporativo",
    mensaje: "Cuéntanos sobre tu empresa y necesidades",
  },
  boton: "Solicitar cotización",
};

interface LandingStore {
  copy: LandingCopy;
  setCopy: (copy: LandingCopy) => void;
  resetCopy: () => void;
}

export const useLandingStore = create<LandingStore>((set) => ({
  copy: defaultCopy,
  setCopy: (copy) => set({ copy }),
  resetCopy: () => set({ copy: defaultCopy }),
}));
