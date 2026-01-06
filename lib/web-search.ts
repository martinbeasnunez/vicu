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

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results: BraveSearchResult[];
  };
}

/**
 * Search using Brave Search API for real web results.
 * Falls back gracefully if API key is not configured.
 */
async function braveSearch(query: string): Promise<BraveSearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    console.warn("BRAVE_SEARCH_API_KEY not configured, skipping web search");
    return [];
  }

  try {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`Brave Search API error: ${response.status}`);
      return [];
    }

    const data: BraveSearchResponse = await response.json();
    return data.web?.results || [];
  } catch (error) {
    console.error("Brave Search failed:", error);
    return [];
  }
}

/**
 * Uses real web search to find information, then summarizes with GPT.
 */
export async function searchForContext(query: string): Promise<SearchResult> {
  // Step 1: Get real search results from Brave
  const braveResults = await braveSearch(query);

  if (braveResults.length === 0) {
    return {
      query,
      summary: "",
      facts: [],
      source_hint: "",
    };
  }

  // Step 2: Build context from search results
  const searchContext = braveResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}\nURL: ${r.url}`)
    .join("\n\n");

  // Step 3: Use GPT to extract relevant facts from the REAL search results
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Eres un asistente que extrae información relevante de resultados de búsqueda web.

IMPORTANTE:
- SOLO usa información de los resultados proporcionados, NO inventes datos
- Si los resultados no contienen la información solicitada, indica que no se encontró
- Extrae datos específicos y verificables de las fuentes
- Prioriza información de fuentes confiables

Responde SOLO con JSON válido:
{
  "summary": "Resumen de 1-2 oraciones basado en los resultados",
  "facts": ["Dato específico 1", "Dato específico 2", "Dato específico 3"],
  "source_hint": "Tipo de fuentes encontradas (ej: 'sitio oficial', 'artículos', 'foros')"
}`
      },
      {
        role: "user",
        content: `Búsqueda: "${query}"\n\nResultados:\n${searchContext}`
      }
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return {
      query,
      summary: "",
      facts: [],
      source_hint: "",
      source_urls: braveResults.map(r => r.url),
    };
  }

  try {
    const parsed = JSON.parse(content);
    return {
      query,
      summary: parsed.summary || "",
      facts: parsed.facts || [],
      source_hint: parsed.source_hint || "",
      source_urls: braveResults.map(r => r.url),
    };
  } catch {
    return {
      query,
      summary: "",
      facts: [],
      source_hint: "",
      source_urls: braveResults.map(r => r.url),
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
 * Uses real web search via Brave Search API.
 */
export async function enrichWithSearch(
  userMessage: string,
  conversationContext: string
): Promise<{ enriched: boolean; searchResults: SearchResult[] }> {
  // Check if Brave Search is configured
  if (!process.env.BRAVE_SEARCH_API_KEY) {
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
