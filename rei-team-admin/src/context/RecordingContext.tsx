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
    audioDeviceId?: string;
    includeSystemAudio?: boolean;
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

/**
 * Upload a blob to the recording API. Returns the storage path or null on failure.
 * This is a pure helper — no state side-effects.
 */
async function uploadSegment(
  blob: Blob,
  meetingId: string,
  sessionId: string,
  durationSeconds: number
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("meetingId", meetingId);
    form.append("sessionId", sessionId);
    form.append("durationSeconds", String(durationSeconds));
    try {
      const sb = supabaseBrowser();
      const u = await sb.auth.getUser();
      const uid = u.data?.user?.id || "";
      if (uid) form.append("userId", uid);
    } catch {
      // ignore auth errors during upload
    }
    form.append("file", blob, `segment_${Date.now()}.webm`);

    const res = await fetch("/api/meetings/ai/upload-recording", { method: "POST", body: form });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.error("Segment upload failed:", j?.error || res.statusText);
      return null;
    }
    const j = await res.json().catch(() => ({}));
    return j?.recordingPath || null;
  } catch (e) {
    console.error("Segment upload error:", e);
    return null;
  }
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
  const streamRef = useRef<MediaStream | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const lastUploadedPathRef = useRef<string | null>(null);
  const isRotatingRef = useRef(false);
  /** Minimum allowed segment length to avoid excessively small uploads. */
  const MIN_SEGMENT_SECONDS = 60;

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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (tickRef.current) clearInterval(tickRef.current);
      if (segmentTimerRef.current) clearInterval(segmentTimerRef.current);
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

  /**
   * Rotate segment: stop current MediaRecorder, start a new one on the same
   * audio stream, and upload the harvested chunks in the background.
   * isRecording / recSeconds / tick timer are NOT touched — the user sees
   * uninterrupted recording throughout.
   */
  const rotateSegment = useCallback(async () => {
    if (isRotatingRef.current) return;
    const mr = mediaRecorderRef.current;
    const stream = streamRef.current;
    if (!mr || mr.state === "inactive" || !stream || !stream.active) return;

    isRotatingRef.current = true;
    try {
      // 1. Redirect old recorder's final flush to a temp array
      const finalFlushChunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) finalFlushChunks.push(e.data);
      };

      // 2. Harvest chunks accumulated so far
      const segmentChunks = chunksRef.current;
      chunksRef.current = [];

      // 3. Stop old recorder
      const stopped = new Promise<void>((resolve) => {
        mr.onstop = () => resolve();
      });
      mr.stop();

      // 4. Start new recorder immediately on same stream (minimises gap)
      const newMr = new MediaRecorder(stream);
      newMr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      newMr.start(1000);
      mediaRecorderRef.current = newMr;

      // 5. Wait for old recorder's final flush to complete
      await stopped;

      // 6. Combine old chunks + final flush and upload in background
      const allOldChunks = [...segmentChunks, ...finalFlushChunks];
      if (allOldChunks.length === 0) return;

      const blob = new Blob(allOldChunks, { type: "audio/webm" });
      const meetingId = activeMeetingIdRef.current;
      const sessionId = activeSessionIdRef.current;
      const segSec = Math.max(
        MIN_SEGMENT_SECONDS,
        Number(process.env.NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS || "240")
      );

      if (meetingId && sessionId) {
        const path = await uploadSegment(blob, meetingId, sessionId, segSec);
        if (path) {
          lastUploadedPathRef.current = path;
        } else {
          console.warn("Segment upload failed; recording continues.");
        }
      }
    } catch (e) {
      console.error("Segment rotation error:", e);
      // Attempt recovery: ensure a recorder is still running
      if (
        (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") &&
        streamRef.current?.active
      ) {
        try {
          const recovery = new MediaRecorder(streamRef.current);
          recovery.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
          };
          recovery.start(1000);
          mediaRecorderRef.current = recovery;
        } catch (e2) {
          console.error("Failed to recover recorder after rotation error:", e2);
        }
      }
    } finally {
      isRotatingRef.current = false;
    }
  }, []);

  const stopRecordingAndUpload = useCallback(async (): Promise<{ recordingPath: string } | null> => {
    if (!mediaRecorderRef.current) return null;
    setRecBusy(true);
    setRecErr(null);

    try {
      const mr = mediaRecorderRef.current;

      // Stop segment rotation timer
      if (segmentTimerRef.current) {
        window.clearInterval(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }

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

      // Stop the audio stream (including any extra tracks from system audio capture)
      if (streamRef.current) {
        const anyStream = streamRef.current as MediaStream & { _cleanupTracks?: MediaStreamTrack[]; _audioContext?: AudioContext };
        if (anyStream._cleanupTracks) {
          anyStream._cleanupTracks.forEach((t: MediaStreamTrack) => t.stop());
        }
        if (anyStream._audioContext) {
          anyStream._audioContext.close().catch(() => {});
        }
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // Stop tick timer
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }

      setIsRecording(false);

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];

      const currentMeetingId = activeMeetingIdRef.current;
      const currentSessionId = activeSessionIdRef.current;
      const currentSeconds = recSecondsRef.current;

      if (!currentMeetingId || !currentSessionId) {
        throw new Error("No active meeting/session for upload.");
      }

      // If all data was already uploaded via segment rotation and nothing remains,
      // return the last successful path. A zero-size blob with no prior upload
      // indicates an error (e.g., no audio was ever captured).
      if (blob.size === 0) {
        if (lastUploadedPathRef.current) {
          return { recordingPath: lastUploadedPathRef.current };
        }
        throw new Error("Recording produced no audio data");
      }

      const path = await uploadSegment(blob, currentMeetingId, currentSessionId, currentSeconds);
      if (!path) throw new Error("Recording upload failed");

      return { recordingPath: path };
    } catch (e: unknown) {
      const error = e as Error;
      setRecErr(error?.message ?? "Upload failed");
      return null;
    } finally {
      setRecBusy(false);
    }
  }, []);

  const startRecording = useCallback(
    async ({ meetingId, sessionId, meetingTitle, audioDeviceId, includeSystemAudio }: {
      meetingId: string; sessionId: string; meetingTitle: string;
      audioDeviceId?: string; includeSystemAudio?: boolean;
    }) => {
      setRecErr(null);
      try {
        // 1. Get microphone stream
        const micConstraints: MediaTrackConstraints | boolean = audioDeviceId
          ? { deviceId: { exact: audioDeviceId } }
          : true;
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });

        let finalStream: MediaStream;

        if (includeSystemAudio) {
          try {
            // 2. Get system audio via getDisplayMedia
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
              audio: true,
              video: false,
            });

            // 3. Merge both audio streams using AudioContext
            const audioCtx = new AudioContext();
            const micSource = audioCtx.createMediaStreamSource(micStream);
            const displaySource = audioCtx.createMediaStreamSource(displayStream);
            const destination = audioCtx.createMediaStreamDestination();

            micSource.connect(destination);
            displaySource.connect(destination);

            finalStream = destination.stream;

            // Store all original tracks for cleanup
            const allTracks = [...micStream.getTracks(), ...displayStream.getTracks()];
            (finalStream as MediaStream & { _cleanupTracks?: MediaStreamTrack[]; _audioContext?: AudioContext })._cleanupTracks = allTracks;
            (finalStream as MediaStream & { _cleanupTracks?: MediaStreamTrack[]; _audioContext?: AudioContext })._audioContext = audioCtx;
          } catch (e) {
            console.warn("System audio capture failed, falling back to mic only:", e);
            finalStream = micStream;
          }
        } else {
          finalStream = micStream;
        }

        const mr = new MediaRecorder(finalStream);

        chunksRef.current = [];
        lastUploadedPathRef.current = null;
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        // Store stream reference separately — do NOT stop tracks on
        // MediaRecorder stop so we can reuse the stream across segment rotations.
        streamRef.current = finalStream;

        mr.start(1000);
        mediaRecorderRef.current = mr;

        setActiveMeetingId(meetingId);
        setActiveSessionId(sessionId);
        setActiveMeetingTitle(meetingTitle);
        setIsRecording(true);
        setRecSeconds(0);
        recSecondsRef.current = 0;

        const segmentSeconds = Math.max(
          MIN_SEGMENT_SECONDS,
          Number(process.env.NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS || "240")
        );

        // Elapsed-time tick (also enforces 2-hour safety cap)
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

            return next;
          });
        }, 1000);

        // Segment rotation on a separate timer — does NOT touch
        // isRecording / recSeconds / tick, so the UI stays stable.
        segmentTimerRef.current = window.setInterval(() => {
          void rotateSegment();
        }, segmentSeconds * 1000);
      } catch (e: unknown) {
        const error = e as Error;
        setRecErr(error?.message ?? "Could not start recording");
      }
    },
    [stopRecordingAndUpload, rotateSegment]
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
    lastUploadedPathRef.current = null;
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
