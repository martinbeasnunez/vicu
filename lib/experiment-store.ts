import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ExperimentType, SurfaceType } from "./experiment-helpers";

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

export interface ExperimentMeta {
  successGoalNumber: number | null;
  successGoalUnit: string | null;
  experimentType: ExperimentType | null;
  surfaceType: SurfaceType | null;
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

interface ExperimentStore {
  experimentId: string | null;
  meta: ExperimentMeta;
  copy: LandingCopy;
  setExperiment: (id: string, meta: ExperimentMeta) => void;
  setCopy: (copy: LandingCopy) => void;
  reset: () => void;
}

export const useExperimentStore = create<ExperimentStore>()(
  persist(
    (set) => ({
      experimentId: null,
      meta: {
        successGoalNumber: null,
        successGoalUnit: null,
        experimentType: null,
        surfaceType: null,
      },
      copy: defaultCopy,
      setExperiment: (id, meta) => set({ experimentId: id, meta }),
      setCopy: (copy) => set({ copy }),
      reset: () =>
        set({
          experimentId: null,
          meta: { successGoalNumber: null, successGoalUnit: null, experimentType: null, surfaceType: null },
          copy: defaultCopy,
        }),
    }),
    {
      name: "vicu-experiment-storage",
    }
  )
);
