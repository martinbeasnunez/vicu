import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { projectTitle, projectDescription, stepTitle, stepDescription } = await request.json();

    if (!stepTitle) {
      return NextResponse.json(
        { success: false, error: "Step title is required" },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `Eres un asistente creativo que ayuda a escribir contenido para proyectos personales y de negocio.

Tu tarea es generar un borrador de contenido basado en el paso/tarea que el usuario necesita completar.

Reglas:
- Si el paso pide escribir un mensaje, genera un mensaje profesional pero cálido
- Si el paso pide un copy o texto de marketing, genera algo persuasivo
- Si el paso pide un guion o script, genera un borrador estructurado
- Si el paso pide investigación o lista, genera puntos claros
- Mantén el tono cercano y profesional
- El contenido debe ser práctico y listo para usar (con pequeños ajustes del usuario)
- Máximo 300 palabras`,
        },
        {
          role: "user",
          content: `Proyecto: ${projectTitle || "Sin título"}
Descripción del proyecto: ${projectDescription || "Sin descripción"}

Paso a completar: ${stepTitle}
${stepDescription ? `Detalles: ${stepDescription}` : ""}

Genera un borrador de contenido que el usuario pueda usar para completar este paso.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "No content generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Error generating step ideas:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate ideas" },
      { status: 500 }
    );
  }
}
