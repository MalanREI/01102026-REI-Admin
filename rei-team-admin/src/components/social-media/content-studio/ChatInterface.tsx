"use client";

import { useRef, useEffect, useState } from "react";
import { Message, ChatMessage } from "./ChatMessage";
import { Textarea, Button } from "@/src/components/ui";

type Props = {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onGenerateImage: (messageId: string, content: string) => void;
  generatingImageForId: string | null;
};

export function ChatInterface({ messages, isLoading, onSend, onGenerateImage, generatingImageForId }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-12">
            <div className="text-4xl">✨</div>
            <h3 className="text-slate-300 font-medium">AI Content Studio</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Chat with AI to generate social media content. Try something like:
            </p>
            <div className="space-y-2 text-left">
              {[
                "Write a daily tip about property valuation for Instagram",
                'Generate 5 weekly tips for Facebook about real estate investing',
                "Create a mythbusters post debunking the '20% down' myth",
                "Write a holiday post for Christmas about real estate",
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => { setInput(example); }}
                  className="block w-full text-left text-xs text-slate-400 hover:text-emerald-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors"
                >
                  {`"${example}"`}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onGenerateImage={onGenerateImage}
            isGeneratingImage={generatingImageForId === msg.id}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-xs text-slate-300">AI</div>
            <div className="bg-surface border border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-white/[0.06] p-4 space-y-2">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a daily tip about property valuation for Instagram…"
            rows={3}
            className="flex-1 resize-none"
            disabled={isLoading}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Shift+Enter for new line, Enter to send</span>
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? "Generating…" : "Send ↑"}
          </Button>
        </div>
      </div>
    </div>
  );
}
