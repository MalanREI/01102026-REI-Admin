"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/src/lib/supabase/browser";

type RecordingState = {
  isRecording: boolean;
  recSeconds: number;
  recBusy: boolean;
  recErr: string | null;
  activeMeetingId: string | null;
  activeSessionId: string | null;
  activeMeetingTitle: string | null;
};

type RecordingActions = {
  startRecording: (params: {
    meetingId: string;
    sessionId: string;
    meetingTitle: string;
  }) => Promise<void>;
  stopRecordingAndUpload: () => Promise<{ recordingPath: string } | null>;
  concludeMeeting: () => Promise<void>;
  clearError: () => void;
};

type RecordingContextValue = RecordingState & RecordingActions;

const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording(): RecordingContextValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recBusy, setRecBusy] = useState(false);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<number | null>(null);

  // Keep refs so callbacks can read current values without stale closures.
  const recSecondsRef = useRef(0);
  const activeMeetingIdRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeMeetingTitleRef = useRef<string | null>(null);

  useEffect(() => {
    recSecondsRef.current = recSeconds;
  }, [recSeconds]);

  useEffect(() => {
    activeMeetingIdRef.current = activeMeetingId;
    activeSessionIdRef.current = activeSessionId;
    activeMeetingTitleRef.current = activeMeetingTitle;
  }, [activeMeetingId, activeSessionId, activeMeetingTitle]);

  // Cleanup on unmount (app close)
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Warn before closing browser tab while recording
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault();
        e.returnValue = "Recording is still in progress. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRecording]);

  const stopRecordingAndUpload = useCallback(async (): Promise<{ recordingPath: string } | null> => {
    if (!mediaRecorderRef.current) return null;
    setRecBusy(true);
    setRecErr(null);

    try {
      const mr = mediaRecorderRef.current;

      // Wait for the "stop" event so the last chunk flushes before building the blob.
      const stopped = new Promise<void>((resolve) => {
        const prev = mr.onstop;
        mr.onstop = function (ev: Event) {
          try {
            if (typeof prev === "function") prev.call(mr, ev);
          } finally {
            resolve();
          }
        };
      });

      mr.stop();
      await stopped;

      mediaRecorderRef.current = null;
      setIsRecording(false);
      if (tickRef.current) window.clearInterval(tickRef.current);

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const currentMeetingId = activeMeetingIdRef.current;
      const currentSessionId = activeSessionIdRef.current;
      const currentSeconds = recSecondsRef.current;

      if (!currentMeetingId || !currentSessionId) {
        throw new Error("No active meeting/session for upload.");
      }

      const form = new FormData();
      form.append("meetingId", currentMeetingId);
      form.append("sessionId", currentSessionId);
      form.append("durationSeconds", String(currentSeconds));
      try {
        const sb = supabaseBrowser();
        const u = await sb.auth.getUser();
        const uid = u.data?.user?.id || "";
        if (uid) form.append("userId", uid);
      } catch {
        // ignore
      }
      form.append("file", blob, "recording.webm");

      const upRes = await fetch("/api/meetings/ai/upload-recording", { method: "POST", body: form });
      interface UploadResponse {
        error?: string;
        recordingPath?: string;
      }
      const upJson = await upRes.json().catch((): UploadResponse => ({}));
      if (!upRes.ok) throw new Error(upJson?.error || "Recording upload failed");

      const rp = String(upJson?.recordingPath || "");
      if (!rp) throw new Error("Recording upload failed (no path returned)");

      return { recordingPath: rp };
    } catch (e: unknown) {
      const error = e as Error;
      setRecErr(error?.message ?? "Upload failed");
      return null;
    } finally {
      setRecBusy(false);
    }
  }, []);

  const startRecording = useCallback(
    async ({ meetingId, sessionId, meetingTitle }: { meetingId: string; sessionId: string; meetingTitle: string }) => {
      setRecErr(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);

        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
        };

        mr.start(1000);
        mediaRecorderRef.current = mr;

        setActiveMeetingId(meetingId);
        setActiveSessionId(sessionId);
        setActiveMeetingTitle(meetingTitle);
        setIsRecording(true);
        setRecSeconds(0);
        recSecondsRef.current = 0;

        const segmentSeconds = Math.max(
          60,
          Number(process.env.NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS || "240")
        );

        tickRef.current = window.setInterval(() => {
          setRecSeconds((s) => {
            const next = s + 1;
            recSecondsRef.current = next;

            // Safety cap (2 hours)
            if (next >= 7200) {
              setTimeout(() => void stopRecordingAndUpload().catch((e: unknown) => {
                setRecErr((e as Error)?.message ?? "Auto-stop failed");
              }), 0);
            }

            // Auto-segment to keep recordings small enough for transcription on long meetings.
            if (segmentSeconds && next > 0 && next % segmentSeconds === 0) {
              setTimeout(
                () =>
                  void (async () => {
                    const up = await stopRecordingAndUpload();
                    if (up) {
                      // Read current meeting info from refs to avoid stale closures
                      const currentMeetingId = activeMeetingIdRef.current;
                      const currentSessionId = activeSessionIdRef.current;
                      const currentTitle = activeMeetingTitleRef.current;
                      if (currentMeetingId && currentSessionId && currentTitle) {
                        await startRecording({
                          meetingId: currentMeetingId,
                          sessionId: currentSessionId,
                          meetingTitle: currentTitle,
                        });
                      }
                    }
                  })(),
                0
              );
            }

            return next;
          });
        }, 1000);
      } catch (e: unknown) {
        const error = e as Error;
        setRecErr(error?.message ?? "Could not start recording");
      }
    },
    [stopRecordingAndUpload]
  );

  const concludeMeeting = useCallback(async () => {
    if (isRecording) {
      await stopRecordingAndUpload();
    }

    // Reset recording state
    setActiveMeetingId(null);
    setActiveSessionId(null);
    setActiveMeetingTitle(null);
    setIsRecording(false);
    setRecSeconds(0);
    recSecondsRef.current = 0;
  }, [isRecording, stopRecordingAndUpload]);

  const clearError = useCallback(() => setRecErr(null), []);

  return (
    <RecordingContext.Provider
      value={{
        isRecording,
        recSeconds,
        recBusy,
        recErr,
        activeMeetingId,
        activeSessionId,
        activeMeetingTitle,
        startRecording,
        stopRecordingAndUpload,
        concludeMeeting,
        clearError,
      }}
    >
      {children}
    </RecordingContext.Provider>
  );
}
