# CLAUDE.md — ColdCaller

## Overview
ColdCaller is a sales training web app where call centre agents practice cold calling AI-simulated cell phone users to get them to switch their mobile service provider. The AI prospect is powered by Claude via ElevenLabs Conversational AI. Reps can configure their company and product details (rep profile), which are injected into every AI prompt so the simulation reflects the real offer being sold.

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Voice**: ElevenLabs Conversational AI WebSocket API (`@elevenlabs/client`)
- **LLM**: Claude Sonnet via `@anthropic-ai/sdk` (custom LLM endpoint for ElevenLabs + coaching + scoring)
- **Database**: PostgreSQL via `pg` (local Postgres for dev, Railway Postgres in production)
- **No auth**: Rep name stored in localStorage; rep profile stored in localStorage

## Architecture
```
Browser ←WebSocket→ ElevenLabs (STT + TTS)
                         ↓ HTTP POST (OpenAI SSE format)
                    /chat/completions route
                         ↓
                    Claude API (Anthropic SDK)
```

ElevenLabs handles all audio (speech-to-text and text-to-speech). Our server provides the LLM brain via a custom endpoint that translates between OpenAI SSE format and Claude's API. The rep's product context (company, plan, pricing) is injected into the prospect's system prompt, the live coaching prompt, and the post-call scoring prompt.

## Key Files

### Library
- `lib/db.ts` — PostgreSQL connection pool, all types (Persona, Session, CoachingTip, etc.), CRUD for sessions and personas
- `lib/personas.ts` — Seed data (`DEFAULT_PERSONAS` array); upserted into the DB on every server startup via `ON CONFLICT (id) DO NOTHING`
- `lib/active-persona.ts` — In-memory store for current persona ID + rep profile (set via `POST /api/signed-url`, read by `/api/llm`)
- `lib/rep-profile.ts` — `RepProfile` type, `EMPTY_PROFILE` defaults, `buildRepContextBlock()` for AI prompt injection, `deriveProspectNumber()` for generating consistent SA phone numbers per persona
- `lib/anthropic.ts` — Lazy-initialized Anthropic client
- `lib/elevenlabs.ts` — ElevenLabs signed URL helper

### API Routes
- `app/api/llm/route.ts` — Custom LLM endpoint called by ElevenLabs; translates OpenAI format → Claude streaming → OpenAI SSE; injects persona + rep profile into system prompt
- `app/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs calls `/chat/completions`)
- `app/v1/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs may call `/v1/chat/completions`)
- `app/api/signed-url/route.ts` — **POST** — receives `{ persona_id, rep_profile }`, stores both server-side, returns ElevenLabs signed WebSocket URL
- `app/api/score/route.ts` — Post-call scoring via Claude; accepts optional `rep_profile` for offer-accuracy evaluation
- `app/api/coach/route.ts` — Live coaching suggestions during calls via Claude; accepts optional `rep_profile` for product-aware tips
- `app/api/sessions/route.ts` — Postgres CRUD for call sessions
- `app/api/personas/route.ts` — GET/POST/PUT/DELETE for personas
- `app/api/personas/generate/route.ts` — AI-powered persona generation via Claude
- `app/api/parse-plan-image/route.ts` — Accepts a screenshot upload, uses Claude vision to extract plan details, returns `Partial<RepProfile>`
- `app/api/health/route.ts` — Health check

### Pages & Components
- `app/page.tsx` — **Server Component** (async); fetches personas directly from DB, passes to `HomeClient`. `export const dynamic = "force-dynamic"` ensures fresh data on every request.
- `components/HomeClient.tsx` — Client component for the home page; handles rep name/profile from localStorage, persona selection, and navigation
- `app/settings/page.tsx` — Rep profile form; screenshot upload for AI auto-fill; saves to localStorage
- `app/call/page.tsx` — Active call screen
- `app/admin/page.tsx` — Manage and AI-generate personas; edit form exposes all fields including industry, objections (one per line), and coaching tips (JSON)
- `app/history/page.tsx` — Past sessions list
- `app/results/[sessionId]/page.tsx` — Score breakdown for one call
- `components/CallInterface.tsx` — Main call UI; shows prospect phone number, network, and rep's outbound number in the persona card; reads rep profile from localStorage; passes it to signed-url, coach, and score endpoints
- `components/CoachingSidebar.tsx` — Live AI coaching suggestions + static phase-coded tips
- `components/ScoreCard.tsx` — Post-call results display
- `components/ScenarioSelector.tsx` — Persona picker grid
- `components/AudioVisualizer.tsx` — Mic/speaker level display

### Scripts
- `scripts/generate-sa-personas.mjs` — One-shot script to generate and save South African personas via the API (requires dev server running)

## Database
- **PostgreSQL** (local Postgres for dev, Railway Postgres in production)
- **`sessions` table** — call history with transcripts and scores
- **`personas` table** — prospect personas with system prompts, coaching tips, objections
- Tables auto-create on first use via `ensureTable()` pattern
- Default personas are upserted (`ON CONFLICT (id) DO NOTHING`) on every server startup — adding new personas to `DEFAULT_PERSONAS` guarantees they appear in any DB without a migration

