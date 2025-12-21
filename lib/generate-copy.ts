import { LandingCopy } from "./landing-store";

/**
 * Genera textos para una landing externa a partir de una descripción.
 * Por ahora es una función simple que usa la descripción directamente.
 * En el futuro, esto será reemplazado por una llamada a IA.
 */
export function generateExternalCopy(description: string): LandingCopy {
  // Extrae la primera oración o las primeras palabras como título
  const firstSentence = description.split(/[.!?]/)[0].trim();
  const titulo =
    firstSentence.length > 60
      ? firstSentence.substring(0, 57) + "..."
      : firstSentence || "Tu proyecto";

  return {
    titulo,
    subtitulo: description.length > 150 ? description.substring(0, 147) + "..." : description,
    bullets: [
      "Solución diseñada para tus necesidades específicas",
      "Implementación rápida y soporte dedicado",
      "Resultados medibles desde el primer día",
    ],
    placeholders: {
      nombre: "Tu nombre",
      email: "Tu email",
      mensaje: "Cuéntanos más sobre lo que necesitas",
    },
    boton: "Quiero saber más",
  };
}
