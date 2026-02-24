"use client";

import { useState, useCallback, useEffect } from "react";
import { PageShell } from "@/src/components/PageShell";
import { ChatInterface } from "@/src/components/social-media/content-studio/ChatInterface";
import { ConfigPanel } from "@/src/components/social-media/content-studio/ConfigPanel";
import { PostPreview } from "@/src/components/social-media/content-studio/PostPreview";
import { BulkGenerationView } from "@/src/components/social-media/content-studio/BulkGenerationView";
import { ImageGenerator } from "@/src/components/social-media/content-studio/ImageGenerator";
import { SaveActions } from "@/src/components/social-media/content-studio/SaveActions";
import { GenerationHistory } from "@/src/components/social-media/content-studio/GenerationHistory";
import { Message } from "@/src/components/social-media/content-studio/ChatMessage";
import {
  getContentTypes,
  getBrandVoices,
} from "@/src/lib/supabase/social-media-queries";
import type { ContentType, BrandVoice } from "@/src/lib/types/social-media";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

type BulkPost = {
  id: string;
  content: string;
  approved: boolean;
  rejected: boolean;
};

const MODEL_ROUTING: Record<string, string> = {
  "daily-tips": "claude-sonnet",
  "weekly-newsletter": "gpt-4o",
  "mythbusters": "claude-sonnet",
  "market-updates": "gpt-4o",
  "testimonials": "claude-sonnet",
  "holiday-seasonal": "gpt-4o",
  "cta": "gpt-4o",
};

