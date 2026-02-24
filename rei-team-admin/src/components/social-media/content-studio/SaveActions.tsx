"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui";
import { createContentPost } from "@/src/lib/supabase/social-media-queries";

type Props = {
  content: string;
  imageUrl?: string;
  contentTypeId?: string;
  brandVoiceId?: string;
  targetPlatforms: string[];
  aiModelUsed?: string;
  aiPromptUsed?: string;
  userId: string;
  onSaved?: (postId: string) => void;
};

export function SaveActions({
  content,
  imageUrl,
  contentTypeId,
  brandVoiceId,
  targetPlatforms,
  aiModelUsed,
  aiPromptUsed,
  userId,
  onSaved,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [savedAs, setSavedAs] = useState<string>("");

  async function save(status: "draft" | "pending_approval") {
    if (!content) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const post = await createContentPost({
        title: null,
        body: content,
        content_type_id: contentTypeId || null,
        brand_voice_id: brandVoiceId || null,
        status,
        target_platforms: targetPlatforms,
        media_urls: imageUrl ? [imageUrl] : null,
        media_type: imageUrl ? "image" : "none",
        ai_model_used: aiModelUsed || null,
        ai_prompt_used: aiPromptUsed || null,
        platform_specific_content: null,
        created_by: userId,
      });
      setSaveStatus("saved");
      setSavedAs(status === "draft" ? "draft" : "pending approval");
      onSaved?.(post.id);
    } catch (e) {
      console.error("Save failed:", e);
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }

  if (!content) return null;

  return (
    <div className="space-y-2 p-4 border-t border-white/[0.06]">
      <p className="text-xs text-slate-500">Save generated content:</p>
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => save("draft")}
          disabled={isSaving}
          variant="ghost"
          className="text-xs py-1.5"
        >
          {isSaving ? "Saving…" : "Save as Draft"}
        </Button>
        <Button
          onClick={() => save("pending_approval")}
          disabled={isSaving}
          className="text-xs py-1.5"
        >
          {isSaving ? "Saving…" : "Submit for Approval"}
        </Button>
        <Button
          disabled
          variant="ghost"
          className="text-xs py-1.5 opacity-50 cursor-not-allowed"
          title="Coming in Phase 2"
        >
          Save &amp; Schedule
        </Button>
      </div>

      {saveStatus === "saved" && (
        <p className="text-xs text-emerald-400">✓ Saved as {savedAs}</p>
      )}
      {saveStatus === "error" && (
        <p className="text-xs text-red-400">Failed to save. Please try again.</p>
      )}
    </div>
  );
}
