import "dotenv/config";

const PORT = process.env.PORT ?? 8080;

console.log(`backend placeholder listening on port ${PORT}`);

// TODO(#telephony): mount Twilio Media Streams WebSocket server here
// TODO(#ai): bridge audio to Gemini Live API session
// TODO(#voice): pipe Gemini text response through ElevenLabs TTS
