import { NextRequest, NextResponse } from "next/server";
import { analyzeChat, ChatMessage } from "@/lib/vicu-analyzer";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { messages } = data as { messages: ChatMessage[] };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "Messages array is required" },
        { status: 400 }
      );
    }

    const analysis = await analyzeChat(messages);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Error analyzing chat:", error);
    return NextResponse.json(
      { success: false, error: "Failed to analyze chat" },
      { status: 500 }
    );
  }
}
