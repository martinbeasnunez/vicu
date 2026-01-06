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
  source_urls?: string[];
}

/**
 * Uses OpenAI's built-in web search via Responses API.
 * This provides Google-quality search results directly through OpenAI.
 */
export async function searchForContext(query: string): Promise<SearchResult> {
  try {
    console.log(`[Web Search] Searching for: "${query}"`);

    // Use OpenAI Responses API with web search tool
    const response = await getOpenAI().responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: `Busca información actualizada sobre: "${query}"

Responde en formato JSON con esta estructura exacta:
{
  "summary": "Resumen de 1-2 oraciones sobre qué es",
  "facts": ["Dato específico 1", "Dato específico 2", "Dato específico 3"],
  "source_hint": "Tipo de fuente (ej: 'sitio oficial', 'artículo')",
  "urls": ["url1", "url2"]
}

IMPORTANTE:
- Si es una empresa/startup/producto, incluye qué hace y su propósito
- Prioriza información del sitio oficial si existe
- Incluye las URLs de las fuentes que uses`,
    });

    // Extract the text content from the response
    let textContent = "";
    for (const item of response.output || []) {
      if (item.type === "message" && "content" in item) {
        for (const contentItem of item.content || []) {
          if (contentItem.type === "output_text" && "text" in contentItem) {
            textContent = contentItem.text;
            break;
          }
        }
      }
    }

    if (!textContent) {
      console.log("[Web Search] No text content in response");
      return {
        query,
        summary: "",
        facts: [],
        source_hint: "",
      };
    }

    // Try to parse JSON from the response
    try {
      // Find JSON in the response (might be wrapped in markdown code blocks)
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[Web Search] Found: ${parsed.summary}`);
        return {
          query,
          summary: parsed.summary || "",
          facts: parsed.facts || [],
          source_hint: parsed.source_hint || "",
          source_urls: parsed.urls || [],
        };
      }
    } catch (parseError) {
      console.log("[Web Search] Could not parse JSON, using raw text");
    }

    // Fallback: return the raw text as summary
    return {
      query,
      summary: textContent.slice(0, 200),
      facts: [],
      source_hint: "búsqueda web",
    };
  } catch (error) {
    console.error("[Web Search] Error:", error);
    return {
      query,
      summary: "",
      facts: [],
      source_hint: "",
    };
  }
}

/**
 * Detects if a message needs external information lookup.
 * Focuses on proper nouns, company names, and specific products that need verification.
 */
export async function detectSearchNeeds(userMessage: string, context: string): Promise<string[]> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Analiza el mensaje y determina si necesitas buscar información en la web.

BUSCA CUANDO el usuario mencione:
- Nombres propios de empresas/startups/productos que podrían ser ambiguos
- Productos específicos donde el mercado/precio importa
- Proyectos o plataformas que no conoces con certeza

NO BUSQUES CUANDO:
- Es un término genérico sin ambigüedad (ej: "bajar de peso", "aprender inglés")
- El usuario ya explicó qué es
- Es información personal del usuario (ej: "mi empresa", "mi trabajo")

FORMATO DE QUERIES:
- Para empresas tech/startups: "nombreempresa.ai" (buscar el dominio directamente)
- Para productos con contexto local: "producto país" (ej: "minivan escolar Peru")
- Para nombres ambiguos: buscar con contexto de negocio "nombre empresa startup IA"

Responde SOLO con JSON:
{
  "needs_search": true/false,
  "queries": ["búsqueda 1", "búsqueda 2"], // máximo 2 búsquedas
  "likely_domain": "nombre.ai" // opcional: si crees que es una empresa tech, sugiere el dominio probable
}`
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
      const queries = parsed.queries.slice(0, 2);
      // If a likely domain was suggested, add a search for it
      if (parsed.likely_domain && !queries.some((q: string) => q.includes(parsed.likely_domain))) {
        queries.unshift(parsed.likely_domain);
      }
      return queries.slice(0, 2);
    }
  } catch {
    // Si falla el parsing, no buscar
  }

  return [];
}

/**
 * Main function: analyzes user message and returns enriched context if needed.
 * Uses OpenAI's built-in web search for accurate, real-time results.
 */
export async function enrichWithSearch(
  userMessage: string,
  conversationContext: string
): Promise<{ enriched: boolean; searchResults: SearchResult[] }> {
  // Check if OpenAI is configured
  if (!process.env.OPENAI_API_KEY) {
    return { enriched: false, searchResults: [] };
  }

  // Detect if we need to search
  const searchQueries = await detectSearchNeeds(userMessage, conversationContext);

  if (searchQueries.length === 0) {
    return { enriched: false, searchResults: [] };
  }

  // Execute searches in parallel
  const searchPromises = searchQueries.map(query => searchForContext(query));
  const searchResults = await Promise.all(searchPromises);

  // Filter out empty results
  const validResults = searchResults.filter(r => r.facts.length > 0 || r.summary);

  return {
    enriched: validResults.length > 0,
    searchResults: validResults
  };
}
