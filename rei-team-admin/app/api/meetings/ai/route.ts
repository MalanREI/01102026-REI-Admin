import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/src/lib/supabase/admin";

const MAX_STACK_TRACE_LINES = 5;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      
      if (attempt < maxRetries) {
        // Check if it's a retryable error
        const err = error as { status?: number; code?: string; message?: string };
        const isRetryable = 
          err?.status === 429 || // Rate limit
          err?.status === 503 || // Service unavailable
          err?.status === 500 || // Internal server error
          err?.code === 'ECONNRESET' || // Connection reset
          err?.code === 'ETIMEDOUT'; // Timeout
        
        if (!isRetryable) {
          // Don't retry on non-retryable errors (e.g., 400 Bad Request)
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms for error:`, err?.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Convert ArrayBuffer to File (Node 20+ supports global File).
 */
function bufToFile(buf: ArrayBuffer, filename: string, mime: string) {
  // eslint-disable-next-line no-undef
  return new File([buf], filename, { type: mime });
}

type AgendaItemRow = {
  id: string;
  code: string | null;
  title: string | null;
  description: string | null;
  position: number | null;
};

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  let sessionId: string | undefined;
  let tasksCreated = 0;
  let meetingId: string | undefined;
  
  try {
    const body = (await req.json()) as {
      meetingId?: string;
      sessionId?: string;
      recordingPath?: string;
    };

    meetingId = body.meetingId;
    sessionId = body.sessionId;
    const recordingPath = body.recordingPath;

    if (!meetingId || !sessionId || !recordingPath) {
      return NextResponse.json(
        { error: "meetingId + sessionId + recordingPath required" },
        { status: 400 }
      );
    }

    const openaiKey = requireEnv("OPENAI_API_KEY");
    const recordingsBucket = requireEnv("RECORDINGS_BUCKET");

    // Mark as processing
    await admin
      .from("meeting_minutes_sessions")
      .update({ ai_status: "processing" })
      .eq("id", sessionId);

    // 1) Load agenda items
    const agendaRes = await admin
      .from("meeting_agenda_items")
      .select("id,code,title,description,position")
      .eq("meeting_id", meetingId)
      .order("position", { ascending: true });

    if (agendaRes.error) throw agendaRes.error;

    const agendaRows = (agendaRes.data ?? []) as AgendaItemRow[];

    const agenda = agendaRows.map((a) => ({
      id: String(a.id),
      code: a.code ? String(a.code) : null,
      title: String(a.title ?? ""),
      description: a.description ? String(a.description) : null,
    }));

    if (!agenda.length) {
      await admin
        .from("meeting_minutes_sessions")
        .update({ 
          ai_status: "done",
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return NextResponse.json({ ok: true, skipped: "No agenda items" });
    }

    // 2) Download recording from storage
    const dl = await admin.storage.from(recordingsBucket).download(recordingPath);
    if (dl.error) throw dl.error;

    const arrBuf = await dl.data.arrayBuffer();

    // 3) Transcribe with retry logic
    const client = new OpenAI({ apiKey: openaiKey });

    const transcription = await retryWithBackoff(async () => {
      return await client.audio.transcriptions.create({
        model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
        file: bufToFile(arrBuf, "recording.webm", "audio/webm"),
      });
    }, 3, 2000); // 3 retries, starting with 2 second delay

    const transcriptText = transcription?.text
      ? String(transcription.text)
      : "";

    if (!transcriptText.trim()) {
      await admin
        .from("meeting_minutes_sessions")
        .update({ 
          ai_status: "done",
          ai_processed_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return NextResponse.json({ ok: true, skipped: "Empty transcript" });
    }

    // 4) Load meeting metadata for context
    const meetingRes = await admin
      .from("meetings")
      .select("title,start_at,duration_minutes")
      .eq("id", meetingId)
      .single();
    const meetingTitle = meetingRes.data?.title ?? "Meeting";
    const meetingDate = meetingRes.data?.start_at
      ? new Date(meetingRes.data.start_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "Unknown date";

    // Load attendees for context
    const attendeesRes = await admin
      .from("meeting_attendees")
      .select("email,full_name")
      .eq("meeting_id", meetingId);
    const attendeeNames = (attendeesRes.data ?? [])
      .map((a: { full_name?: string; email?: string }) => a.full_name?.trim() || a.email?.trim() || "")
      .filter(Boolean);

    // 5) Ask AI to bucket notes per agenda item id
    // Using JSON Schema response_format for reliability
    const schema = {
      name: "AgendaNotes",
      schema: { type: "object", additionalProperties: { type: "string" } },
      strict: true,
    } as const;

    const agendaList = agenda
      .map(
        (a) =>
          `${a.id} | ${a.code ? a.code + " - " : ""}${a.title}${
            a.description ? " — " + a.description : ""
          }`
      )
      .join("\n");

    const completion = await retryWithBackoff(async () => {
      return await client.chat.completions.create({
        model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: schema },
        messages: [
          {
            role: "system",
            content: [
              "You are a professional meeting secretary creating detailed meeting minutes.",
              "",
              "CONTEXT:",
              `- Meeting: "${meetingTitle}"`,
              `- Date: ${meetingDate}`,
              `- Attendees: ${attendeeNames.join(", ") || "Not specified"}`,
              "",
              "INSTRUCTIONS:",
              "1. Map each section of the transcript to the most relevant agenda item.",
              "2. For each agenda item, write DETAILED notes including:",
              "   - Key points discussed (not just a one-sentence summary)",
              "   - Specific decisions made and the reasoning behind them",
              "   - Names of people who raised points or were assigned responsibilities",
              "   - Specific numbers, dates, deadlines, or metrics mentioned",
              "   - Any disagreements, concerns, or open questions raised",
              "   - Next steps or follow-ups discussed",
              "3. Use bullet points (dashes) within each note for readability.",
              "4. Attribute statements to specific people when identifiable from the transcript (e.g., 'Alan suggested...', 'Braden raised a concern about...').",
              "5. If a topic was discussed that doesn't fit any agenda item, include it under the most related item with a note like '[Off-agenda]'.",
              "6. If an agenda item was not discussed at all, return an empty string for it.",
              "",
              "Return ONLY a JSON object mapping agenda_item_id → notes_string.",
              "Each notes_string should be a multi-line string with dashes for bullet points.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Agenda items (id | label):\n${agendaList}\n\nTranscript:\n${transcriptText}`,
          },
        ],
      });
    }, 3, 2000);

    const content = completion.choices?.[0]?.message?.content ?? "{}";

    let notesObj: Record<string, string> = {};
    try {
      notesObj = JSON.parse(content);
    } catch {
      notesObj = {};
    }

    // 5) Upsert agenda notes (one row per agenda item)
    const upRows = agenda.map((a) => ({
      session_id: sessionId,
      agenda_item_id: a.id,
      notes: String(notesObj[a.id] ?? "").trim(),
      updated_at: new Date().toISOString(),
    }));

    const up = await admin
      .from("meeting_agenda_notes")
      .upsert(upRows, { onConflict: "session_id,agenda_item_id" });

    if (up.error) throw up.error;

    // 6) Extract action items from transcript
    try {
      const actionItemSchema = {
        name: "ActionItems",
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  owner: { type: "string" },
                  dueDate: { type: "string" },
                  priority: { type: "string" },
                },
                required: ["title", "owner"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
        strict: true,
      } as const;

      const actionCompletion = await retryWithBackoff(async () => {
        return await client.chat.completions.create({
          model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_schema", json_schema: actionItemSchema },
          messages: [
            {
              role: "system",
              content: [
                "You are analyzing a meeting transcript to extract clear action items (tasks assigned to specific people).",
                "",
                "CONTEXT:",
                `- Meeting: "${meetingTitle}"`,
                `- Date: ${meetingDate}`,
                `- Known team members: ${attendeeNames.join(", ") || "Not specified"}`,
                "",
                "RULES:",
                "1. Only include CLEAR action items — tasks where someone committed to doing something or was assigned work.",
                "2. Do NOT include general discussion points or topics mentioned in passing.",
                "3. For 'owner': Use the person's full name from the known team members list if you can match them. If uncertain, use whatever name is mentioned in the transcript.",
                "4. For 'dueDate': Only include if a specific date or timeframe was mentioned (e.g., 'by Friday', 'next week', 'by March 1st'). Convert relative dates to YYYY-MM-DD format based on the meeting date. If no date was mentioned, use an empty string.",
                "5. For 'priority': Set to 'Urgent' if the item was described as urgent, critical, or blocking. Set to 'High' if it was emphasized as important. Default to 'Normal'.",
                "6. For 'title': Write a clear, actionable task title (e.g., 'Submit insurance quote to broker by Friday' not just 'insurance quote').",
                "7. If someone said they already completed something, do NOT include it as an action item.",
              ].join("\n"),
            },
            {
              role: "user",
              content: `Transcript:\n${transcriptText}`,
            },
          ],
        });
      }, 3, 2000);

      const actionContent = actionCompletion.choices?.[0]?.message?.content ?? "{}";
      let actionItems: Array<{ title: string; owner: string; dueDate: string; priority: string }> = [];
      
      try {
        const parsed = JSON.parse(actionContent);
        actionItems = parsed.items ?? [];
      } catch {
        // Failed to parse, skip action items
      }

      if (actionItems.length > 0) {
        // Get or create an "Action Items" column
        let actionColumn = await admin
          .from("meeting_task_columns")
          .select("id")
          .eq("meeting_id", meetingId)
          .eq("name", "Action Items")
          .single();

        if (!actionColumn.data) {
          // Create the Action Items column
          const maxPos = await admin
            .from("meeting_task_columns")
            .select("position")
            .eq("meeting_id", meetingId)
            .order("position", { ascending: false })
            .limit(1);

          const nextPos = (maxPos.data?.[0]?.position ?? 0) + 1;

          const newCol = await admin
            .from("meeting_task_columns")
            .insert({
              meeting_id: meetingId,
              name: "Action Items",
              position: nextPos,
            })
            .select("id")
            .single();

          if (!newCol.error) {
            actionColumn = newCol;
          }
        }

        if (actionColumn.data) {
          // Create tasks for each action item
          const taskRows = actionItems.map((item, idx) => {
            const dueDate = item.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) ? item.dueDate : null;
            return {
              meeting_id: meetingId,
              column_id: actionColumn.data!.id,
              title: item.title,
              status: "In Progress",
              priority: ["High", "Low"].includes(item.priority) ? item.priority : "Normal",
              owner_name: item.owner,
              due_date: dueDate,
              notes: `Extracted from meeting transcript by AI`,
              position: idx + 1,
            };
          });

          const taskInsert = await admin.from("meeting_tasks").insert(taskRows);
          if (!taskInsert.error) {
            tasksCreated = taskRows.length;
          }
        }
      }
    } catch (actionError) {
      // Don't fail the entire process if action item extraction fails
      console.error("Action item extraction failed:", actionError);
    }

    // 7) Save transcript onto session (if column exists)
    try {
      await admin
        .from("meeting_minutes_sessions")
        .update({ transcript: transcriptText })
        .eq("id", sessionId);
    } catch {
      // no-op
    }

    // Mark as done
    await admin
      .from("meeting_minutes_sessions")
      .update({ 
        ai_status: "done",
        ai_processed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    // Auto-trigger PDF generation (finalize)
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.SITE_URL || "http://localhost:3000";

      const internalToken = process.env.INTERNAL_JOB_TOKEN || "";

      await fetch(`${baseUrl}/api/meetings/ai/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalToken ? { "x-internal-token": internalToken } : {}),
        },
        body: JSON.stringify({ meetingId, sessionId }),
      });
    } catch (finalizeErr) {
      console.error("Auto-finalize failed (non-fatal):", finalizeErr);
      // Don't fail the whole process — PDF can be generated manually later
    }

    return NextResponse.json({ 
      ok: true, 
      agendaItemsUpdated: upRows.length,
      tasksCreated,
    });
  } catch (e: unknown) {
    // Mark as error with detailed context
    const error = e as Error & { constructor?: { name?: string }; stack?: string };
    const errorMessage = error?.message ?? "AI processing failed";
    const errorType = error?.constructor?.name ?? "Error";
    const errorDetails = {
      message: errorMessage,
      type: errorType,
      timestamp: new Date().toISOString(),
      stack: error?.stack?.split('\n').slice(0, MAX_STACK_TRACE_LINES).join('\n'),
    };
    
    console.error("AI processing error:", {
      sessionId,
      meetingId,
      error: errorDetails,
    });
    
    if (sessionId) {
      try {
        await admin
          .from("meeting_minutes_sessions")
          .update({ 
            ai_status: "error",
            ai_error: `${errorType}: ${errorMessage}`,
          })
          .eq("id", sessionId);
      } catch (updateError) {
        console.error("Failed to update error status:", updateError);
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        type: errorType,
        details: "Check server logs for more information"
      },
      { status: 500 }
    );
  }
}
