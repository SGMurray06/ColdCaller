# CLAUDE.md — ColdCaller

## Overview
ColdCaller is a sales training web app for **MTN South Africa**. Call centre agents practise outbound calls against AI-simulated prospects, and every prospect is an **existing MTN customer** — so these are upsell, upgrade and renewal calls, not acquisition calls. All money is in rand. The AI prospect is powered by Claude via ElevenLabs Conversational AI.

### Plans reps may offer
| Range | Plan | Data | Minutes | Price | Term | Notes |
|---|---|---|---|---|---|---|
| Yellow | Core | 1 GB anytime | 60 all-net | R175 pm | ×24 | |
| Yellow | Plus | 3 GB (1.5 + 1.5 bonus) | 3 000 (120 + 2 880 bonus) | R199 pm | ×24 | **New lines only** |
| Sky Premium | Iron | 15 GB | 800 all-net | R849 pm | ×24 | R50 off MTN Home Internet; Priority Service |
| Sky Premium | Bronze | 30 GB | 1 600 all-net | R1 139 pm | ×36 | R200 off MTN Home Internet; Priority Service |

**Yellow Plus being new-lines-only is load-bearing in the training design**, not a footnote. It is better value than Core (R24 more for triple the data and fifty times the minutes) and existing customers cannot have it — which drives the hardest objections in the scenario set. Plan data lives in **four** places that must stay in sync: `lib/personas.ts`, the `SCORING_PROMPT` in `app/api/score/route.ts`, the `COACHING_PROMPT` in `app/api/coach/route.ts`, and the `GENERATE_PROMPT` in `app/api/personas/generate/route.ts`.

The promo Yellow Plans (R349 / R379 ×36) are deliberately **excluded** — they cost more than standard Core for a longer term, which only makes sense if they include a handset, and that was unconfirmed.

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Voice**: ElevenLabs Conversational AI WebSocket API (`@elevenlabs/client`)
- **LLM**: `claude-sonnet-5` via `@anthropic-ai/sdk` (custom LLM endpoint for ElevenLabs). Thinking is explicitly disabled on every call — see Important Patterns
- **Database**: PostgreSQL via `pg` (Railway Postgres in production)
- **Auth**: per-user accounts (username + scrypt password hash) → claims signed into an httpOnly cookie, enforced by `proxy.ts`. Two roles, `rep` and `admin`.

## Architecture
```
Browser ←WebSocket→ ElevenLabs (STT + TTS)
                         ↓ HTTP POST (OpenAI SSE format)
                    /chat/completions route
                         ↓
                    Claude API (Anthropic SDK)
```

ElevenLabs handles all audio (speech-to-text and text-to-speech). Our server provides the LLM brain via a custom endpoint that translates between OpenAI SSE format and Claude's API.

## Accounts and Roles
Every rep has their own account. There is no shared password.

- **`rep`** — makes calls, sees their own transcripts, and sees the cross-rep leaderboard (names and scores only).
- **`admin`** — everything a rep can do, plus `/admin` (persona CRUD and AI generation), `/admin/users`, and every rep's transcripts.

**The server decides who you are.** `POST /api/sessions` ignores any `rep_name` in the request body and stamps the call with the signed-in user's ID and display name. `rep_name` is kept on the row as a snapshot of the display name at call time, so renaming a rep doesn't rewrite their history.

Accounts are created by an admin at `/admin/users` with a temporary password; `must_change_password` forces the rep to choose their own at first sign-in. Leavers are **deactivated, not deleted** — deleting would orphan their sessions.

The **bootstrap admin** is seeded into an empty `users` table from `ADMIN_USERNAME` (default `admin`) and `APP_PASSWORD`, with the forced-change flag set. Like the persona seed, the empty-table check is memoised per process, so changing `APP_PASSWORD` later does nothing.

