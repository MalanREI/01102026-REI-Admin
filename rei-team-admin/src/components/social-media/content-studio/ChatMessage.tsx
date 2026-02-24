"use client";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  imageUrl?: string;
  timestamp: Date;
};

type Props = {
  message: Message;
  onGenerateImage?: (messageId: string, content: string) => void;
  isGeneratingImage?: boolean;
};

export function ChatMessage({ message, onGenerateImage, isGeneratingImage }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
          isUser ? "bg-emerald-600 text-white" : "bg-elevated text-slate-300"
        }`}
      >
        {isUser ? "You" : "AI"}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? "bg-emerald-600 text-white rounded-tr-sm"
              : "bg-surface border border-white/[0.06] text-slate-200 rounded-tl-sm"
          }`}
        >
          {message.content}
        </div>

        {message.imageUrl && (
          <img
            src={message.imageUrl}
            alt="Generated"
            className="rounded-xl max-w-sm border border-white/10"
          />
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-slate-500">
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {message.model && (
            <span className="text-xs text-slate-600 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
              {message.model}
            </span>
          )}
          {!isUser && onGenerateImage && !message.imageUrl && (
            <button
              onClick={() => onGenerateImage(message.id, message.content)}
              disabled={isGeneratingImage}
              className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGeneratingImage ? "Generating image…" : "🖼 Generate Image"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
