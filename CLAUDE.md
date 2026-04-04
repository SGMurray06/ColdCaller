# CLAUDE.md — ColdCaller

## Overview
ColdCaller is a sales training web app where call centre agents practice cold calling AI-simulated cell phone users to get them to switch their mobile service provider (NovaConnect). The AI prospect is powered by Claude via ElevenLabs Conversational AI.

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Voice**: ElevenLabs Conversational AI WebSocket API (`@elevenlabs/client`)
- **LLM**: Claude Sonnet via `@anthropic-ai/sdk` (custom LLM endpoint for ElevenLabs)
- **Database**: SQLite via `better-sqlite3` (file: `coldcaller.db`, auto-created)
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
- `lib/personas.ts` — All 6 prospect personas with system prompts, coaching tips, objections, difficulty levels
- `lib/active-persona.ts` — In-memory store for current persona (set via `/api/signed-url`, read by `/api/llm`)
- `app/api/llm/route.ts` — Custom LLM endpoint called by ElevenLabs; translates OpenAI format → Claude streaming → OpenAI SSE
- `app/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs calls `/chat/completions`)
- `app/v1/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs may call `/v1/chat/completions`)
- `app/api/score/route.ts` — Post-call scoring via Claude (opener, objection handling, value prop, next step, overall)
- `app/api/sessions/route.ts` — SQLite CRUD for call sessions
- `app/api/signed-url/route.ts` — Gets ElevenLabs signed WebSocket URL, stores active persona
- `components/CallInterface.tsx` — Main call UI with ElevenLabs WebSocket, transcript, audio visualizer
- `components/CoachingSidebar.tsx` — Phase-coded coaching tips shown during calls
- `components/ScoreCard.tsx` — Post-call results display
- `lib/db.ts` — SQLite database (better-sqlite3), auto-creates table on first use

## Personas (6 total)
**Easy:** Lisa Nguyen (Deal Hunter), Marcus Johnson (Frustrated Switcher), Zoe Chen (Young Upgrader)
**Medium:** Priya Kapoor (Busy Parent)
**Hard:** Maria Santos (Loyal Lifer), Greg Holloway (Hostile Do-Not-Caller)

Each persona has a `systemPrompt` prefixed with a training simulation context block that prevents the AI from breaking character or identifying as an AI.

## Development Commands
```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build
ngrok http 3000      # Tunnel for ElevenLabs to reach /chat/completions
```

## Environment Variables (.env.local)
```
ELEVENLABS_API_KEY=     # ElevenLabs API key (needs Conversational AI permission)
ELEVENLABS_AGENT_ID=    # ElevenLabs Conversational AI agent ID
ANTHROPIC_API_KEY=      # Anthropic API key
```

## ElevenLabs Agent Setup
1. Create agent in Conversational AI > Agents
2. Set LLM to "Custom LLM"
3. Server URL: your ngrok/railway base URL (no path — app handles `/chat/completions` and `/v1/chat/completions`)
4. System prompt on dashboard must reinforce staying in character (not "helpful AI assistant")
5. First message: leave empty (rep initiates the call)
6. Publish the agent after changes

## Important Patterns
- **Persona prompt is the source of truth**: The `/api/llm` endpoint ignores all system messages from ElevenLabs and uses only the persona's `systemPrompt` from `lib/personas.ts`
- **Server-side persona store**: When client fetches `/api/signed-url?persona_id=X`, the persona is stored in memory. The LLM endpoint reads it as a fallback if `elevenlabs_extra_body` isn't forwarded.
- **Fallback persona**: If persona lookup fails entirely, a complete fallback persona (Pat, generic cell phone user) is used — never a generic "helpful assistant" prompt
- **ElevenLabs routes**: Both `/chat/completions` and `/v1/chat/completions` re-export from `/api/llm/route.ts`

## Deployment (Railway)
- `railway.json` is configured
- Set env vars in Railway dashboard
- Update ElevenLabs agent Server URL to Railway public URL
- No ngrok needed in production
