// Gemini Live session: Монгол хэлний AI ресепшн ажилтан, RAG болон Calendar
// function calling-той. gemini-3.8-live нь responseModalities: TEXT дэмждэггүй
// тул AUDIO + outputAudioTranscription ашиглаж, текстийг
// serverContent.outputTranscription-ээс авна (аудиог үл хэрэгсэнэ, ElevenLabs
// доод түвшинд бодит дуу хоолой гаргана).

import { GoogleGenAI, Modality, Type, type Tool } from "@google/genai";
import { lookupBusinessContext, KNOWLEDGE_GROUNDING_INSTRUCTION } from "../knowledge/rag.js";
import { checkAvailability, createAppointment } from "../calendar/googleCalendar.js";
import { randomUUID } from "node:crypto";

const MODEL = "gemini-3.8-live";

const PERSONA_INSTRUCTION = `Чи бол Улаанбаатар хотын жижиг рестораны монгол
хэлээр ярьдаг AI ресепшн ажилтан. Зочдод эелдэг, товч, ойлгомжтой хариулна.

Цаг захиалгатай холбоотой дүрэм (ЗААВАЛ):
- Захиалгыг ХЭЗЭЭ Ч "баталгаажлаа", "захиаллаа" гэж амаар бүү хэл — зөвхön
  create_appointment function амжилттай ажилласны дараа л баталгаажсан гэж үзнэ.
- create_appointment дуудахаасаа өмнө заавал check_availability-гаар сул цаг
  шалгасан байх ёстой.
- Функц алдаа буцаавал зочинд үнэнээр хэлж, өөр цаг санал болго, худал
  баталгаажуулалт бүү хэл.`;

const SYSTEM_INSTRUCTION = `${PERSONA_INSTRUCTION}\n\n${KNOWLEDGE_GROUNDING_INSTRUCTION}`;

const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "lookup_business_info",
        description: "Рестораны цэс, цагийн хуваарь, журам зэрэг мэдээлэл хайх.",
        parameters: {
          type: Type.OBJECT,
          properties: { query: { type: Type.STRING, description: "Хэрэглэгчийн асуулт" } },
          required: ["query"],
        },
      },
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
        description: "Баталгаажсан захиалга үүсгэх — зөвхön check_availability-ээр сул гэдгийг нотолсны дараа дуудна.",
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
      case "lookup_business_info":
        return lookupBusinessContext(String(args.query));
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
  onTurnComplete?: () => void;
  onError?: (message: string) => void;
  onClose?: (reason: string) => void;
};

export async function createGeminiLiveSession(callbacks: GeminiLiveCallbacks) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY тохируулаагүй байна");

  const ai = new GoogleGenAI({ apiKey });

  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: TOOLS,
    },
    callbacks: {
      onopen: () => callbacks.onOpen?.(),
      onmessage: async (message) => {
        if (process.env.DEBUG_GEMINI) console.debug("[gemini]", JSON.stringify(message));
        const text = message.serverContent?.outputTranscription?.text;
        if (text) callbacks.onText?.(text);
        if (message.serverContent?.turnComplete) callbacks.onTurnComplete?.();

        if (message.toolCall?.functionCalls) {
          const functionResponses = [];
          for (const call of message.toolCall.functionCalls) {
            const result = await runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>);
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
