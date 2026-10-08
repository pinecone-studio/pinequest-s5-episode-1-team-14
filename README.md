# pinequest-s5-episode-1-team-14

AI Front-Desk Mongolia — an AI receptionist that answers a small business's
real phone number in Mongolian, answers questions grounded in the business's
own knowledge base, and books appointments on a real calendar.

The description above is the product goal. The current repository is a scaffold
with one manual Gemini Live experiment; a working phone agent is not implemented yet.

## Repository audit

Initial audited base: `main` at `a16b0d0` (2026-10-06). The fresh checkout was clean
and matched `origin/main`. Setup details below include the dependency/CI follow-up.
The official repository is
`pinecone-studio/pinequest-s5-episode-1-team-14`.

```text
package.json                 npm workspaces: backend, pwa
package-lock.json            locked dependencies for both workspaces
.nvmrc                       exact Node.js version used locally and in CI
.github/workflows/ci.yml      PR lint/build checks targeting main
backend/
  .env.example               server-side environment template
  package.json               Node.js + TypeScript, ws, dotenv, @google/genai
  src/
    index.ts                 prints a placeholder message; opens no port
    ai/geminiLive.ts          session wrapper stub
    ai/test-live-mongolian.ts manual Gemini Live experiment
    telephony/twilio.ts       media stream stub
    voice/elevenlabs.ts       TTS stub
    knowledge/rag.ts          knowledge lookup stub
    calendar/googleCalendar.ts booking stub
pwa/
  package.json               Next.js 14 + React 18 + TypeScript
  app/layout.tsx             Mongolian document language and metadata
  app/page.tsx               placeholder home page at /
```

### Current implementation

| Area | What exists now |
| --- | --- |
| Package manager | npm 11.12.1, declared root workspaces `backend` and `pwa`, one committed root lockfile |
| Frontend | Next.js App Router scaffold; no dashboard, API client, mock adapter, Tailwind configuration, or browser call UI |
| Backend | Strict TypeScript; entry point only logs, even though its message says “listening” |
| APIs | No HTTP routes, Next.js API routes, or WebSocket server; `ws` is installed as a declared dependency but unused |
| Gemini | Manual script loads `backend/.env`, connects with AUDIO output and transcription, then sends three Mongolian prompts |
| Other integrations | Gemini wrapper, Twilio, ElevenLabs, RAG, and Calendar exports throw `not implemented`; no runtime callers |
| Database/storage | None: no database client, schema, migrations, call records, or booking persistence |
| Shared packages | None; add shared contracts only when a real frontend/backend integration needs them |
| Environment | `backend/.env.example` exists; no frontend environment variables are currently read |
| Testing | One live Gemini script; no automated test suite or dedicated `typecheck` script |

The Gemini experiment hard-codes `gemini-3.8-live`; availability and access have
not been verified. It spaces messages using a four-second delay rather than
waiting for a completed turn. Its restaurant facts are sample prompt content,
not an approved knowledge store. The reusable wrapper's TEXT-output comment
also differs from the experiment's AUDIO configuration. Resolve these points
in the Gemini PRs before using the experiment in a real call.

## Local setup

