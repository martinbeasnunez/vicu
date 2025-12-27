import OpenAI from "openai";

// Lazy initialization
let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY environment variable.");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export interface SearchResult {
  query: string;
  summary: string;
  facts: string[];
  source_hint: string;
}

/**
 * Uses OpenAI to search for real-world information.
 * This leverages the model's training data for common facts like product prices,
 * market data, etc. For truly real-time data, you'd integrate a search API.
 */
export async function searchForContext(query: string): Promise<SearchResult> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Eres un asistente de investigación. Tu trabajo es proporcionar información factual y actualizada sobre cualquier tema.

IMPORTANTE:
- Proporciona datos ESPECÍFICOS y NUMÉRICOS cuando sea posible
- Para precios, da rangos realistas del mercado actual (2024-2025)
- Para productos, incluye modelos, versiones y precios típicos
- Si es un tema de nicho, menciona las fuentes típicas de información
- Sé conciso pero informativo

Responde SOLO con JSON válido:
{
  "summary": "Resumen de 1-2 oraciones con la información clave",
  "facts": ["Dato específico 1", "Dato específico 2", "Dato específico 3"],
  "source_hint": "Donde típicamente se encuentra esta info (ej: 'concesionarios', 'mercado libre', 'tiendas especializadas')"
}`
      },
      {
        role: "user",
        content: query
      }
    ],
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return {
      query,
      summary: "No se encontró información específica.",
      facts: [],
      source_hint: ""
    };
  }

  try {
    const parsed = JSON.parse(content);
    return {
      query,
      summary: parsed.summary || "",
      facts: parsed.facts || [],
      source_hint: parsed.source_hint || ""
    };
  } catch {
    return {
      query,
      summary: content.slice(0, 200),
      facts: [],
      source_hint: ""
    };
  }
}

/**
 * Detects if a message needs external information lookup.
 * Returns search queries if needed.
 */
export async function detectSearchNeeds(userMessage: string, context: string): Promise<string[]> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Analiza el mensaje del usuario y determina si necesitas buscar información externa para ayudarlo mejor.

BUSCA INFORMACIÓN CUANDO:
- Mencione un producto específico (autos, tecnología, etc.) → busca precios y modelos
- Mencione una meta financiera sin contexto → busca costos típicos
- Mencione aprender algo → busca duración típica y recursos
- Mencione un negocio/industria → busca datos del mercado
- Mencione una ubicación específica → busca información local relevante

NO BUSQUES CUANDO:
- El usuario ya dio los datos específicos
- Es una meta puramente personal sin datos de mercado (ej: "quiero ser más feliz")
- Ya tienes la información en el contexto

Responde SOLO con JSON:
{
  "needs_search": true/false,
  "queries": ["búsqueda 1", "búsqueda 2"] // máximo 2 búsquedas, vacío si needs_search=false
}

Las queries deben ser específicas, ej:
- "precio Suzuki Jimny 2024 Perú nuevo y usado"
- "costo promedio curso inglés presencial Lima"
- "precio típico servicios desarrollo web freelance Latinoamérica"`
      },
      {
        role: "user",
        content: `Contexto de la conversación: ${context}\n\nÚltimo mensaje del usuario: ${userMessage}`
      }
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    if (parsed.needs_search && parsed.queries) {
      return parsed.queries.slice(0, 2); // máximo 2 búsquedas
    }
  } catch {
    // Si falla el parsing, no buscar
  }

  return [];
}

/**
 * Main function: analyzes user message and returns enriched context if needed.
 */
export async function enrichWithSearch(
  userMessage: string,
  conversationContext: string
): Promise<{ enriched: boolean; searchResults: SearchResult[] }> {
  // Detect if we need to search
  const searchQueries = await detectSearchNeeds(userMessage, conversationContext);

  if (searchQueries.length === 0) {
    return { enriched: false, searchResults: [] };
  }

  // Execute searches in parallel
  const searchPromises = searchQueries.map(query => searchForContext(query));
  const searchResults = await Promise.all(searchPromises);

  return {
    enriched: true,
    searchResults
  };
}
