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
      count: number;
      content_type?: string;
      brand_voice?: string;
      target_platforms?: string[];
      model_override?: string;
      generated_by: string;
    };

    const { prompt, count = 5, content_type = "custom", brand_voice, target_platforms, model_override, generated_by } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const safeCount = Math.min(Math.max(1, count), 52);
    const model = resolveModel(content_type, model_override);
    const isClaudeModel = model.startsWith("claude");

    const sysPrompt = [
      "You are a professional real estate social media content creator.",
      brand_voice ? `Brand voice: ${brand_voice}.` : "",
      target_platforms?.length ? `Target platforms: ${target_platforms.join(", ")}.` : "",
      `Generate exactly ${safeCount} unique, numbered social media posts. Format your response as a JSON array of strings.`,
      "Each post should be complete and ready to publish.",
    ].filter(Boolean).join(" ");

    const userPrompt = `${prompt}\n\nReturn a JSON array of exactly ${safeCount} post strings. Example format: ["Post 1 content...", "Post 2 content...", ...]`;

    let posts: string[] = [];
    let tokensUsed: number | null = null;
    let modelUsed = model;

    if (isClaudeModel) {
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return NextResponse.json({
          error: "Anthropic API key not configured. Please set ANTHROPIC_API_KEY.",
          setup_required: true,
        }, { status: 503 });
      }
      const client = new Anthropic({ apiKey: anthropicKey });
      const actualModel = model === "claude-sonnet" ? "claude-3-5-sonnet-20241022" : model;
      modelUsed = actualModel;
      const response = await client.messages.create({
        model: actualModel,
        max_tokens: 4096,
        system: sysPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const rawText = response.content[0].type === "text" ? response.content[0].text : "[]";
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
      try {
        const match = rawText.match(/\[[\s\S]*\]/);
        posts = match ? JSON.parse(match[0]) : [];
      } catch {
        posts = [];
      }
    } else {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return NextResponse.json({
          error: "OpenAI API key not configured. Please set OPENAI_API_KEY.",
          setup_required: true,
        }, { status: 503 });
      }
      const client = new OpenAI({ apiKey: openaiKey });
      modelUsed = "gpt-4o";
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
        response_format: { type: "json_object" },
      });
      const rawText = response.choices[0]?.message?.content ?? "{}";
      tokensUsed = response.usage?.total_tokens ?? null;
      try {
        const parsed = JSON.parse(rawText);
        posts = Array.isArray(parsed) ? parsed : (parsed.posts ?? parsed.items ?? []);
      } catch {
        posts = [];
      }
    }

    // Log to ai_generation_history
    try {
      const admin = supabaseAdmin();
      await admin.from("ai_generation_history").insert({
        prompt: userPrompt,
        response: JSON.stringify(posts),
        model_used: modelUsed,
        content_type,
        tokens_used: tokensUsed,
        cost_estimate: tokensUsed ? tokensUsed * 0.000002 : null,
        generated_by,
      });
    } catch (logErr) {
      console.error("Failed to log bulk generation:", logErr);
    }

    return NextResponse.json({ posts, model: modelUsed, tokens_used: tokensUsed, count: posts.length });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("generate-bulk error:", err);
    return NextResponse.json({ error: err.message ?? "Bulk generation failed" }, { status: 500 });
  }
}
