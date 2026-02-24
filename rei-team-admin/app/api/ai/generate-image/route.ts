import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

// DALL-E 3 standard 1024x1024 image cost in USD
const DALLE3_IMAGE_COST = 0.04;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      prompt: string;
      post_text?: string;
      generated_by: string;
    };

    const { prompt, post_text, generated_by } = body;

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({
        error: "OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.",
        setup_required: true,
      }, { status: 503 });
    }

    const imagePrompt = prompt || (post_text
      ? `Create a professional real estate social media image for this post: ${post_text.slice(0, 200)}`
      : "Create a professional real estate social media image");

    const client = new OpenAI({ apiKey: openaiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: "No image returned" }, { status: 500 });
    }

    // Download and upload to Supabase Storage
    let storedUrl = imageUrl;
    try {
      const admin = supabaseAdmin();
      const imgRes = await fetch(imageUrl);
      const imgBlob = await imgRes.arrayBuffer();
      const fileName = `ai-generated/${Date.now()}.png`;
      const { data: uploadData, error: uploadErr } = await admin.storage
        .from("content-media")
        .upload(fileName, imgBlob, { contentType: "image/png", upsert: false });
      if (!uploadErr && uploadData) {
        const { data: publicData } = admin.storage.from("content-media").getPublicUrl(fileName);
        storedUrl = publicData.publicUrl;
      }
    } catch (storageErr) {
      console.error("Storage upload failed, using direct URL:", storageErr);
    }

    // Log to ai_generation_history
    try {
      const admin = supabaseAdmin();
      await admin.from("ai_generation_history").insert({
        prompt: imagePrompt,
        response: storedUrl,
        model_used: "dall-e-3",
        content_type: "image",
        tokens_used: null,
        cost_estimate: DALLE3_IMAGE_COST,
        generated_by,
      });
    } catch (logErr) {
      console.error("Failed to log image generation:", logErr);
    }

    return NextResponse.json({ url: storedUrl, original_url: imageUrl });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("generate-image error:", err);
    return NextResponse.json({ error: err.message ?? "Image generation failed" }, { status: 500 });
  }
}
