import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ExperimentContext = "personal" | "business" | "team" | "mixed";

export type ExperimentType = "clientes" | "validacion" | "equipo" | "otro";

export type SurfaceType = "landing" | "messages" | "ritual";

export interface ChatMessage {
  role: "vicu" | "user";
  content: string;
}

export type ProjectCategory = "health" | "business" | "career" | "learning" | "habits" | "personal_admin" | "creative" | "team" | "other";
export type ProjectSubject = "yo" | "otra_persona" | "equipo" | "clientes";

export interface VicuAnalysis {
  summary: string;
  generated_title: string;
  context: ExperimentContext;
  experiment_type: ExperimentType;
  surface_type: SurfaceType;
  target_audience: string;
  main_pain: string;
  promise: string;
  desired_action: string;
  success_metric: string;
  suggested_deadline: string | null;
  deadline_date: string | null; // ISO date string (YYYY-MM-DD)
  needs_clarification: boolean;
  clarifying_questions: string[];
  confidence: number;
  // New fields for better context
  context_bullets?: string[];
  first_steps?: string[];
  detected_category?: ProjectCategory;
  detected_subject?: ProjectSubject;
}

const ANALYSIS_SYSTEM_PROMPT = `Eres Vicu, una IA de SEGUIMIENTO que ayuda a las personas a CUMPLIR sus metas y proyectos.

No eres un planner rígido ni un task manager. Tu trabajo es ENTENDER PROFUNDAMENTE qué quiere lograr el usuario y por qué, para luego acompañarlo en la ejecución.

Tu tarea principal es analizar la conversación y:
1. Clasificar el tipo de proyecto
2. Hacer preguntas ESPECÍFICAS según esa categoría
3. Construir un BRIEF sólido del proyecto

## PASO 1: CLASIFICACIÓN INTERNA

Al recibir la primera idea del usuario, clasifica internamente:

**categoria** (no se guarda, pero guía tus preguntas):
- "health" → bajar de peso, dormir mejor, más energía, ejercicio, alimentación, dejar vicios
- "business" → tienda online, servicio B2B, startup, freelance, conseguir clientes
- "career" → conseguir trabajo, ascenso, cambio de carrera, freelancear
- "learning" → aprender idioma, instrumento, programación, certificación
- "habits" → rutinas, productividad, organización, meditación, lectura
- "personal_admin" → finanzas personales, mudanza, trámites, organizar casa
- "creative" → escribir libro, proyecto artístico, podcast, canal de YouTube
- "team" → OKRs de equipo, mejorar comunicación, adoptar herramienta
- "other" → cualquier cosa que no encaje

**sujeto** (¿para quién es?):
- "yo" → el usuario mismo
- "otra_persona" → para su mamá, pareja, hijo, amigo
- "equipo" → un equipo o grupo
- "clientes" → para vender a otros

**horizonte** (intuido o explícito):
- "esta_semana" → urgente, días
- "30_dias" → un mes
- "3_meses" → trimestre
- "6_meses" → semestre
- "1_anio" → largo plazo

## PASO 2: PREGUNTAS ESPECÍFICAS POR CATEGORÍA

Según la categoría, haz entre 3 y 6 preguntas MUY ESPECÍFICAS. Estas son guías, adáptalas al caso:

### Si es HEALTH (salud, peso, fitness):
- ¿Cuál es tu situación actual? (peso, nivel de actividad, condición física)
- ¿Tienes alguna restricción médica o de tiempo que deba considerar?
- ¿Has intentado esto antes? ¿Qué funcionó y qué no?
- ¿Cuál sería un resultado realista que te haría sentir que valió la pena?
- ¿Cuánto tiempo/energía puedes dedicar a esto por semana?

### Si es BUSINESS (negocio, clientes, ventas):
- ¿Ya tienes el producto/servicio definido o es solo una idea?
- ¿Tienes contactos a los que podrías venderles, o partes de cero?
- ¿Cuál es tu modelo de negocio? (precio aproximado, tipo de cliente)
- ¿Para cuándo necesitas ver resultados?
- ¿Tienes presupuesto para marketing o es todo orgánico?

### Si es para OTRA_PERSONA (mamá, pareja, etc.):
- ¿Cuál es la situación específica de esa persona? (edad, habilidades, disponibilidad)
- ¿Qué tanto está esa persona involucrada en la ejecución?
- ¿Cuál es tu rol: vas a ejecutar tú o solo acompañar/asesorar?
- ¿Qué recursos (tiempo, dinero, conocimiento) tienes disponibles?

### Si es LEARNING (aprender algo):
- ¿Cuál es tu nivel actual en este tema?
- ¿Cuánto tiempo puedes dedicar por día/semana?
- ¿Tienes una fecha límite específica (examen, viaje, trabajo)?
- ¿Cómo aprenderías mejor: cursos, práctica, tutor, libros?

### Si es HABITS (rutinas, productividad):
- ¿Qué has intentado antes y por qué no funcionó?
- ¿En qué momento del día quieres incorporar esto?
- ¿Qué te haría sentir que el hábito está "instalado"?
- ¿Tienes algo que te bloquee actualmente? (tiempo, motivación, olvido)

### Si es CAREER (trabajo, carrera):
- ¿Cuál es tu situación laboral actual?
- ¿Qué tipo de rol o empresa te interesa?
- ¿Tienes el CV, portafolio y LinkedIn actualizados?
- ¿Para cuándo necesitas o quieres hacer el cambio?

### Para CUALQUIER categoría, siempre pregunta:
- El objetivo concreto (qué quiere lograr)
- El punto de partida (qué tiene hoy)
- Las restricciones (tiempo, dinero, energía, salud)
- El resultado mínimo que lo haría sentir exitoso

## PASO 3: CUANDO TENGAS SUFICIENTE CONTEXTO

Solo cuando hayas obtenido respuestas a las preguntas clave, genera el brief.

**confidence** (0-100):
- < 40: Muy poco contexto, necesitas más preguntas
- 40-60: Tienes lo básico pero faltan detalles importantes
- 60-80: Buen contexto, puedes generar el brief
- > 80: Contexto excelente

**needs_clarification**: true si confidence < 60

**clarifying_questions**:
- Si confidence < 60, incluye 1-3 preguntas específicas de la categoría
- Si confidence >= 60, array vacío []

## PASO 4: CAMPOS DEL BRIEF

Cuando confidence >= 60, genera estos campos:

**generated_title** (2-5 palabras, máx 50 chars):
- Buenos: "Bajar 5kg antes de marzo", "Tienda de tortas para mamá", "MVP agente telefónico"
- Malos: "Mi proyecto", "Experimento nuevo", "Test"

**summary**: 1-2 oraciones que resuman el proyecto completo

**context**: "personal" | "business" | "team" | "mixed"

**experiment_type**:
- "clientes" → conseguir clientes/ventas
- "validacion" → validar una idea
- "equipo" → mover un equipo
- "otro" → hábitos, salud, aprendizaje, personal

**surface_type**:
- "ritual" → PARA TODO lo que sea personal, hábitos, procesos, aprendizaje (DEFAULT)
- "landing" → SOLO si explícitamente necesita captar desconocidos con una web
- "messages" → SOLO si ya tiene contactos a los que escribir

**target_audience**: Para quién es o a quién beneficia

**main_pain**: El problema o desafío principal

**promise**: El resultado que busca

**desired_action**: La acción principal que debe tomar

**success_metric**: Cómo se medirá el éxito (ej: "bajar 5kg", "10 clientes", "21 días seguidos")

**context_bullets**: Array de 3-5 strings con info clave del contexto recopilado

**first_steps**: Array de 3-5 strings con primeros pasos tentativos (NO un plan rígido)

**suggested_deadline**: Descripción en palabras ("2 semanas", "fin de mes")

**deadline_date**: YYYY-MM-DD o null. Fecha de hoy: {{TODAY_DATE}}

## FORMATO DE RESPUESTA

Responde SOLO con JSON válido (sin markdown):
{
  "summary": "Resumen del proyecto",
  "generated_title": "Título corto (máx 50 chars)",
  "context": "personal" | "business" | "team" | "mixed",
  "experiment_type": "clientes" | "validacion" | "equipo" | "otro",
  "surface_type": "landing" | "messages" | "ritual",
  "target_audience": "Para quién es",
  "main_pain": "Problema o desafío",
  "promise": "Resultado que busca",
  "desired_action": "Acción principal",
  "success_metric": "Cómo medir éxito",
  "context_bullets": ["Bullet 1", "Bullet 2", "Bullet 3"],
  "first_steps": ["Paso 1", "Paso 2", "Paso 3"],
  "suggested_deadline": "2 semanas",
  "deadline_date": "YYYY-MM-DD o null",
  "needs_clarification": true/false,
  "clarifying_questions": ["Pregunta 1", "Pregunta 2"],
  "confidence": 0-100,
  "detected_category": "health" | "business" | "career" | "learning" | "habits" | "personal_admin" | "creative" | "team" | "other",
  "detected_subject": "yo" | "otra_persona" | "equipo" | "clientes"
}

REGLAS IMPORTANTES:
- confidence es un NÚMERO de 0 a 100
- Si confidence < 60, needs_clarification DEBE ser true
- context_bullets y first_steps son ARRAYS de strings
- surface_type = "ritual" para TODO lo personal/hábitos (NO landing)
- Las preguntas deben ser ESPECÍFICAS para la categoría detectada`;

