// Twilio Media Streams <-> backend WebSocket bridge.
// Receives 8kHz mu-law audio from an inbound/outbound call, forwards it
// to the Gemini Live session (src/ai/geminiLive.ts) after resampling.

export function handleTwilioMediaStream(): void {
  throw new Error("not implemented");
}