## Key Files
- `lib/db.ts` — PostgreSQL connection pool, all types (User, Persona, Session, CoachingTip, etc.), CRUD for users, sessions and personas
- `lib/personas.ts` — Seed data only (`DEFAULT_PERSONAS` array), used to populate the personas table on first run
- `lib/active-persona.ts` — In-memory store for current persona (set via `/api/signed-url`, read by `/api/llm`)
- `lib/anthropic.ts` — Lazy-initialized Anthropic client
- `app/api/llm/route.ts` — Custom LLM endpoint called by ElevenLabs; translates OpenAI format → Claude streaming → OpenAI SSE
- `app/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs calls `/chat/completions`)
- `app/v1/chat/completions/route.ts` — Re-exports LLM handler (ElevenLabs may call `/v1/chat/completions`)
- `app/api/score/route.ts` — Post-call scoring via Claude
- `app/api/coach/route.ts` — Live coaching suggestions during calls via Claude
- `app/api/sessions/route.ts` — Call sessions. Identity comes from the cookie, never the body; `?id=` is owner-or-admin only
- `app/api/leaderboard/route.ts` — Best score per rep, computed in SQL. Visible to every rep
- `app/api/users/route.ts` — Admin-only user management (GET/POST/PATCH)
- `app/api/auth/me/route.ts` — Current user for client components
- `app/api/auth/password/route.ts` — Change your own password; re-issues the cookie with the forced-change flag cleared
- `app/api/personas/route.ts` — GET/POST/PUT/DELETE for personas. Mutations are admin-only
- `app/api/personas/generate/route.ts` — AI-powered persona generation via Claude. Admin-only
- `app/api/signed-url/route.ts` — Gets ElevenLabs signed WebSocket URL, stores active persona
- `app/admin/page.tsx` — Admin page for managing and generating personas
- `app/admin/users/page.tsx` — Add reps, reset passwords, change roles, deactivate leavers
- `app/account/password/page.tsx` — Password change form; also the forced first-login screen
- `components/CallInterface.tsx` — Main call UI with ElevenLabs WebSocket, transcript, audio visualizer
- `components/CoachingSidebar.tsx` — Live AI coaching suggestions + static phase-coded tips
- `components/ScoreCard.tsx` — Post-call results display
- `proxy.ts` — Auth gate (Next 16 renamed `middleware` → `proxy`; Node runtime). Deny-by-default matcher: public paths, bearer-auth LLM paths, cookie-auth everything else, plus the role and forced-password-change gates
- `lib/auth.ts` — scrypt hashing, claims token sign/verify, bearer verify, cookie options. Server-only, and **must never import `lib/db`** — `proxy.ts` depends on it, and that would pull `pg` into the proxy graph
- `lib/session.ts` — `getCurrentUser` / `requireUser` / `requireAdmin`. The authoritative identity check, re-read from the database
- `lib/rate-limit.ts` — In-memory login throttle (8 attempts / 60s), keyed by IP **and** by username
- `app/login/page.tsx` — Username + password form. Uses `useSearchParams`, so it needs its `<Suspense>` wrapper or `npm run build` fails

## Database
- **PostgreSQL** (Railway Postgres in production, local Postgres for dev)
- **`users` table** — username (lowercased, unique), display name, scrypt hash, role, `must_change_password`, `is_active`
- **`sessions` table** — call history with transcripts and scores, plus a nullable `user_id`
- **`personas` table** — prospect personas with system prompts, coaching tips, objections
- Tables auto-create on first use via `ensureTable()` pattern
- Personas auto-seed from `DEFAULT_PERSONAS` if table is empty; `users` seeds the bootstrap admin the same way
- **`sessions.user_id` is nullable on purpose.** Rows written before accounts existed keep their free-text `rep_name` and belong to nobody — they still appear on the leaderboard, but only an admin can open them. Back-filling by matching `rep_name` to `display_name` is possible; check for name collisions first

## Personas
Stored in the `personas` table, seeded from `DEFAULT_PERSONAS` in `lib/personas.ts`. All six are existing MTN customers, spread deliberately across call types:

| Persona | Difficulty | Scenario | Teaching point |
|---|---|---|---|
| Leo Nguyen (`deal-hunter`) | easy | Prepaid → contract. Tops up 3–4× a month, ~R240, never adds it up | Do the arithmetic out loud; be honest that Core is only 1 GB |
| Marcus Johnson (`frustrated-switcher`) | easy | Contract upgrade. Out-of-bundle bill shock; real spend R950–R1 100 | **Anchor against actual spend, not the headline plan price** — comparing R849 to his R199 plan is scripted to fail |
| Zach Chen (`young-upgrader`) | easy | Renewal, contract ends in 5 weeks, eyeing prepaid | Asks for Yellow Plus; closes only if told honestly it is new lines only |
| Raj Kapoor (`busy-parent`) | medium | Prepaid household, 4 lines, constantly interrupted | His children's lines would be **new** lines, so Plus genuinely IS available for them — a product-knowledge test |
| Marco Santos (`loyal-lifer`) | hard | 11 years, 3 lines, resents new-customer-only deals | Raises the Plus grievance; disengages permanently if the rep spins it. Will not sign on the call |
| Greg Holloway (`hostile-dnc`) | hard | Furious — open billing dispute, hours on hold, now being sold to | De-escalation. A sale is **not** the win; a salvaged relationship is |

All personas are male, because a single ElevenLabs agent (and therefore a single voice) serves every persona — see Known Limitations.

Each `systemPrompt` is composed from a shared `TRAINING_CONTEXT` constant plus a shared `SA_VOICE` block (South African English, rand, 1–2 sentence replies). The context block establishes that the rep knowingly entered a simulation, which is what licenses sustained in-character roleplay. Keep both shared — they were previously duplicated verbatim per persona and drifted.

New personas can be created via `/admin` using AI generation.

## Admin Pages
`/admin` — view, edit, delete personas. **AI Generate**: describe a prospect type + difficulty and Claude generates a complete persona with system prompt, objections, coaching tips and training context; review before saving.

`/admin/users` — add reps, reset passwords, promote/demote, deactivate. The API refuses to demote or deactivate the last active admin, and refuses to let you deactivate yourself.

Generated personas inherit the MTN framing, the plan table and the shared `SPEECH:` block from `GENERATE_PROMPT`, so they stay consistent with the seeded cast. They are still worth reading before saving — the model will happily invent a plan that doesn't exist.

## Development Commands
```bash
npm run dev          # Start dev server on port 3000
npm run build        # Production build
ngrok http 3000      # Tunnel so ElevenLabs can reach /v1/chat/completions (local dev only)
```

Browse the app at `localhost:3000`, not through the tunnel — the tunnel exists purely so ElevenLabs' servers can reach the LLM endpoint, and the free tier shows browsers an interstitial. The free ngrok domain is stable per account, so the agent's Server URL survives a tunnel restart.

Re-seeding personas after editing `lib/personas.ts`: the table only auto-seeds when empty, **and the check is memoised per process** — so `DELETE FROM personas;` alone does nothing until you also restart the dev server.

## Environment Variables (.env.local)
```
ELEVENLABS_API_KEY=     # ElevenLabs API key (needs ElevenAgents write scope)
ELEVENLABS_AGENT_ID=    # ElevenLabs Conversational AI agent ID
ANTHROPIC_API_KEY=      # Anthropic API key
DATABASE_URL=           # PostgreSQL connection string (auto-injected by Railway)
APP_PASSWORD=           # Initial password for the bootstrap admin (used once, at seed time)
ADMIN_USERNAME=         # Optional; bootstrap admin's username, defaults to "admin"
AUTH_SECRET=            # HMAC key for session cookies (openssl rand -base64 32)
LLM_WEBHOOK_TOKEN=      # Bearer token ElevenLabs sends to the custom LLM endpoint
```

All three auth vars are required and the app **fails closed**: a missing
`AUTH_SECRET` throws on every request, a missing `APP_PASSWORD` throws rather
than seeding a guessable admin, and a missing `LLM_WEBHOOK_TOKEN` makes the LLM
endpoint reject everything. Set them before deploying.

`APP_PASSWORD` is **not** a shared team password — it exists only to create the
first admin account. Rotating it after first boot does nothing; reset passwords
from `/admin/users` instead. Rotating `AUTH_SECRET` is the "sign everyone out"
button.

## ElevenLabs Agent Setup
1. Create agent in Conversational AI > Agents
2. Set LLM to "Custom LLM"
3. Server URL: your ngrok/railway base URL (no path — ElevenLabs appends `/v1/chat/completions`)
3a. **API key: set it to the value of `LLM_WEBHOOK_TOKEN`.** ElevenLabs labels this field `OPENAI_API_KEY` in its UI — ignore the label, this app calls Claude. Without a matching value the endpoint returns 401 and the prospect never speaks. Model ID can be any placeholder; the route uses its own.
4. **System prompt on the dashboard must stay neutral.** Do NOT instruct it to conceal being an AI. A prompt containing "never identify as an AI / deny it" gets the agent flagged by ElevenLabs' safety classifier and every session is rejected at the WebSocket with `Agent <id> is unsafe` — while `/api/signed-url` still returns 200, so it looks like an app bug. Something like *"This is a sales-training simulation. A trainee is practising an outbound call and you play the person who answers. Short, natural replies."* is sufficient. This costs nothing: `/api/llm` discards ElevenLabs' system messages entirely, so the dashboard prompt never reaches Claude — the character comes from the persona row.
5. First message: leave empty (rep initiates the call)
6. Voice: pick a South African English voice. One voice serves all personas, so choose one plausible across the whole cast (middle-aged male, neutral) rather than a distinctive young voice
7. Publish the agent after changes — nothing takes effect until you do

## Important Patterns
- **Persona prompt is the source of truth**: The `/api/llm` endpoint ignores all system messages from ElevenLabs and uses only the persona's `systemPrompt` from the database
- **Persona travels with the conversation.** `CallInterface` passes `customLlmExtraBody: { persona_id }` to `Conversation.startSession`; ElevenLabs forwards it as `elevenlabs_extra_body`, and `/api/llm` prefers it over the process-global in `lib/active-persona.ts`. That global is the old single-user path and is **not** concurrency-safe — `/api/llm` logs a warning whenever it has to fall back, which is the signal that the extra body is not arriving
- **Fallback persona**: If persona lookup fails entirely, a complete fallback persona (Pat, an existing MTN customer on ~R450/month) is used — never a generic "helpful assistant" prompt
- **ElevenLabs routes**: Both `/chat/completions` and `/v1/chat/completions` re-export the same `POST` from `/api/llm/route.ts`. They are three separate routes sharing one function, so auth added inside the handler covers all three — but anything file-scoped (route segment config) would need duplicating, and a `proxy.ts` matcher must list all three paths
- **Live coaching**: The `/api/coach` endpoint is called 2 seconds after each prospect message, sending the transcript to Claude for contextual suggestions
- **Thinking is disabled on every Claude call.** `claude-sonnet-5` runs adaptive thinking when `thinking` is unset, and `max_tokens` caps thinking *plus* reply text. With `/api/llm` at 256 and `/api/coach` at 200, replies would truncate — and worse, `coach`, `score` and `personas/generate` all read `response.content[0]` expecting text, which would be a thinking block instead, silently returning `""`. Do not remove `thinking: { type: "disabled" }` without also rewriting that parsing
- **`/api/llm` clamps its inputs**: `max_tokens` to 400, history to the last 40 messages, and `temperature` is no longer forwarded at all (Sonnet 5 rejects non-default sampling parameters)
- **Personas are stripped by default**: `GET /api/personas` omits `systemPrompt` unless `?include_prompt=1`. `/admin` passes that flag because its edit form needs it. This is not an authorization boundary — any signed-in rep can request it — it just keeps the prospect's behaviour rules out of the four pages trainees use daily
- **`GET /api/sessions` omits transcripts** from the list response; full transcripts come only from the `?id=` lookup, which is owner-or-admin. A session belonging to someone else returns **404, not 403** — a 403 would confirm the ID exists
- **Authorization is layered.** `proxy.ts` gates on the role signed into the cookie and never touches the database (importing `lib/db` there would pull `pg` into the proxy graph). Every route that touches data re-checks via `lib/session.ts`, which is what makes a deactivation take effect immediately instead of at token expiry. `app/layout.tsx` closes the page-level gap: it already reads the user for the header, so a cookie that verifies but resolves to no active user redirects to `/login`

## Known Limitations
- **One voice for every persona.** A single ElevenLabs agent serves all six, so Leo (26), Raj (41) and Greg (47) sound identical. This is why the whole cast is written male. Fixing it is smaller than it looks: `Conversation.startSession` accepts `overrides.tts.voiceId` (see `@elevenlabs/client` `BaseConnection.d.ts`), so a `voice_id` column on `personas` and one line in `CallInterface` would do it — no second agent needed. The agent's security settings must allow the override.
- **`lib/active-persona.ts` still exists as a fallback.** The concurrency-safe path (`customLlmExtraBody`) is in place and verified server-side, but the global has not been deleted until a live ElevenLabs call confirms the extra body arrives. Delete `lib/active-persona.ts` and the `setActivePersona` call in `/api/signed-url` once the `[LLM] WARNING: no persona_id` line stops appearing during real calls.
- **Rate limiting is in-memory and per-process** (`lib/rate-limit.ts`), so it resets on redeploy and would allow double the limit across two Railway replicas.
- **`x-forwarded-for` is trusted as-is** for the per-IP login throttle, so a caller who sets that header can rotate past it. The per-username key is what actually bounds guessing at a single account.
- **The role in the cookie can be up to 7 days stale.** It only controls which page shell renders — every data route re-checks against the database — but a demotion isn't visible in `proxy.ts` until the token expires or the user signs in again.
- **Reps can see each other's names and scores** on the leaderboard by design. Transcripts are private to their owner and to admins.

## Branches and Releases

**Check for unmerged `release-*` branches before starting work.** `main` has been
stale before, and building on it without looking cost a rebuild of work that
already existed.

Releases are cut as `release-<major>.<minor>` branches (`release-2.1`,
`release-5.0`). `release-v2.0` uses an older `v`-prefixed form; the newer
unprefixed style is the one to follow. From v5.0.0 the release is *also* tagged
(`v5.0.0`, lowercase `v`) with a GitHub Release — the branch alone doesn't give
you a changelog or a downloadable artefact.

### Retired: `release-2.1` and `release-v2.0`

Both branch off `a2b6cbf` and were **never merged into `main`**. They are kept
as history and are not the current line. Retired deliberately when v5.0.0 was
cut, in full knowledge of what that drops:

| On `release-2.1`, not in v5.0.0 | |
|---|---|
| `lib/rep-profile.ts` | Configurable rep profile — company, plan, data/voice/SMS, price, promotion, training focus |
| `app/settings/page.tsx` | Settings UI for the above (343 lines) |
| `app/api/parse-plan-image/route.ts` | Parses a plan screenshot to auto-fill the profile |
| `components/HomeClient.tsx` | Home page refactor |
| `scripts/generate-sa-personas.mjs` | SA persona generator |
| `lib/personas.ts` | A **different** MTN South African cast — Sipho Dlamini, Thulani Nkosi, Bongani Zulu |

That branch had already localised the app for MTN South Africa, with plan
details configurable per rep rather than hardcoded. v5.0.0 solved the same
problem independently and hardcodes the four plans instead. **Ten files collide
between the two**, `lib/personas.ts` and `CLAUDE.md` most sharply — both were
rewritten wholesale on each side, so there is no clean merge. If any of the
above is wanted later, cherry-pick the self-contained additions
(`lib/rep-profile.ts`, `app/settings/page.tsx`, `app/api/parse-plan-image/`)
rather than attempting a branch merge.

## Deployment (Railway)
- `railway.json` configured with Nixpacks builder and standalone output
- Set env vars in Railway dashboard (DATABASE_URL auto-injected from Railway Postgres)
- **Set `APP_PASSWORD`, `AUTH_SECRET` and `LLM_WEBHOOK_TOKEN` before the first deploy** — the app fails closed without them
- **First deploy is a hard cutover.** Existing cookies stop verifying and there is no shared password any more. Sign in as the bootstrap admin, change its password, then create accounts at `/admin/users` before anyone tries to train
- Set `PORT=8080` and `HOSTNAME=0.0.0.0` in Railway variables
- Update ElevenLabs agent Server URL to Railway public URL, then **republish** — changing the URL without republishing silently keeps the old one
- `/api/health` must stay public in `proxy.ts` or Railway's healthcheck fails and the deploy never promotes. This is an easy thing to break and a hard symptom to trace back to auth
- No ngrok needed in production
