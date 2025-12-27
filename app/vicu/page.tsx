"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useExperimentStore } from "@/lib/experiment-store";
import type { VicuAnalysis } from "@/lib/vicu-analyzer";

type MessageRole = "vicu" | "user";

interface Message {
  id: string;
  role: MessageRole;
  content: string;
}

// Chat phase now includes "readback" for pilot-style confirmation before creating
type ChatPhase = "conversation" | "analyzing" | "readback" | "ready" | "creating" | "error";

// Slot filling system - track which key info pieces we have gathered
// Maximum 5 slots to avoid overwhelming the user
interface SlotState {
  objetivo_principal: "empty" | "filled" | "skipped";
  plazo_tiempo: "empty" | "filled" | "skipped";
  contexto_relevante: "empty" | "filled" | "skipped";
  restricciones: "empty" | "filled" | "skipped";
  resultado_minimo: "empty" | "filled" | "skipped";
}

const INITIAL_SLOTS: SlotState = {
  objetivo_principal: "empty",
  plazo_tiempo: "empty",
  contexto_relevante: "empty",
  restricciones: "empty",
  resultado_minimo: "empty",
};

// Helper to count filled/skipped slots
const countCompletedSlots = (slots: SlotState): number => {
  return Object.values(slots).filter(v => v !== "empty").length;
};

const TOTAL_SLOTS = 5;

const LOADING_MESSAGES = [
  { main: "Pensando en tu experimento...", sub: "Analizando el contexto" },
  { main: "Diseñando la estrategia...", sub: "Definiendo objetivos" },
  { main: "Preparando el plan de ataque...", sub: "Generando acciones" },
  { main: "Distribuyendo tareas en el tiempo...", sub: "Optimizando fechas" },
  { main: "Casi listo...", sub: "Últimos detalles" },
];