export default function ContentStudioPage() {
  // Data
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [brandVoices, setBrandVoices] = useState<BrandVoice[]>([]);
  const [userId, setUserId] = useState("");

  // Config
  const [selectedContentTypeId, setSelectedContentTypeId] = useState("");
  const [selectedBrandVoiceId, setSelectedBrandVoiceId] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [modelOverride, setModelOverride] = useState("");

  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generatingImageForId, setGeneratingImageForId] = useState<string | null>(null);

  // Latest generated content for preview/save
  const [latestContent, setLatestContent] = useState("");
  const [latestPrompt, setLatestPrompt] = useState("");
  const [latestModel, setLatestModel] = useState("");
  const [latestImageUrl, setLatestImageUrl] = useState<string | undefined>(undefined);

  // Bulk mode
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkPosts, setBulkPosts] = useState<BulkPost[]>([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  // Load data
  useEffect(() => {
    getContentTypes().then(setContentTypes).catch(console.error);
    getBrandVoices().then(setBrandVoices).catch(console.error);
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  const handleSend = useCallback(async (text: string) => {
    // Inline helpers so all deps are captured by useCallback
    const getContentTypeName = () => {
      const ct = contentTypes.find((t) => t.id === selectedContentTypeId);
      if (!ct) return "custom";
      return ct.name.toLowerCase().replace(/\s+/g, "-");
    };
    const resolveModel = () => {
      if (modelOverride) return modelOverride;
      return MODEL_ROUTING[getContentTypeName()] ?? "gpt-4o";
    };
    const getBrandVoicePrompt = () => {
      const bv = brandVoices.find((v) => v.id === selectedBrandVoiceId);
      return bv?.system_prompt ?? "";
    };
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setLatestPrompt(text);

    // Check for bulk pattern
    const bulkMatch = text.match(/generate\s+(\d+)\s+/i);
    if (bulkMatch && parseInt(bulkMatch[1]) > 3) {
      const count = Math.min(parseInt(bulkMatch[1]), 52);
      setIsBulkMode(true);
      setIsBulkLoading(true);
      setIsLoading(false);

      try {
        const bv = brandVoices.find((v) => v.id === selectedBrandVoiceId);
        const res = await fetch("/api/ai/generate-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            count,
            content_type: getContentTypeName(),
            brand_voice: bv?.name,
            target_platforms: selectedPlatforms,
            model_override: modelOverride || undefined,
            generated_by: userId || "anonymous",
          }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.posts)) {
          const posts: BulkPost[] = data.posts.map((p: string) => ({
            id: crypto.randomUUID(),
            content: p,
            approved: false,
            rejected: false,
          }));
          setBulkPosts(posts);
          const aiMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Generated ${posts.length} posts! Review them in the bulk view on the right. ✓`,
            model: data.model,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        } else {
          const aiMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.error ?? "Bulk generation failed.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMsg]);
        }
      } catch {
        const aiMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Network error during bulk generation.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } finally {
        setIsBulkLoading(false);
      }
      return;
    }

    // Single generation
    try {
      const bv = brandVoices.find((v) => v.id === selectedBrandVoiceId);
      const res = await fetch("/api/ai/generate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          content_type: getContentTypeName(),
          brand_voice: bv?.name,
          system_prompt: getBrandVoicePrompt() || undefined,
          target_platforms: selectedPlatforms,
          model_override: modelOverride || undefined,
          generated_by: userId || "anonymous",
        }),
      });
      const data = await res.json();
      const modelUsed = data.model ?? resolveModel();
      const generatedText = data.text ?? data.error ?? "Generation failed.";

      if (res.ok) {
        setLatestContent(generatedText);
        setLatestModel(modelUsed);
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: generatedText,
        model: modelUsed,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Network error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedContentTypeId, selectedBrandVoiceId, selectedPlatforms, modelOverride, brandVoices, contentTypes, userId]);

  const handleGenerateImage = useCallback(async (messageId: string, content: string) => {
    setGeneratingImageForId(messageId);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_text: content, generated_by: userId || "anonymous" }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setLatestImageUrl(data.url);
        setMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, imageUrl: data.url } : m)
        );
      }
    } catch {
      // ignore
    } finally {
      setGeneratingImageForId(null);
    }
  }, [userId]);

  function handleSaveAllBulk(posts: BulkPost[]) {
    const ctName = (() => {
      const ct = contentTypes.find((t) => t.id === selectedContentTypeId);
      if (!ct) return "custom";
      return ct.name.toLowerCase().replace(/\s+/g, "-");
    })();
    const model = modelOverride || MODEL_ROUTING[ctName] || "gpt-4o";
    // Save each approved post as draft
    Promise.all(posts.map(async (post) => {
      try {
        const { createContentPost } = await import("@/src/lib/supabase/social-media-queries");
        await createContentPost({
          title: null,
          body: post.content,
          content_type_id: selectedContentTypeId || null,
          brand_voice_id: selectedBrandVoiceId || null,
          status: "draft",
          target_platforms: selectedPlatforms,
          media_urls: null,
          media_type: "none",
          ai_model_used: model,
          ai_prompt_used: latestPrompt,
          platform_specific_content: null,
          created_by: userId,
        });
      } catch (e) {
        console.error("Failed to save bulk post:", e);
      }
    })).catch(console.error);
  }

  return (
    <PageShell>
      <div className="flex flex-col h-[calc(100vh-112px)] space-y-0 -m-6">
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">AI Content Studio</h1>
            <p className="text-sm text-slate-400 mt-0.5">Generate social media content with AI</p>
          </div>
          <button
            onClick={() => setIsBulkMode(!isBulkMode)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              isBulkMode
                ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400"
                : "border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20"
            }`}
          >
            {isBulkMode ? "✓ Bulk Mode" : "Bulk Mode"}
          </button>
        </div>

        {/* Main split layout */}
        <div className="flex flex-1 min-h-0 border-t border-white/[0.06]">
          {/* Left panel: Chat (60%) */}
          <div className="w-[60%] flex flex-col min-h-0 border-r border-white/[0.06]">
            <ChatInterface
              messages={messages}
              isLoading={isLoading}
              onSend={handleSend}
              onGenerateImage={handleGenerateImage}
              generatingImageForId={generatingImageForId}
            />
          </div>

          {/* Right panel: Config + Preview (40%) */}
          <div className="w-[40%] flex flex-col min-h-0 overflow-y-auto">
            {/* Config section */}
            <div className="border-b border-white/[0.06] shrink-0">
              <ConfigPanel
                contentTypes={contentTypes}
                brandVoices={brandVoices}
                selectedContentTypeId={selectedContentTypeId}
                selectedBrandVoiceId={selectedBrandVoiceId}
                selectedPlatforms={selectedPlatforms}
                modelOverride={modelOverride}
                onContentTypeChange={setSelectedContentTypeId}
                onBrandVoiceChange={setSelectedBrandVoiceId}
                onPlatformsChange={setSelectedPlatforms}
                onModelOverrideChange={setModelOverride}
              />
            </div>

            {/* Bulk or single preview */}
            {isBulkMode ? (
              <BulkGenerationView
                posts={bulkPosts}
                isLoading={isBulkLoading}
                onSaveAll={handleSaveAllBulk}
                onUpdatePost={(id, content) =>
                  setBulkPosts((prev) => prev.map((p) => p.id === id ? { ...p, content } : p))
                }
                onToggleApproval={(id, approved) =>
                  setBulkPosts((prev) => prev.map((p) => p.id === id ? { ...p, approved } : p))
                }
                onReject={(id) =>
                  setBulkPosts((prev) =>
                    prev.map((p) => p.id === id ? { ...p, rejected: !p.rejected, approved: false } : p)
                  )
                }
              />
            ) : (
              <>
                <PostPreview
                  content={latestContent}
                  imageUrl={latestImageUrl}
                  targetPlatforms={selectedPlatforms}
                  onEditContent={setLatestContent}
                />

                {latestContent && (
                  <div className="border-t border-white/[0.06] shrink-0">
                    <ImageGenerator
                      postContent={latestContent}
                      currentImageUrl={latestImageUrl}
                      userId={userId}
                      onImageGenerated={setLatestImageUrl}
                    />
                  </div>
                )}

                <SaveActions
                  content={latestContent}
                  imageUrl={latestImageUrl}
                  contentTypeId={selectedContentTypeId}
                  brandVoiceId={selectedBrandVoiceId}
                  targetPlatforms={selectedPlatforms}
                  aiModelUsed={latestModel}
                  aiPromptUsed={latestPrompt}
                  userId={userId}
                />
              </>
            )}

            {/* Generation History */}
            <div className="mt-auto shrink-0">
              <GenerationHistory />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
