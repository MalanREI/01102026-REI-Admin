# Meeting Recordings Fix - Setup Guide

## Overview
This document explains the changes made to fix the meetings page for longer recordings (2+ hours).

## Problem Summary
The previous implementation failed for longer meetings because:
- Recordings were saved to local `/tmp` directory (ephemeral in serverless)
- AI processing tried to download from Supabase but received local file paths
- AI processing was synchronously triggered during meeting conclusion, causing timeouts

## Solution
The fix separates recording upload from AI processing:
1. Recordings are uploaded directly to Supabase storage during the meeting
2. Meeting conclusion just ends the meeting (no AI processing)
3. A "Process Recording" button appears for manually triggering AI analysis
4. AI processing happens asynchronously in the background

## Setup Instructions

### 1. Run Database Migration
Apply the new migration to create the Supabase storage bucket:

```bash
# If using Supabase CLI
cd rei-team-admin
supabase db push

# Or apply manually via Supabase Dashboard:
# SQL Editor > Run the contents of:
# supabase/migrations/010_meeting_recordings_storage.sql
```

### 2. Verify Environment Variables
Ensure these environment variables are set in your Vercel/hosting environment:

**Required:**
- `RECORDINGS_BUCKET` - Name of Supabase storage bucket (default: "meeting-recordings")
- `OPENAI_API_KEY` - OpenAI API key for transcription and summarization
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)

**Optional (with defaults):**
- `MAX_RECORDING_UPLOAD_BYTES` - Max upload size in bytes (default: 4MB)
- `OPENAI_TRANSCRIBE_MODEL` - OpenAI model for transcription (default: "gpt-4o-mini-transcribe")
- `OPENAI_SUMMARY_MODEL` - OpenAI model for summarization (default: "gpt-4o-mini")
- `NEXT_PUBLIC_AI_POLL_MAX_SECONDS` - Client polling timeout (default: 1800 = 30 min)
- `NEXT_PUBLIC_AI_POLL_INTERVAL_MS` - Polling interval (default: 4000 = 4 sec)
- `SITE_URL` - Base URL for internal API calls (auto-detected in most cases)

### 3. Verify Supabase Storage Bucket
In Supabase Dashboard:
1. Go to Storage
2. Verify "meeting-recordings" bucket exists
3. Check that RLS policies are set up (should be created by migration)

### 4. Test the Flow

**Test with Short Meeting (< 5 min):**
1. Start a new meeting minutes session
2. Click "Start Recording"
3. Record for 1-2 minutes
4. Click "Conclude Meeting"
5. Verify recording uploaded successfully
6. Click "Process Recording"
7. Wait for AI processing to complete
8. Verify meeting notes are generated

**Test with Longer Meeting (> 5 min):**
1. Start a new meeting minutes session
2. Click "Start Recording"
3. Record for 5-10 minutes (or longer)
4. Recording should auto-segment every 4 minutes (configurable)
5. Click "Conclude Meeting"
6. Verify recording uploaded successfully
7. Click "Process Recording"
8. AI processing may take several minutes
9. You can leave the page and come back later
10. Check "View Previous Meetings" to see processing status

## How It Works

### Recording Flow
1. **Start Recording**: Browser captures audio via MediaRecorder
2. **Auto-segmentation**: Every 240 seconds (4 min), current segment uploads and new one starts
3. **Upload**: Each segment uploads to Supabase storage at `{meetingId}/{sessionId}/recording_*.webm`
4. **Storage**: Files are stored in Supabase storage bucket with RLS policies
5. **Database**: Record created in `meeting_recordings` table with storage path

### AI Processing Flow
1. **Trigger**: User clicks "Process Recording" button
2. **Queue**: Session status set to "queued", then "processing"
3. **Download**: Recording downloaded from Supabase storage
4. **Transcribe**: OpenAI Whisper transcribes audio to text
5. **Summarize**: GPT-4o-mini summarizes notes per agenda item
6. **Store**: Notes saved to `meeting_agenda_notes` table
7. **Complete**: Session status set to "done" with timestamp

### Status States
- `ready` - Meeting concluded, recording uploaded, ready to process
- `queued` - AI processing request queued
- `processing` - AI is currently processing the recording
- `done` - AI processing completed successfully
- `error` - AI processing failed (check `ai_error` column)
- `skipped` - Meeting concluded without recording

## Troubleshooting

### "No recording found for this session"
- Check that recording uploaded successfully before concluding meeting
- Verify `meeting_recordings` table has entry for the session
- Check Supabase storage bucket for the recording file

### "AI processing failed"
- Check `meeting_minutes_sessions.ai_error` column for error details
- Verify OpenAI API key is valid and has credits
- Check recording file size (very large files may timeout)
- Verify `RECORDINGS_BUCKET` env var matches bucket name

### "Recording upload failed"
- Check network connection during meeting
- Verify Supabase storage bucket exists and is accessible
- Check `MAX_RECORDING_UPLOAD_BYTES` if chunks are too large
- Verify service role key has storage permissions

### Processing takes too long
- Normal for longer recordings (2 hour recording may take 5-10 minutes to process)
- User can leave page and return later
- Check "View Previous Meetings" to see status
- AI processing continues in background even if user closes browser

## Future Improvements

### Recommended Enhancements
1. **Real-time Updates**: Replace polling with Supabase Realtime subscriptions
2. **Progress Indicators**: Show transcription/summarization progress
3. **Retry Logic**: Auto-retry failed processing attempts
4. **Chunked Transcription**: Split very long recordings for parallel processing
5. **Quality Options**: Allow users to select transcription quality/speed tradeoff
6. **Storage Cleanup**: Automated deletion of old recordings

### Scaling Considerations
- For high-volume usage, consider moving AI processing to dedicated workers
- Implement queue system (e.g., BullMQ) for managing concurrent processing
- Set up monitoring for processing times and failure rates
- Consider caching frequently accessed recordings

## Files Changed

### Backend API Routes
- `app/api/meetings/ai/upload-recording/route.ts` - Upload to Supabase storage
- `app/api/meetings/ai/conclude/route.ts` - Separate conclusion from AI
- `app/api/meetings/ai/process-recording/route.ts` - NEW: Trigger AI processing
- `app/api/meetings/ai/route.ts` - Add status tracking

### Frontend
- `app/meetings/[id]/page.tsx` - UI updates and new button

### Database
- `supabase/migrations/010_meeting_recordings_storage.sql` - Storage bucket setup

### Configuration
- `rei-team-admin/.gitignore` - Prevent committing build artifacts

## Support
If you encounter issues:
1. Check Vercel/hosting logs for error details
2. Check Supabase logs for storage/database errors
3. Verify all environment variables are set correctly
4. Test with a short recording first to isolate the issue
5. Check that migration was applied successfully
