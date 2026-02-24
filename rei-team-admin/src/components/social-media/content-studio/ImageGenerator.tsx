"use client";

import { useState } from "react";
import { Button, Input } from "@/src/components/ui";

type Props = {
  postContent: string;
  currentImageUrl?: string;
  userId: string;
  onImageGenerated: (url: string) => void;
};

export function ImageGenerator({ postContent, currentImageUrl, userId, onImageGenerated }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: customPrompt || undefined,
          post_text: postContent,
          generated_by: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Image generation failed");
        return;
      }
      onImageGenerated(data.url);
    } catch {
      setError("Network error");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-medium text-slate-300">Image Generator</h3>

      {currentImageUrl && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Current image:</p>
          <img src={currentImageUrl} alt="Generated" className="w-full rounded-xl border border-white/10 max-h-48 object-cover" />
        </div>
      )}

      <div className="space-y-2">
        <Input
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Custom image prompt (optional)…"
          className="text-xs"
        />
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !postContent}
          className="w-full"
        >
          {isGenerating ? "Generating…" : "🖼 Generate Image with DALL-E 3"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
