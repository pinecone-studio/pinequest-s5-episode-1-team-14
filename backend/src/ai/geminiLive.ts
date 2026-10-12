// Gemini Live session: Монгол хэлний AI ресепшн ажилтан, Calendar function
// calling-той. Бизнесийн мэдлэг system instruction-д бүхлээрээ орно
// (callPrompt.ts). gemini-3.8-live нь responseModalities: TEXT дэмждэггүй
// тул AUDIO + outputAudioTranscription ашиглаж, текстийг
// serverContent.outputTranscription-ээс авна. Дуудагч талд ElevenLabs-аар
// (onText) эсвэл Gemini-ийн өөрийн 24kHz аудиогоор (onAudio) дуу гаргана.

import { GoogleGenAI, Modality, Type, type Tool } from "@google/genai";
import { BusinessKnowledgeStore } from "../knowledge/store.js";
import { checkAvailability, createAppointment } from "../calendar/googleCalendar.js";
import { buildSystemInstruction } from "./callPrompt.js";
import { randomUUID } from "node:crypto";

const MODEL = "gemini-3.8-live";

const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "check_availability",
        description: "Тухайн өдөр, цагийн хязгаарт сул цаг байгаа эсэхийг шалгах.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            startTime: { type: Type.STRING, description: "HH:mm" },
            endTime: { type: Type.STRING, description: "HH:mm" },
            durationMinutes: { type: Type.NUMBER },
          },
          required: ["date", "startTime", "endTime", "durationMinutes"],
        },
      },
      {
        name: "create_appointment",
        description: "Баталгаажсан захиалга үүсгэх — зөвхөн check_availability-ээр сул гэдгийг нотолсны дараа дуудна.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            phone: { type: Type.STRING, description: "8 оронтой орон нутгийн дугаар эсвэл +976..." },
            serviceId: { type: Type.STRING },
            serviceName: { type: Type.STRING },
            startTime: { type: Type.STRING, description: "ISO 8601, жишээ 2026-10-11T19:00:00+08:00" },
            durationMinutes: { type: Type.NUMBER },
          },
          required: ["customerName", "phone", "serviceId", "serviceName", "startTime", "durationMinutes"],
        },
      },
    ],
  },
];

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case "check_availability":
        return await checkAvailability({
          date: String(args.date),
          timeRange: { start: String(args.startTime), end: String(args.endTime) },
          durationMinutes: Number(args.durationMinutes),
        });
      case "create_appointment":
        return await createAppointment({
          requestId: randomUUID(),
          customerName: String(args.customerName),
          phone: String(args.phone),
          serviceId: String(args.serviceId),
          serviceName: String(args.serviceName),
          startTime: String(args.startTime),
          durationMinutes: Number(args.durationMinutes),
        });
      default:
        return { error: `Үл мэдэгдэх function: ${name}` };
    }
  } catch (error) {
    // Функц алдаатай атал Gemini амжилттай гэж андуурахгүй байхын тулд
    // алдааг тодорхой текст болгон буцаана — худал баталгаажуулалт хийхгүй.
    return { error: error instanceof Error ? error.message : "Үл мэдэгдэх алдаа" };
  }
}

export type GeminiLiveCallbacks = {
  onOpen?: () => void;
  onText?: (text: string) => void;
  // Дуудагчийн ярианы бичвэр (хэсэг хэсгээр ирнэ) — дуудлагын түүхэнд хадгалахад.
  onCallerText?: (text: string) => void;
  onTurnComplete?: () => void;
  // Gemini-ийн өөрийн дуу: 24kHz, 16-bit little-endian PCM.
  onAudio?: (pcm24k: Buffer) => void;
  // Дуудагч AI-г таслан орж ярихад Gemini-ийн дотоод VAD илрүүлээд дуудна —
  // тоглуулж буй/дараалалд буй хариултыг шууд зогсоох дохио.
  onInterrupted?: () => void;
  // Function бүр ажилласны дараа — дуудлагыг захиалга, зорилготой нь холбоход.
  onToolResult?: (name: string, result: unknown) => void;
  onError?: (message: string) => void;
  onClose?: (reason: string) => void;
};

export async function createGeminiLiveSession(
  callbacks: GeminiLiveCallbacks,
  context: { callerPhone?: string | null; greeted?: boolean } = {},
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY тохируулаагүй байна");

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction({
    knowledge: new BusinessKnowledgeStore().list({ activeOnly: true }),
    callerPhone: context.callerPhone,
    greeted: context.greeted,
  });

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      // languageCodes-ийг Gemini Developer API дэмждэггүй (холболт унагаана) тул хэлийг
      // загвар өөрөө танина — монгол яриаг хааяа өөр хэлээр буруу бичиж болно.
      inputAudioTranscription: {},
      systemInstruction,
      tools: TOOLS,
    },
    callbacks: {
      onopen: () => callbacks.onOpen?.(),
      onmessage: async (message) => {
        if (process.env.DEBUG_GEMINI) console.debug("[gemini]", JSON.stringify(message));
        const text = message.serverContent?.outputTranscription?.text;
        if (text) callbacks.onText?.(text);
        const heard = message.serverContent?.inputTranscription?.text;
        if (heard) callbacks.onCallerText?.(heard);
        if (callbacks.onAudio) {
          for (const part of message.serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) callbacks.onAudio(Buffer.from(part.inlineData.data, "base64"));
          }
        }
        if (message.serverContent?.interrupted) callbacks.onInterrupted?.();
        if (message.serverContent?.turnComplete) callbacks.onTurnComplete?.();

        if (message.toolCall?.functionCalls) {
          const functionResponses = [];
          for (const call of message.toolCall.functionCalls) {
            const result = await runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>);
            callbacks.onToolResult?.(call.name ?? "", result);
            functionResponses.push({ name: call.name, id: call.id, response: { result } });
          }
          session.sendToolResponse({ functionResponses });
        }
      },
      onerror: (e) => callbacks.onError?.(e.message),
      onclose: (e) => callbacks.onClose?.(e.reason),
    },
  });

  return session;
}
