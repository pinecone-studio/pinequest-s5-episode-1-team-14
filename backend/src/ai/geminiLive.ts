// Gemini Live API session wrapper (response_modalities: ["TEXT"]).
// Takes 24kHz PCM audio in, returns text — audio synthesis happens
// downstream in src/voice/elevenlabs.ts so we can use a cloned voice.

export function createGeminiLiveSession(): void {
  throw new Error("not implemented");
}