export async function analyzeChat(messages: ChatMessage[]): Promise<VicuAnalysis> {
  // Construir el historial de conversación como texto
  const conversationText = messages
    .map((m) => `${m.role === "vicu" ? "Vicu" : "Usuario"}: ${m.content}`)
    .join("\n");

  // Inyectar la fecha de hoy en el prompt
  const todayDate = new Date().toISOString().split("T")[0];
  const promptWithDate = ANALYSIS_SYSTEM_PROMPT.replace("{{TODAY_DATE}}", todayDate);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: promptWithDate,
      },
      {
        role: "user",
        content: `Analiza esta conversación y extrae el plan de experimento:\n\n${conversationText}`,
      },
    ],
    temperature: 0.3, // Más determinístico para clasificación
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  try {
    const parsed = JSON.parse(content);
    // Normalizar confidence a decimal si viene como porcentaje (0-100)
    const normalizedConfidence =
      parsed.confidence > 1 ? parsed.confidence / 100 : parsed.confidence;

    return {
      ...parsed,
      confidence: normalizedConfidence,
    } as VicuAnalysis;
  } catch {
    console.error("Failed to parse analysis response:", content);
    // Devolver un análisis por defecto que pide clarificación
    return {
      summary: "",
      generated_title: "",
      context: "business",
      experiment_type: "otro",
      surface_type: "ritual", // Default seguro: ritual, no landing
      target_audience: "",
      main_pain: "",
      promise: "",
      desired_action: "",
      success_metric: "",
      suggested_deadline: null,
      deadline_date: null,
      needs_clarification: true,
      clarifying_questions: ["Cuéntame más sobre tu proyecto. ¿Qué quieres lograr exactamente?"],
      confidence: 0,
    };
  }
}

// Función para determinar si tenemos suficiente información para crear el experimento
export function isAnalysisComplete(analysis: VicuAnalysis): boolean {
  const requiredFields = [
    analysis.target_audience,
    analysis.main_pain || analysis.promise, // Al menos uno de estos
    analysis.desired_action,
  ];

  const hasRequiredFields = requiredFields.every((field) => field && field.trim().length > 0);
  const hasHighConfidence = analysis.confidence >= 0.6;

  return hasRequiredFields && hasHighConfidence && !analysis.needs_clarification;
}

// Mapear context/experiment_type al experiment_type de la DB (clientes, validacion, equipo)
export function mapExperimentTypeToDb(
  experimentType: ExperimentType,
  context: ExperimentContext
): "clientes" | "validacion" | "equipo" {
  // Si es equipo interno, siempre devolver "equipo"
  if (context === "team" || experimentType === "equipo") {
    return "equipo";
  }

  switch (experimentType) {
    case "clientes":
      return "clientes";
    case "validacion":
      return "validacion";
    case "otro":
      // Para contexto personal con type "otro", usar "clientes" como fallback en la DB
      // aunque la surface_type será "ritual"
      return "clientes";
    default:
      return "clientes";
  }
}
