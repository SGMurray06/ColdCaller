# CLAUDE.md — ColdCaller

## Overview
ColdCaller is a sales training web app where call centre agents practice cold calling AI-simulated cell phone users to get them to switch their mobile service provider (NovaConnect). The AI prospect is powered by Claude via ElevenLabs Conversational AI.

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Voice**: ElevenLabs Conversational AI WebSocket API (`@elevenlabs/client`)
- **LLM**: Claude Sonnet via `@anthropic-ai/sdk` (custom LLM endpoint for ElevenLabs)
- **Database**: PostgreSQL via `pg` (Railway Postgres in production)
- **No auth**: Rep name stored in localStorage

## Architecture
```
Browser ←WebSocket→ ElevenLabs (STT + TTS)
                         ↓ HTTP POST (OpenAI SSE format)
                    /chat/completions route
                         ↓
                    Claude API (Anthropic SDK)
```

ElevenLabs handles all audio (speech-to-text and text-to-speech). Our server provides the LLM brain via a custom endpoint that translates between OpenAI SSE format and Claude's API.

## Key Files
- `lib/db.ts` — PostgreSQL connection pool, all types (Persona, Session, CoachingTip, etc.), CRUD for sessions and personas
- `lib/personas.ts` — Seed data only (`DEFAULT_PERSONAS` array), used to populate the personas table on first run
- `lib/active-persona.ts` — In-memory store for current persona (set via `/api/signed-url`, read by `/api/llm`)
- `lib/anthropic.ts` — Lazy-initialized Anthropic client
- `app/api/llm/route.ts` — Custom LLM endpoint called by ElevenLabs; translates OpenAI format → Claude streaming → OpenAI SSE
- `app/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs calls `/chat/completions`)
- `app/v1/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs may call `/v1/chat/completions`)
- `app/api/score/route.ts` — Post-call scoring via Claude
- `app/api/coach/route.ts` — Live coaching suggestions during calls via Claude
- `app/api/sessions/route.ts` — Postgres CRUD for call sessions
- `app/api/personas/route.ts` — GET/POST/PUT/DELETE for personas
- `app/api/personas/generate/route.ts` — AI-powered persona generation via Claude
- `app/api/signed-url/route.ts` — Gets ElevenLabs signed WebSocket URL, stores active persona
- `app/admin/page.tsx` — Admin page for managing and generating personas
- `components/CallInterface.tsx` — Main call UI with ElevenLabs WebSocket, transcript, audio visualizer
- `components/CoachingSidebar.tsx` — Live AI coaching suggestions + static phase-coded tips
- `components/ScoreCard.tsx` — Post-call results display

## Database
- **PostgreSQL** (Railway Postgres in production, local Postgres for dev)
- **`sessions` table** — call history with transcripts and scores
- **`personas` table** — prospect personas with system prompts, coaching tips, objections
- Tables auto-create on first use via `ensureTable()` pattern
- Personas auto-seed from `DEFAULT_PERSONAS` if table is empty

## Personas
Stored in the `personas` database table. Default 6 personas seeded on first run:
- **Easy:** Leo Nguyen (Deal Hunter), Marcus Johnson (Frustrated Switcher), Zach Chen (Young Upgrader)
- **Medium:** Raj Kapoor (Busy Parent)
- **Hard:** Marco Santos (Loyal Lifer), Greg Holloway (Hostile Do-Not-Caller)

All personas are male (matching the ElevenLabs Drew voice). New personas can be created via the `/admin` page using AI generation.

Each persona has a `systemPrompt` prefixed with a training simulation context block that prevents the AI from breaking character or identifying as an AI.

## Admin Page (`/admin`)
- View, edit, delete personas
- **AI Generate**: describe a prospect type + difficulty, Claude generates a complete persona with system prompt, objections, coaching tips, and training context
- Review generated personas before saving to database

## Development Commands
```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build
ngrok http 3000      # Tunnel for ElevenLabs to reach /chat/completions (local dev only)
```

## Environment Variables (.env.local)
```
ELEVENLABS_API_KEY=     # ElevenLabs API key (needs Conversational AI permission)
ELEVENLABS_AGENT_ID=    # ElevenLabs Conversational AI agent ID
ANTHROPIC_API_KEY=      # Anthropic API key
DATABASE_URL=           # PostgreSQL connection string (auto-injected by Railway)
```

## ElevenLabs Agent Setup
1. Create agent in Conversational AI > Agents
2. Set LLM to "Custom LLM"
3. Server URL: your ngrok/railway base URL (no path — app handles `/chat/completions` and `/v1/chat/completions`)
4. System prompt on dashboard must reinforce staying in character (not "helpful AI assistant")
5. First message: leave empty (rep initiates the call)
6. Publish the agent after changes

## Important Patterns
- **Persona prompt is the source of truth**: The `/api/llm` endpoint ignores all system messages from ElevenLabs and uses only the persona's `systemPrompt` from the database
- **Server-side persona store**: When client fetches `/api/signed-url?persona_id=X`, the persona is stored in memory. The LLM endpoint reads it as a fallback.
- **Fallback persona**: If persona lookup fails entirely, a complete fallback persona (Pat, generic cell phone user) is used — never a generic "helpful assistant" prompt
- **ElevenLabs routes**: Both `/chat/completions` and `/v1/chat/completions` re-export from `/api/llm/route.ts`
- **Live coaching**: The `/api/coach` endpoint is called 2 seconds after each prospect message, sending the transcript to Claude for contextual suggestions

## Deployment (Railway)
- `railway.json` configured with Nixpacks builder and standalone output
- Set env vars in Railway dashboard (DATABASE_URL auto-injected from Railway Postgres)
- Set `PORT=8080` and `HOSTNAME=0.0.0.0` in Railway variables
- Update ElevenLabs agent Server URL to Railway public URL
- No ngrok needed in production