export default function VicuPage() {
  const router = useRouter();
  const { setExperiment, setCopy } = useExperimentStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "vicu",
      content:
        "¡Hola! Soy Vicu, tu compañero para cumplir metas. 🎯\n\nCuéntame qué quieres lograr. Puede ser algo personal (bajar de peso, aprender algo nuevo), de trabajo (conseguir clientes, cambiar de empleo), o cualquier proyecto que tengas en mente.",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [phase, setPhase] = useState<ChatPhase>("conversation");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [analysis, setAnalysis] = useState<VicuAnalysis | null>(null);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [askedQuestions, setAskedQuestions] = useState<Set<string>>(new Set()); // Track all asked questions to prevent loops
  const [slots, setSlots] = useState<SlotState>(INITIAL_SLOTS); // Slot filling state
  const [readbackConfirmed, setReadbackConfirmed] = useState(false); // Whether user confirmed readback

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  useEffect(() => {
    if (phase === "conversation" || phase === "readback" || phase === "ready") {
      inputRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "creating") {
      const interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [phase]);

  const addMessage = (role: MessageRole, content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role,
      content,
    };
    setMessages((prev) => [...prev, newMessage]);
    return newMessage;
  };

  const analyzeConversation = async (currentMessages: Message[]) => {
    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/analyze-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json();

      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        return data.analysis as VicuAnalysis;
      }
    } catch (error) {
      console.error("Error analyzing chat:", error);
    } finally {
      setIsAnalyzing(false);
    }

    return null;
  };

  // Helper to normalize question text for comparison (prevents loops with slight variations)
  const normalizeQuestion = (q: string): string => {
    return q.toLowerCase().replace(/[¿?¡!.,]/g, "").trim().substring(0, 50);
  };

  // Helper to check if a question was already asked
  const isQuestionAlreadyAsked = (question: string): boolean => {
    const normalized = normalizeQuestion(question);
    // Also check against existing messages to catch any duplicates
    const existingVicuMessages = messages.filter(m => m.role === "vicu").map(m => normalizeQuestion(m.content));
    return askedQuestions.has(normalized) || existingVicuMessages.some(m => m.includes(normalized) || normalized.includes(m));
  };

  // Helper to get the last vicu message content
  const getLastVicuMessage = (): string => {
    const vicuMessages = messages.filter(m => m.role === "vicu");
    return vicuMessages.length > 0 ? vicuMessages[vicuMessages.length - 1].content : "";
  };

  // Update slots based on AI analysis - determines which info we have gathered
  const updateSlotsFromAnalysis = (result: VicuAnalysis, userMessage: string) => {
    const lowerMsg = userMessage.toLowerCase();
    const isNoSeResponse = lowerMsg.includes("no sé") || lowerMsg.includes("no se") ||
                           lowerMsg.includes("no tengo idea") || lowerMsg.includes("no estoy seguro") ||
                           lowerMsg.includes("ni idea") || lowerMsg.includes("no lo sé");

    setSlots(prev => {
      const newSlots = { ...prev };

      // objetivo_principal - filled if we have summary and desired_action
      if (result.summary && result.summary.length > 10 && result.desired_action) {
        newSlots.objetivo_principal = "filled";
      } else if (isNoSeResponse && prev.objetivo_principal === "empty") {
        // Don't skip objetivo_principal on first no-sé, it's essential
      }

      // plazo_tiempo - filled if we have deadline or suggested_deadline
      if (result.deadline_date || result.suggested_deadline) {
        newSlots.plazo_tiempo = "filled";
      } else if (isNoSeResponse && prev.plazo_tiempo === "empty" && prev.objetivo_principal !== "empty") {
        newSlots.plazo_tiempo = "skipped";
      }

      // contexto_relevante - filled if we have context_bullets or target_audience
      if ((result.context_bullets && result.context_bullets.length > 0) || result.target_audience) {
        newSlots.contexto_relevante = "filled";
      } else if (isNoSeResponse && prev.contexto_relevante === "empty" && prev.objetivo_principal !== "empty") {
        newSlots.contexto_relevante = "skipped";
      }

      // restricciones - filled if we have main_pain or detected limitations
      if (result.main_pain && result.main_pain.length > 5) {
        newSlots.restricciones = "filled";
      } else if (isNoSeResponse && prev.restricciones === "empty" && prev.objetivo_principal !== "empty") {
        newSlots.restricciones = "skipped";
      }

      // resultado_minimo - filled if we have success_metric
      if (result.success_metric && result.success_metric.length > 3) {
        newSlots.resultado_minimo = "filled";
      } else if (isNoSeResponse && prev.resultado_minimo === "empty" && prev.objetivo_principal !== "empty") {
        newSlots.resultado_minimo = "skipped";
      }

      return newSlots;
    });
  };

  // Generate readback message (pilot-style confirmation)
  const generateReadbackMessage = (result: VicuAnalysis): string => {
    const parts: string[] = [];

    parts.push("📋 **Voy a repetir lo que entendí para asegurarme de que todo está bien:**\n");

    if (result.summary) {
      parts.push(`**Objetivo:** ${result.summary}`);
    }

    // Show discovered facts from research (if any)
    if (result.discovered_facts && result.discovered_facts.length > 0) {
      parts.push(`\n**Datos que investigué:**`);
      result.discovered_facts.slice(0, 4).forEach(fact => {
        parts.push(`• ${fact}`);
      });
    }

    if (result.context_bullets && result.context_bullets.length > 0) {
      parts.push(`\n**Contexto clave:**`);
      result.context_bullets.forEach(bullet => {
        parts.push(`• ${bullet}`);
      });
    }

    if (result.main_pain) {
      parts.push(`\n**Desafío/Restricción:** ${result.main_pain}`);
    }

    if (result.success_metric) {
      parts.push(`\n**Resultado mínimo que valdría la pena:** ${result.success_metric}`);
    }

    if (result.suggested_deadline || result.deadline_date) {
      parts.push(`\n**Horizonte de tiempo:** ${result.suggested_deadline || result.deadline_date}`);
    }

    // Show phases if available
    if (result.phases && result.phases.length > 0) {
      parts.push(`\n**Mapa de fases:**`);
      result.phases.forEach((phase, index) => {
        parts.push(`${index + 1}. **${phase.name}**: ${phase.description}`);
      });
    }

    parts.push("\n\n¿Está todo correcto? Si algo no cuadra, cuéntamelo para ajustarlo.");

    return parts.join("\n");
  };

  // Build a context-aware response prefix when search results are available
  const buildSearchContextPrefix = (result: VicuAnalysis): string => {
    if (!result.discovered_facts || result.discovered_facts.length === 0) {
      return "";
    }
    // Return a brief mention that we found relevant data
    return `💡 Investigué un poco y encontré información útil:\n• ${result.discovered_facts.slice(0, 2).join("\n• ")}\n\n`;
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isAnalyzing) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    addMessage("user", userMessage);

    const newTurnCount = turnCount + 1;
    setTurnCount(newTurnCount);

    const updatedMessages = [
      ...messages,
      { id: Date.now().toString(), role: "user" as const, content: userMessage },
    ];

    // If in readback phase, user is providing corrections
    if (phase === "readback") {
      setIsAnalyzing(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Re-analyze with the correction
      const result = await analyzeConversation(updatedMessages);

      if (result) {
        updateSlotsFromAnalysis(result, userMessage);
        // Generate new readback with corrections
        const readbackMsg = generateReadbackMessage(result);
        setTimeout(() => {
          addMessage("vicu", readbackMsg);
        }, 300);
      }
      return;
    }

    // Maximum 5 questions before moving to readback
    const maxTurns = 5;

    if (newTurnCount >= 1) {
      setIsAnalyzing(true);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await analyzeConversation(updatedMessages);

      if (result) {
        // Update slot state based on analysis
        updateSlotsFromAnalysis(result, userMessage);

        // Check if we should move to readback phase
        const completedSlots = countCompletedSlots(slots);
        const shouldDoReadback =
          (result.confidence >= 0.5 && completedSlots >= 3) ||
          (newTurnCount >= maxTurns && result.confidence >= 0.4) ||
          (result.confidence >= 0.6);

        if (shouldDoReadback) {
          // Move to readback phase - show summary for confirmation
          setPhase("readback");
          const readbackMsg = generateReadbackMessage(result);
          setTimeout(() => {
            addMessage("vicu", readbackMsg);
          }, 300);
          return;
        }

        // AI needs more info - use its specific questions
        if (result.needs_clarification && result.clarifying_questions.length > 0) {
          // Filter out questions that were already asked
          const newQuestions = result.clarifying_questions.filter(
            q => !isQuestionAlreadyAsked(q)
          );

          // Prepend search context if we found useful data
          const searchPrefix = buildSearchContextPrefix(result);

          if (newQuestions.length > 0) {
            // Ask only 1 question at a time to avoid overwhelming
            const questionToAsk = newQuestions[0];

            // Check it's not identical to the last message
            const lastMessage = getLastVicuMessage();
            if (normalizeQuestion(questionToAsk) === normalizeQuestion(lastMessage)) {
              // Skip this question, try the next one or move forward
              if (newQuestions.length > 1) {
                const altQuestion = newQuestions[1];
                const messageWithContext = searchPrefix + altQuestion;
                setTimeout(() => {
                  addMessage("vicu", messageWithContext);
                  setAskedQuestions(prev => new Set([...prev, normalizeQuestion(altQuestion)]));
                }, 300);
              } else if (result.confidence >= 0.5) {
                // Enough context, proceed to readback
                setPhase("readback");
                const readbackMsg = generateReadbackMessage(result);
                setTimeout(() => {
                  addMessage("vicu", readbackMsg);
                }, 300);
              }
            } else {
              const messageWithContext = searchPrefix + questionToAsk;
              setTimeout(() => {
                addMessage("vicu", messageWithContext);
                setAskedQuestions(prev => new Set([...prev, normalizeQuestion(questionToAsk)]));
              }, 300);
            }
          } else {
            // All questions already asked - move to readback
            setPhase("readback");
            const readbackMsg = generateReadbackMessage(result);
            setTimeout(() => {
              addMessage("vicu", readbackMsg);
            }, 300);
          }
        }
        // AI has enough context - move to readback
        else if (result.confidence >= 0.5) {
          setPhase("readback");
          const readbackMsg = generateReadbackMessage(result);
          setTimeout(() => {
            addMessage("vicu", readbackMsg);
          }, 300);
        }
        // Low confidence but no clarifying questions
        else {
          // Ask a contextual question to gather more info
          if (newTurnCount < 3) {
            const contextualPrompt = "¿Hay algo más que deba saber sobre este proyecto? Por ejemplo, plazos, recursos disponibles, o qué sería un resultado mínimo exitoso.";
            if (!isQuestionAlreadyAsked(contextualPrompt)) {
              setTimeout(() => {
                addMessage("vicu", contextualPrompt);
                setAskedQuestions(prev => new Set([...prev, normalizeQuestion(contextualPrompt)]));
              }, 300);
            } else {
              // Move to readback anyway
              setPhase("readback");
              const readbackMsg = generateReadbackMessage(result);
              setTimeout(() => {
                addMessage("vicu", readbackMsg);
              }, 300);
            }
          } else {
            // After 3 turns, move to readback
            setPhase("readback");
            const readbackMsg = generateReadbackMessage(result);
            setTimeout(() => {
              addMessage("vicu", readbackMsg);
            }, 300);
          }
        }
      } else {
        // Analysis failed - use a unique fallback
        const fallbackPrompt = "Cuéntame un poco más. ¿Qué es exactamente lo que quieres lograr con este proyecto?";
        if (!isQuestionAlreadyAsked(fallbackPrompt)) {
          setTimeout(() => {
            addMessage("vicu", fallbackPrompt);
            setAskedQuestions(prev => new Set([...prev, normalizeQuestion(fallbackPrompt)]));
          }, 300);
        } else {
          // Even fallback was used - try to analyze again and proceed
          setPhase("readback");
          setTimeout(() => {
            addMessage(
              "vicu",
              "📋 **Voy a repetir lo que entendí:**\n\nParece que quieres trabajar en un proyecto personal. ¿Podrías confirmarme qué es exactamente lo que buscas lograr?"
            );
          }, 300);
        }
      }
    }
  };

  // Handler for readback confirmation
  const handleConfirmReadback = () => {
    setReadbackConfirmed(true);
    setPhase("ready");
    addMessage("vicu", "¡Perfecto! Todo listo. Revisa el resumen final abajo y crea tu proyecto.");
  };

  const createExperiment = async () => {
    if (!analysis) return;

    setPhase("creating");

    try {
      // Use the new classification directly - experiment_type is already in DB format
      const dbExperimentType =
        analysis.context === "team" || analysis.experiment_type === "equipo"
          ? "equipo"
          : analysis.experiment_type === "validacion"
            ? "validacion"
            : "clientes";

      // Surface type comes directly from analysis with new rules applied
      const surfaceType = analysis.surface_type || "ritual"; // Default to ritual, not landing

      const metricMatch = analysis.success_metric?.match(/(\d+)\s*(.+)/);
      const successGoalNumber = metricMatch ? parseInt(metricMatch[1], 10) : null;
      const successGoalUnit = metricMatch ? metricMatch[2].trim().toLowerCase() : null;

      const rawIdea = messages.find((m) => m.role === "user")?.content || "";

      // Build rich description with context bullets
      const contextBullets = analysis.context_bullets?.length
        ? `\n\nContexto:\n${analysis.context_bullets.map(b => `• ${b}`).join("\n")}`
        : "";
      const richDescription = (analysis.summary || rawIdea) + contextBullets;

      const experimentRes = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: richDescription,
          project_type: "external",
          experiment_type: dbExperimentType,
          surface_type: surfaceType,
          context: analysis.context, // Pass context for rhythm calculation
          target_audience: analysis.target_audience,
          main_pain: analysis.main_pain,
          main_promise: analysis.promise,
          main_cta: analysis.desired_action,
          success_goal_number: successGoalNumber,
          success_goal_unit: successGoalUnit,
          generated_title: analysis.generated_title,
          raw_idea: rawIdea,
          deadline: analysis.deadline_date,
          deadline_source: analysis.deadline_date ? "ai_suggested" : null,
          // New fields for better context
          first_steps: analysis.first_steps || [],
          detected_category: analysis.detected_category || null,
          detected_subject: analysis.detected_subject || null,
          // Project phases for macro breakdown
          phases: analysis.phases || [],
        }),
      });

      const experimentData = await experimentRes.json();

      if (!experimentData.success || !experimentData.experiment) {
        throw new Error("Failed to create experiment");
      }

      const experimentId = experimentData.experiment.id;

      setExperiment(experimentId, {
        successGoalNumber,
        successGoalUnit,
        experimentType: dbExperimentType as "clientes" | "validacion" | "equipo",
        surfaceType: surfaceType as "landing" | "messages" | "ritual",
      });

      if (surfaceType === "landing") {
        const copyRes = await fetch("/api/generate-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: analysis.summary,
            experiment_type: dbExperimentType,
            target_audience: analysis.target_audience,
            main_pain: analysis.main_pain,
            main_promise: analysis.promise,
            main_cta: analysis.desired_action,
          }),
        });

        const copyData = await copyRes.json();
        if (copyData.success && copyData.copy) {
          setCopy(copyData.copy);
        }
      }

      // Generate attack plan (for landing/messages experiments) - fire and forget
      fetch("/api/experiment-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment: {
            id: experimentId,
            title: experimentData.experiment.title,
            description: analysis.summary,
            experiment_type: dbExperimentType,
            surface_type: surfaceType,
            target_audience: analysis.target_audience,
            main_pain: analysis.main_pain,
            main_promise: analysis.promise,
            main_cta: analysis.desired_action,
            success_goal_number: successGoalNumber,
            success_goal_unit: successGoalUnit,
            deadline: analysis.deadline_date,
          },
        }),
      }).catch((err) => {
        console.error("Error generating attack plan:", err);
      });

      // Initial steps are now generated automatically by the /api/experiments endpoint
      // No need to call generate-initial-steps separately - it's centralized in the backend

      router.push(`/experiments/${experimentId}`);
    } catch (error) {
      console.error("Error creating experiment:", error);
      setPhase("error");
      addMessage("vicu", "Hubo un problema creando el experimento. Inténtalo de nuevo.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (phase === "ready") {
        createExperiment();
      } else {
        handleSendMessage();
      }
    }
  };

  // Calculate progress based on slot state (more accurate than analysis fields)
  const getProgressSteps = () => {
    return countCompletedSlots(slots);
  };

  const currentProgress = getProgressSteps();

  // Get progress label for the UI
  const getProgressLabel = (): string => {
    if (phase === "readback") return "Confirmando objetivo";
    if (phase === "ready") return "Listo para crear";
    if (phase === "creating") return "Creando proyecto...";
    if (currentProgress === 0) return "Cuéntame tu idea";
    if (currentProgress === 1) return "Entendiendo el objetivo";
    if (currentProgress === 2) return "Recogiendo contexto";
    if (currentProgress === 3) return "Definiendo alcance";
    if (currentProgress === 4) return "Últimos detalles";
    return "Casi listo";
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] safe-area-top">
      {/* Header */}
      <header className="flex-shrink-0">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-3 sm:pb-4">
          {/* Logo + Title + Nav in same row */}
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/hoy" className="flex-shrink-0">
                <Image
                  src="/vicu-logo.png"
                  alt="Vicu"
                  width={32}
                  height={32}
                  className="h-7 w-7 sm:h-8 sm:w-8"
                />
              </Link>
              <h1 className="text-base sm:text-lg md:text-xl font-semibold text-slate-50 tracking-tight truncate">
                Nuevo objetivo
              </h1>
            </div>
            <Link
              href="/hoy"
              className="flex-shrink-0 text-xs sm:text-sm text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1 touch-target"
            >
              <span className="hidden sm:inline">Mis objetivos</span>
              <span className="sm:hidden">Hoy</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="card-premium px-3 sm:px-5 py-3 sm:py-4">
            {/* Progress header with label */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-300 text-sm font-medium">
                {getProgressLabel()}
              </p>
              <span className="text-xs text-slate-500 font-medium">
                {phase === "readback" || phase === "ready" ? "✓" : `${currentProgress}/${TOTAL_SLOTS}`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 sm:h-2 flex-1 rounded-full transition-all duration-500 ${
                    phase === "readback" || phase === "ready"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                      : i < currentProgress
                        ? "bg-gradient-to-r from-indigo-500 to-indigo-400"
                        : "bg-white/10"
                  }`}
                />
              ))}
            </div>
            {phase === "conversation" && currentProgress === 0 && (
              <p className="text-slate-500 text-xs mt-2">
                Máximo 5 preguntas para entender bien tu objetivo
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          {/* Chat card */}
          <div className="card-premium rounded-2xl sm:rounded-3xl px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} ${
                    message.role === "user" ? "animate-slide-in-right" : "animate-slide-in-left"
                  }`}
                >
                  {message.role === "vicu" && (
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center mr-2 sm:mr-3 overflow-hidden">
                      <Image src="/vicu-logo.png" alt="Vicu" width={28} height={28} className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] ${
                      message.role === "user"
                        ? "bg-indigo-500 text-white rounded-2xl rounded-br-md px-3 sm:px-4 py-2.5 sm:py-3"
                        : "bg-slate-900/70 border border-white/10 rounded-2xl rounded-bl-md px-3 sm:px-4 py-2.5 sm:py-3"
                    }`}
                  >
                    <p className={`whitespace-pre-wrap text-sm leading-relaxed ${
                      message.role === "vicu" ? "text-slate-200" : ""
                    }`}>
                      {message.content}
                    </p>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isAnalyzing && (
                <div className="flex justify-start animate-fade-in">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mr-3 overflow-hidden">
                    <Image src="/vicu-logo.png" alt="Vicu" width={28} height={28} className="w-6 h-6" />
                  </div>
                  <div className="bg-slate-900/70 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Readback state - Show confirmation button that creates directly */}
              {phase === "readback" && !isAnalyzing && analysis && (
                <div className="pt-4 animate-fade-in-up">
                  <button
                    onClick={() => {
                      // Skip "ready" phase - go directly to creating
                      setPhase("creating");
                      addMessage("vicu", "¡Perfecto! Creando tu proyecto...");
                      createExperiment();
                    }}
                    className="w-full px-6 py-4 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-400 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Crear proyecto
                  </button>
                  <p className="text-center text-slate-500 text-xs mt-3">
                    Si algo no está bien, escribe tu corrección abajo
                  </p>
                </div>
              )}

              {/* Ready state - Show Brief Card + Create button */}
              {phase === "ready" && !isAnalyzing && analysis && (
                <div className="space-y-4 pt-4 animate-fade-in-up">
                  {/* Brief Card */}
                  <div className="card-premium rounded-2xl px-5 py-5 border-indigo-500/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                        <Image src="/vicu-logo.png" alt="Vicu" width={20} height={20} className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Resumen de tu proyecto</h3>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-semibold text-slate-50 mb-3">
                      {analysis.generated_title || "Tu proyecto"}
                    </h2>

                    {/* Objective */}
                    {analysis.summary && (
                      <p className="text-slate-300 text-sm mb-4 leading-relaxed">
                        {analysis.summary}
                      </p>
                    )}

                    {/* Context bullets */}
                    {analysis.context_bullets && analysis.context_bullets.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Contexto</p>
                        <ul className="space-y-1.5">
                          {analysis.context_bullets.map((bullet, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                              <span className="text-indigo-400 mt-1">•</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* First steps */}
                    {analysis.first_steps && analysis.first_steps.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Primeros pasos</p>
                        <ul className="space-y-1.5">
                          {analysis.first_steps.map((step, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-medium text-indigo-400">
                                {idx + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Meta info row */}
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-white/5">
                      {analysis.success_metric && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Meta: {analysis.success_metric}
                        </span>
                      )}
                      {analysis.suggested_deadline && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Horizonte: {analysis.suggested_deadline}
                        </span>
                      )}
                      {analysis.detected_category && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/10">
                          {analysis.detected_category === "health" ? "Salud" :
                           analysis.detected_category === "business" ? "Negocio" :
                           analysis.detected_category === "career" ? "Carrera" :
                           analysis.detected_category === "learning" ? "Aprendizaje" :
                           analysis.detected_category === "habits" ? "Hábitos" :
                           analysis.detected_category === "creative" ? "Creativo" :
                           analysis.detected_category === "team" ? "Equipo" :
                           "Proyecto"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Create button */}
                  <div className="flex justify-center">
                    <button
                      onClick={createExperiment}
                      className="px-8 py-4 rounded-full bg-indigo-500 text-white font-medium text-lg hover:bg-indigo-400 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/25"
                    >
                      Crear mi proyecto →
                    </button>
                  </div>
                </div>
              )}

              {/* Creating state - Loader with animated logo */}
              {phase === "creating" && (
                <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                  <div className="relative mb-6">
                    {/* Spinning ring */}
                    <div className="w-20 h-20 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                    {/* Logo in center */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden animate-pulse">
                        <Image src="/vicu-logo.png" alt="Vicu" width={40} height={40} className="w-8 h-8" />
                      </div>
                    </div>
                  </div>
                  <p className="text-xl font-medium text-slate-50 text-center mb-2">
                    {LOADING_MESSAGES[loadingMessageIndex].main}
                  </p>
                  <p className="text-sm text-slate-400">
                    {LOADING_MESSAGES[loadingMessageIndex].sub}
                  </p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>
      </main>

      {/* Input area */}
      {(phase === "conversation" || phase === "readback" || phase === "ready") && !isAnalyzing && (
        <footer className="flex-shrink-0 pb-4 sm:pb-6 safe-area-bottom">
          <div className="max-w-3xl mx-auto px-3 sm:px-4">
            <div className="card-glass rounded-full px-2 py-1.5 sm:py-2 flex items-center gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  phase === "ready"
                    ? "¿Algo más?"
                    : phase === "readback"
                      ? "Escribe tu corrección aquí..."
                      : "Escribe tu idea..."
                }
                rows={1}
                className="flex-1 px-3 sm:px-4 py-2 bg-transparent text-slate-50 resize-none text-sm focus:outline-none placeholder-slate-500"
                style={{ fontSize: "16px" }} // Prevent iOS zoom
              />
              <button
                onClick={phase === "ready" ? createExperiment : handleSendMessage}
                disabled={(phase === "conversation" || phase === "readback") && !inputValue.trim()}
                className="p-2.5 sm:p-2.5 rounded-full bg-indigo-500 text-white hover:bg-indigo-400 transition-all duration-200 disabled:opacity-30 disabled:hover:bg-indigo-500 touch-target"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Debug panel */}
      {process.env.NODE_ENV === "development" && analysis && (
        <div className="fixed bottom-20 right-4 max-w-xs p-3 card-glass text-slate-300 rounded-lg text-xs font-mono overflow-auto max-h-48 opacity-50 hover:opacity-100 transition-opacity">
          <div>context: {analysis.context}</div>
          <div>type: {analysis.experiment_type}</div>
          <div>surface: {analysis.surface_type}</div>
          <div>confidence: {(analysis.confidence * 100).toFixed(0)}%</div>
          <div>needs_clarification: {analysis.needs_clarification ? "yes" : "no"}</div>
        </div>
      )}
    </div>
  );
}
