# pinequest-s5-episode-1-team-14

AI Front-Desk Mongolia — an AI receptionist that answers a small business's
real phone number in Mongolian, answers questions grounded in the business's
own knowledge base, and books appointments on a real calendar.

## Structure

- `backend/` — Node.js + TypeScript WebSocket relay (Twilio ↔ Gemini Live API ↔ ElevenLabs), RAG, Google Calendar function calling
- `pwa/` — Next.js dashboard + backup web call channel

## Getting started

```bash
npm install
cp backend/.env.example backend/.env   # fill in API keys
npm run dev:backend
npm run dev:pwa
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch/PR workflow.