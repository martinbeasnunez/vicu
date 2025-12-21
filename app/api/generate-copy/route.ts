import { NextRequest, NextResponse } from "next/server";
import { generateExternalCopyFromAI } from "@/lib/ai";
import { generateExternalCopy } from "@/lib/generate-copy";
import { ExperimentType, EXPERIMENT_TYPE_CTA } from "@/lib/experiment-helpers";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { description, experiment_type, target_audience, main_pain, main_promise, main_cta } = data;

  if (!description || typeof description !== "string") {
    return NextResponse.json(
      { success: false, error: "Description is required" },
      { status: 400 }
    );
  }

  try {
    const copy = await generateExternalCopyFromAI({
      description,
      target_audience,
      main_pain,
      main_promise,
      main_cta,
    });

    // Override button text based on experiment type if provided
    if (experiment_type && EXPERIMENT_TYPE_CTA[experiment_type as ExperimentType]) {
      copy.boton = EXPERIMENT_TYPE_CTA[experiment_type as ExperimentType];
    }

    return NextResponse.json({ success: true, copy });
  } catch (error) {
    console.error("Error calling OpenAI:", error);

    // Fallback a la función local
    const fallbackCopy = generateExternalCopy(description);

    // Override button text based on experiment type if provided
    if (experiment_type && EXPERIMENT_TYPE_CTA[experiment_type as ExperimentType]) {
      fallbackCopy.boton = EXPERIMENT_TYPE_CTA[experiment_type as ExperimentType];
    }

    return NextResponse.json({
      success: true,
      copy: fallbackCopy,
      fallback: true,
    });
  }
}
