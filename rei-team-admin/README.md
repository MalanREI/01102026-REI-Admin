# REI Team Admin (Next.js + Supabase)

Internal admin-style web app:
- Left sidebar navigation
- Home: shared links list (CRUD)
- Meetings: Kanban board + card notes (CRUD) + AI recorder (stub)
- Media Posting: scaffold placeholder
- Sales Funnel: cold-calling CRM (CRUD)

## 1) Create Supabase project
1. Create a Supabase project.
2. In Supabase → SQL Editor, run: `supabase/migrations/001_init.sql`
3. In Supabase → Authentication:
   - Disable public signups if you want invite-only
   - Create your first user manually: Auth → Users → Add user

## 2) Local dev
1. Install Node.js 20+ (recommended) on your machine.
2. Copy env:
   - `cp .env.example .env.local`
3. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Install & run:
   - `npm install`
   - `npm run dev`
5. Visit:
   - http://localhost:3000

## 3) Deploy (recommended: Vercel)
1. Push this repo to GitHub.
2. Import into Vercel.
3. Add environment variables in Vercel (same as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

## Notes
- "Invite-only" is mainly controlled in Supabase Auth settings. This UI only includes Sign In.
- AI meeting recorder is stubbed behind:
  - `NEXT_PUBLIC_FEATURE_MEETING_AI=true`
  - Next step is adding audio capture + transcription + summarization (OpenAI or other).