### Local DB setup
```bash
createdb coldcaller
# Then add to .env.local:
# DATABASE_URL=postgresql://localhost:5432/coldcaller
```

## Personas
Stored in the `personas` database table. All personas are **male** (matching the ElevenLabs Drew voice). Defined in `lib/personas.ts` and seeded automatically.

Current South African personas (black SA theme):
- **Easy:** Sipho Dlamini — young spaza shop owner in Soweto, MTN prepaid R180/month, deal-curious, uses township slang
- **Medium:** Thulani Nkosi — contact centre team leader in Johannesburg, Vodacom postpaid R499/month with 2 months left on contract, professional and probing
- **Hard:** Bongani Zulu — hardware store owner in KwaMashu Durban, Cell C 4-line business account for 15 years, deeply skeptical

Each persona has a deterministic SA phone number derived via `deriveProspectNumber()` in `lib/rep-profile.ts` — same number every call, correct network prefix (083 MTN, 082 Vodacom, 084 Cell C).

New personas can be created via the `/admin` page (AI generation). The edit form exposes all fields.

Each persona has a `systemPrompt` prefixed with a training simulation context block that prevents the AI from breaking character or identifying as an AI.

## Rep Profile (`/settings`)
Reps fill in their company and product details once. Saved to `localStorage` key `coldcaller_rep_profile`.

Fields: company name, rep role (default: "Outbound Sales Agent"), experience level, **outbound caller number**, plan name, contract type, data, voice, SMS, monthly price, contract length, promotion, key selling points, training focus.

**Outbound caller number**: The rep's own outbound phone number, shown on the call page so the rep knows what number the prospect will see on their screen.

**Screenshot auto-fill**: Upload a plan screenshot → `POST /api/parse-plan-image` → Claude vision extracts fields → form auto-populates with green rings on detected fields.

Context is injected into:
1. **Prospect system prompt** — prospect knows what offer they're being pitched
2. **Coach prompt** — tips are product-aware and tailored to rep experience/focus
3. **Score prompt** — scoring evaluates accuracy of how the rep described the actual offer

## Development Commands
```bash
npm run dev                          # Start dev server on port 3000
npm run build                        # Production build
ngrok http 3000                      # Tunnel for ElevenLabs (local dev only)
node scripts/generate-sa-personas.mjs  # Generate SA personas (dev server must be running)
```

## Environment Variables (.env.local)
```
ELEVENLABS_API_KEY=     # ElevenLabs API key (needs Conversational AI permission)
ELEVENLABS_AGENT_ID=    # ElevenLabs Conversational AI agent ID
ANTHROPIC_API_KEY=      # Anthropic API key
DATABASE_URL=           # PostgreSQL connection string
                        # Local: postgresql://localhost:5432/coldcaller
                        # Production: auto-injected by Railway
```

## ElevenLabs Agent Setup
1. Create agent in Conversational AI > Agents
2. Set LLM to "Custom LLM" → Server URL: your ngrok/Railway base URL (no path)
3. ElevenLabs appends `/chat/completions` automatically — app handles both `/chat/completions` and `/v1/chat/completions`
4. System prompt: reinforce staying in character ("You are a person receiving a cold call...")
5. First message: leave empty (rep initiates the call)
6. Voice: Drew (Energetic, Friendly and Light)
7. Publish after any changes

## Important Patterns
- **Persona prompt is the source of truth**: `/api/llm` ignores all system messages from ElevenLabs, uses only the persona's `systemPrompt` from the database
- **Rep profile flows through server memory**: `POST /api/signed-url` stores rep profile in `lib/active-persona.ts`; `/api/llm` reads it and appends a `--- CALL CONTEXT ---` block to the system prompt
- **signed-url is POST not GET**: changed to POST so the full rep profile JSON can be sent in the body
- **Fallback persona**: If persona lookup fails entirely, a complete fallback persona (Pat, generic cell phone user) is used — never a generic "helpful assistant" prompt
- **All personas must be male**: ElevenLabs agent uses the Drew (male) voice
- **Live coaching**: `/api/coach` called 2 seconds after each prospect message; receives transcript + persona + rep profile
- **Home page is a Server Component**: `app/page.tsx` is async and fetches personas from the DB directly — no client-side fetch, no loading state, no flicker
- **reactStrictMode is disabled**: Set to `false` in `next.config.ts` to prevent dev-mode double-effect invocations causing visible re-renders
- **Fonts use `display: optional`**: Geist fonts configured with `font-display: optional` to prevent text reflow (FOUT) on page load

## Deployment (Railway)
- `railway.json` configured with Nixpacks builder and standalone output
- Set env vars in Railway dashboard (`DATABASE_URL` auto-injected from Railway Postgres)
- Set `PORT=8080` and `HOSTNAME=0.0.0.0` in Railway variables
- Update ElevenLabs agent Server URL to Railway public URL after deployment
- No ngrok needed in production
