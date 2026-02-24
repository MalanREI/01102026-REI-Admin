import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { systemPrompt, name } = await req.json();
    if (!systemPrompt) return NextResponse.json({ error: "systemPrompt required" }, { status: 400 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Write a sample social media post for a real estate team using the "${name}" brand voice. Keep it under 150 words.`,
        },
      ],
      max_tokens: 300,
    });

    const result = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
