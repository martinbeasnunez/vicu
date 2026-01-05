import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Lazy initialization to avoid build-time errors in Vercel
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const {
      projectTitle,
      projectDescription,
      stepTitle,
      stepDescription,
      currentSuggestion,
      userNotes,
      messages,
      userMessage
    } = await request.json();

    if (!userMessage) {
      return NextResponse.json(
        { success: false, error: "User message is required" },
        { status: 400 }
      );
    }

    // Build conversation history
    const conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `Eres Vicu, un asistente personal que ayuda a los usuarios a cumplir sus objetivos paso a paso.

CONTEXTO ACTUAL:
- Objetivo: ${projectTitle || "Sin título"}
- Descripción: ${projectDescription || "Sin descripción"}
- Paso actual: ${stepTitle}
${stepDescription ? `- Detalles del paso: ${stepDescription}` : ""}
${currentSuggestion ? `- Sugerencia previa de Vicu: ${currentSuggestion}` : ""}
${userNotes && userNotes.length > 0 ? `- Notas del usuario: ${userNotes.join(", ")}` : ""}

⚠️ REGLA CRÍTICA - RESPETA EL CONTEXTO LITERALMENTE:
- USA las palabras EXACTAS de la descripción del objetivo, NO las reinterpretes
- Si el usuario habla de "hijo de 2 años" → es un NIÑO PEQUEÑO (toddler), NO un bebé
- Si habla de "hijo de 3 meses" → es un bebé
- NO asumas edades, situaciones, ni detalles que NO están en el contexto
- Si el usuario da información específica, tu respuesta DEBE reflejarla exactamente
- NUNCA generalices cuando hay información concreta disponible

TU ROL:
- Ayuda al usuario a completar este paso específico
- Si pide simplificar algo, hazlo más corto y directo
- Si no entiende, explica de forma más clara
- Si necesita un ejemplo, dáselo (usando el contexto EXACTO del usuario)
- Si está bloqueado, sugiere un primer micro-paso de 2-5 minutos
- Sé conciso (máximo 150 palabras por respuesta)
- Tono: cercano, motivador, práctico

IMPORTANTE:
- NUNCA inventes URLs específicas de videos o artículos
- Si recomiendas buscar algo, usa: https://www.youtube.com/results?search_query=TERMINOS+DE+BUSQUEDA
- Enfócate en que el usuario HAGA, no en dar más información`,
      },
    ];

    // Add previous messages
    if (messages && Array.isArray(messages)) {
      for (const msg of messages as ChatMessage[]) {
        conversationHistory.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current user message
    conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-mini",
      messages: conversationHistory,
      temperature: 0.7,
      max_tokens: 300,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "No response generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Error in step chat:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate response" },
      { status: 500 }
    );
  }
}
