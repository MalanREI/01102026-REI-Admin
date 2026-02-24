import { NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

const MODEL_ROUTING: Record<string, string> = {
  "daily-tips": "claude-sonnet",
  "weekly-newsletter": "gpt-4o",
  "mythbusters": "claude-sonnet",
  "market-updates": "gpt-4o",
  "testimonials": "claude-sonnet",
  "holiday-seasonal": "gpt-4o",
  "cta": "gpt-4o",
};

function resolveModel(contentType: string, modelOverride?: string): string {
  if (modelOverride) return modelOverride;
  return MODEL_ROUTING[contentType] ?? "gpt-4o";
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      prompt: string;
      content_type?: string;
      brand_voice?: string;
      target_platforms?: string[];
      model_override?: string;
      system_prompt?: string;
      generated_by: string;
    };

    const { prompt, content_type = "custom", brand_voice, target_platforms, model_override, system_prompt, generated_by } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const model = resolveModel(content_type, model_override);
    const isClaudeModel = model.startsWith("claude");

    const sysPrompt = system_prompt ?? [
      "You are a professional real estate social media content creator.",
      brand_voice ? `Brand voice: ${brand_voice}.` : "",
      target_platforms?.length ? `Target platforms: ${target_platforms.join(", ")}.` : "",
      "Write engaging, platform-appropriate content. Be concise and impactful.",
    ].filter(Boolean).join(" ");

    let generatedText = "";
    let tokensUsed: number | null = null;
    let modelUsed = model;

    if (isClaudeModel) {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return NextResponse.json({
          error: "Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment variables.",
          setup_required: true,
        }, { status: 503 });
      }
      const client = new Anthropic({ apiKey: anthropicKey });
      const actualModel = model === "claude-sonnet" ? "claude-3-5-sonnet-20241022" : model;
      modelUsed = actualModel;
      const response = await client.messages.create({
        model: actualModel,
        max_tokens: 1024,
        system: sysPrompt,
        messages: [{ role: "user", content: prompt }],
      });
      generatedText = response.content[0].type === "text" ? response.content[0].text : "";
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    } else {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return NextResponse.json({
          error: "OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.",
          setup_required: true,
        }, { status: 503 });
      }
      const client = new OpenAI({ apiKey: openaiKey });
      const actualModel = model === "gpt-4o" ? "gpt-4o" : model;
      modelUsed = actualModel;
      const response = await client.chat.completions.create({
        model: actualModel,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 1024,
      });
      generatedText = response.choices[0]?.message?.content ?? "";
      tokensUsed = response.usage?.total_tokens ?? null;
    }

    // Log to ai_generation_history
    try {
      const admin = supabaseAdmin();
      await admin.from("ai_generation_history").insert({
        prompt,
        response: generatedText,
        model_used: modelUsed,
        content_type,
        tokens_used: tokensUsed,
        cost_estimate: tokensUsed ? tokensUsed * 0.000002 : null,
        generated_by,
      });
    } catch (logErr) {
      console.error("Failed to log AI generation:", logErr);
    }

    return NextResponse.json({ text: generatedText, model: modelUsed, tokens_used: tokensUsed });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("generate-text error:", err);
    return NextResponse.json({ error: err.message ?? "Generation failed" }, { status: 500 });
  }
}