Use [Node.js **24.15.0**](https://nodejs.org/en/download/archive/v24.15.0) with its
bundled npm **11.12.1**. The exact Node.js version is in `.nvmrc`; CI reads that
same file. `package.json` declares npm 11.12.1 and
the compatible Node.js 24 / npm 11 major versions. If you use nvm, run
`nvm install 24.15.0` and `nvm use 24.15.0`; otherwise install the version in `.nvmrc`
with your usual Node.js installer. Check `node --version` and `npm --version`
before installing dependencies.

From the repository root:

```bash
npm ci
cp backend/.env.example backend/.env
```

PowerShell equivalent (use `npm.cmd` if execution policy blocks `npm.ps1`):

```powershell
npm.cmd ci
Copy-Item backend/.env.example backend/.env
```

Copy the template only for a new checkout; preserve an existing local `.env`.
Run [`npm ci`](https://docs.npmjs.com/cli/v11/commands/npm-ci/) from the root to
install both workspaces from `package-lock.json`. It replaces installed
dependencies and fails if a manifest disagrees with the
lockfile. Use `npm install` only when intentionally changing dependencies, and
commit the updated manifest and root lockfile together in that feature's PR.

Run these in separate terminals from the root:

```bash
npm run dev:backend
npm run dev:pwa
```

The frontend is available at `http://localhost:3000`. The backend command runs
the placeholder in watch mode; there is no service at port 8080 yet.

### Environment variables

Backend scripts use `dotenv/config`. The root workspace scripts run in
`backend/`, so credentials belong in `backend/.env`, not a root or frontend env file.

| Variable | Current usage |
| --- | --- |
| `PORT` | Defaults to `8080`; only displayed by the backend placeholder |
| `GEMINI_API_KEY` | Required only for the manual Gemini experiment |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Reserved for the TTS integration; unused today |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Reserved for telephony; unused today |
| `GOOGLE_CALENDAR_CLIENT_EMAIL`, `GOOGLE_CALENDAR_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` | Reserved for Calendar; unused today |

No credentials are required for the scaffold's lint/build or frontend page.
Keep real values in ignored local env files. Only `.env.example` templates with
empty secrets belong in Git. Never put private keys or provider tokens in
`NEXT_PUBLIC_*` variables. Add `NEXT_PUBLIC_API_BASE_URL` and a centralized mock
mode when the frontend API adapter is implemented; neither is consumed now.

## Scripts and validation

Run root scripts from the repository root. Use `--workspace` for package scripts.

| Location | Existing scripts |
| --- | --- |
| Root | `dev:backend`, `dev:pwa`, `build:backend`, `build:pwa`, `lint` |
| `backend` | `dev`, `build`, `start`, `lint`, `test:gemini-mn` |
| `pwa` | `dev`, `build`, `start`, `lint` |

```bash
npm run lint
npm run build:backend
npm run build:pwa
```

The backend build runs strict TypeScript checking and emits `backend/dist/`.
The Next.js build includes frontend type checking. Neither package defines a
separate `typecheck` or automated `test` script. Production `start` scripts
require their corresponding build first; backend `start` still only prints
the placeholder message and exits.

Optional manual provider check, after configuring `GEMINI_API_KEY`:

```bash
npm run test:gemini-mn --workspace=backend
```

This makes real API requests and may consume provider quota; it is not an
offline regression test or proof that the phone flow works. The hard-coded
model must first be verified for the configured account.

CI runs `npm ci`, lint, and both builds for PRs to `main`. It selects Node.js from
`.nvmrc` and keys the npm cache from the root `package-lock.json`. Local checks
should use that same runtime and locked install.

## Proposed small PR sequence

Each row is one branch and one PR. The audit (row 1) is merged; the dependency/CI
follow-up covers only row 2.
Implement each later row after the preceding dependency has been approved,
merged, and pulled from `main`. This sequence reuses the existing scaffolds
and experiment; it does not import another repository.

| Order | Branch | Reviewable scope |
| --- | --- | --- |
| 1 | `chore/repository-audit` | Actual architecture, setup/validation docs, env template comments, and ignore rules |
| 2 | `chore/reproducible-install` | Commit npm lockfile, select supported runtime, make CI use the locked install |
| 3 | `feat/gemini-client` | Reuse the installed SDK and experiment; validate configuration and model access |
| 4 | `feat/gemini-live-session` | Implement the existing wrapper with turn completion, errors, and cleanup |
| 5 | `feat/twilio-voice-webhook` | HTTP entry point and validated incoming-call webhook returning stream instructions |
| 6 | `feat/twilio-media-stream` | Implement WebSocket start/media/stop lifecycle in the existing telephony module |
| 7 | `feat/audio-codecs` | Tested mu-law/PCM conversion and the sample rates required by the providers |
| 8 | `feat/elevenlabs-tts` | Implement the existing TTS module using an available voice; cloning can follow later |
| 9 | `feat/phone-conversation` | Connect the reviewed modules for one real incoming Mongolian conversation |
| 10 | `feat/knowledge-store` | Choose persistence and add approved business information schema/data access |
| 11 | `feat/rag-grounding` | Implement verified lookup and an explicit no-result response in the existing RAG module |
| 12 | `feat/calendar-availability` | Calendar configuration and available-slot tool with timezone handling |
| 13 | `feat/calendar-booking` | Confirmed, duplicate-safe booking creation and persisted calendar event IDs |
| 14 | `feat/call-sessions` | Persist call lifecycle metadata and expose the read API needed by the dashboard |
| 15 | `feat/web-api-adapter` | Frontend API configuration and centralized mock data; share consumed API types |
| 16 | `feat/web-dashboard-shell` | Existing `pwa` navigation/layout and responsive dashboard shell |
| 17 | `feat/web-dashboard-overview` | Summary API plus KPI cards, recent activity, and system status |
| 18 | `feat/web-calls` | Call history/detail UI using the reviewed call API |
| 19 | `feat/web-bookings` | Booking read API and booking list/status UI |
| 20 | `feat/web-knowledge` | Validated knowledge CRUD API and management UI |
| 21 | `feat/web-analytics` | Defined metrics/aggregates and analytics view |
| 22 | `feat/web-demo` | Browser conversation fallback using the reviewed backend |
| 23 | `feat/web-settings` | Non-secret business settings and integration status |
| 24 | `feat/guardrails` | Explicit human handoff and domain/factual fallback behavior |
| 25 | `test/end-to-end-demo` | Real-call, booking, grounding, and browser fallback integration checks |
| 26 | `docs/demo-guide` | Final setup, demo rehearsal, known limitations, and operating guide |

Keep trust-boundary validation and error handling in the feature that introduces
them. If a row grows beyond one reviewable feature, split it before implementation.
The sequence is a proposed dependency order, not a guarantee of the 14-day schedule.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch/approval workflow.
