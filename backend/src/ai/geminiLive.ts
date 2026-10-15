// Gemini Live session: Монгол хэлний AI ресепшн ажилтан, Calendar function
// calling-той. Бизнесийн мэдлэг system instruction-д бүхлээрээ орно
// (callPrompt.ts). gemini-3.8-live нь responseModalities: TEXT дэмждэггүй
// тул AUDIO + outputAudioTranscription ашиглаж, текстийг
// serverContent.outputTranscription-ээс авна. Дуудагч талд ElevenLabs-аар
// (onText) эсвэл Gemini-ийн өөрийн 24kHz аудиогоор (onAudio) дуу гаргана.

import { GoogleGenAI, Modality, Type, type Tool } from "@google/genai";
import { BusinessKnowledgeStore } from "../knowledge/store.js";
import { belongsTo, DEFAULT_BUSINESS_ID } from "../accounts/store.js";
import { cancelAppointment, checkAvailability, createAppointment, upcomingBookingsFor } from "../calendar/googleCalendar.js";
import { localIso } from "../telephony/reminder.js";
import { buildSystemInstruction } from "./callPrompt.js";
import { randomUUID } from "node:crypto";

const MODEL = "gemini-3.8-live";

export const TOOLS: Tool[] = [
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
            partySize: { type: Type.NUMBER, description: "Хүний тоо" },
          },
          required: ["date", "startTime", "endTime", "durationMinutes", "partySize"],
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
            partySize: { type: Type.NUMBER, description: "Хүний тоо" },
          },
          required: ["customerName", "phone", "serviceId", "serviceName", "startTime", "durationMinutes", "partySize"],
        },
      },
      {
        name: "cancel_appointment",
        description: "Энэ дуудлагын дугаар дээрх захиалгыг цуцлах — зочин цуцлахыг баталгаажуулсны дараа л дуудна.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            startTime: { type: Type.STRING, description: "Захиалгын эхлэх цаг, ISO 8601, жишээ 2026-10-14T20:30:00+08:00" },
          },
          required: ["startTime"],
        },
      },
      {
        name: "find_my_bookings",
        description: "Энэ дуудлагын дугаар дээрх ирээдүйн захиалгуудыг харах — зочин захиалгаа шалгуулах, баталгаажсан эсэхийг асуухад.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "request_human",
        description: "Зочин ажилтан, хүнтэй ярих хүсэлтийг бүртгэх — ажилтан эргэн холбогдоно.",
        parameters: { type: Type.OBJECT, properties: { reason: { type: Type.STRING, description: "Юуны талаар ярих хүсэлтэй" } } },
      },
      {
        name: "end_call",
        description: "Hang up the phone call. Use it in the same reply as your goodbye, once the caller has said they need nothing else. The line closes after your goodbye has finished playing; if the caller speaks again, the call continues.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
    ],
  },
];

const CALENDAR_TOOLS = { check_availability: true, create_appointment: true, cancel_appointment: true, find_my_bookings: true };

// context.callerPhone: зөвхөн энэ дугаарын захиалгыг цуцлах боломжтой.
export async function runTool(name: string, args: Record<string, unknown>, context: { callerPhone?: string | null; businessId?: string } = {}): Promise<unknown> {
  // ponytail: захиалгын календарь одоогоор зөвхөн үндсэн бизнест; бусад бизнест өөрийн календарь холбох хэрэгтэй.
  if (context.businessId && context.businessId !== DEFAULT_BUSINESS_ID && name in CALENDAR_TOOLS) {
    return { error: "Энэ бизнест захиалгын календарь холбогдоогүй. Зочны нэр, утсыг тэмдэглээд ажилтан эргэн холбогдоно гэж хэл." };
  }
  try {
    switch (name) {
      case "check_availability":
        return await checkAvailability({
          date: String(args.date),
          timeRange: { start: String(args.startTime), end: String(args.endTime) },
          durationMinutes: Number(args.durationMinutes),
          partySize: Number(args.partySize) || undefined,
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
          partySize: Number(args.partySize) || undefined,
        });
      case "cancel_appointment":
        if (!context.callerPhone) return { error: "Залгагчийн дугаар тодорхойгүй тул цуцлах боломжгүй; ажилтан холбогдоно гэж хэл." };
        try {
          return await cancelAppointment({ phone: context.callerPhone, startTime: String(args.startTime) });
        } catch (error) {
          // Олдохгүй бол энэ дугаарын захиалгуудыг өгнө: загвар зочноос аль нь болохыг тодруулна.
          const own = await upcomingBookingsFor(context.callerPhone).catch(() => []);
          return {
            error: error instanceof Error ? error.message : "Цуцалж чадсангүй",
            callerBookings: own.map((booking) => ({ startTime: localIso(booking.startTime), customerName: booking.customerName })),
          };
        }
      case "find_my_bookings": {
        if (!context.callerPhone) return { error: "Залгагчийн дугаар тодорхойгүй тул захиалга хайх боломжгүй." };
        const own = await upcomingBookingsFor(context.callerPhone);
        return { bookings: own.map((booking) => ({ startTime: localIso(booking.startTime), customerName: booking.customerName, serviceName: booking.serviceName, partySize: booking.partySize })) };
      }
      case "request_human":
        // Dashboard-д "ажилтантай холбогдох" гэж тэмдэглэгдэнэ (onToolResult).
        return { recorded: true };
      case "end_call":
        // Утсыг дуудлагын хэсэг баяртай гэсэн үг тоглож дууссаны дараа тавина (onToolResult).
        return { ending: true };
      default:
        return { error: `Үл мэдэгдэх function: ${name}` };
    }
  } catch (error) {
    // Функц алдаатай атал Gemini амжилттай гэж андуурахгүй байхын тулд
    // алдааг тодорхой текст болгон буцаана — худал баталгаажуулалт хийхгүй.
    return { error: error instanceof Error ? error.message : "Үл мэдэгдэх алдаа" };
  }
}

// silent: AI чимээгүй; speaking: AI ярьж байна (зөвхөн тод яриа таслана);
// protected: мэндчилгээ тоглож байна — шинэ яриа сонсохгүй.
export type SpeechState = "silent" | "speaking" | "protected";

export type GeminiLiveCallbacks = {
  speechState?: () => SpeechState;
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
  // Зочны яриа танигдмагц (хариултаас өмнө) богино үг хэлэх.
  onAck?: (text: string) => void;
  // Календарь шалгах мэт удаан үйлдлийн өмнө хэлэх богино үг ("За, түр хүлээгээрэй.").
  onHold?: (text: string) => void;
  // Function бүр ажилласны дараа — дуудлагыг захиалга, зорилготой нь холбоход.
  onToolResult?: (name: string, result: unknown) => void;
  onError?: (message: string) => void;
  onClose?: (reason: string) => void;
};

export async function createGeminiLiveSession(
  callbacks: GeminiLiveCallbacks,
  context: { callerPhone?: string | null; greeted?: boolean; greeting?: string; extra?: string; businessId?: string; businessName?: string } = {},
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY тохируулаагүй байна");

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildSystemInstruction({
    // Зөвхөн энэ дуудлагын бизнесийн мэдээлэл.
    knowledge: new BusinessKnowledgeStore().list({ activeOnly: true }).filter(belongsTo(context.businessId ?? DEFAULT_BUSINESS_ID)),
    callerPhone: context.callerPhone,
    greeted: context.greeted,
    greeting: context.greeting,
    extra: context.extra,
    businessName: context.businessName,
    bookingEnabled: !context.businessId || context.businessId === DEFAULT_BUSINESS_ID,
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
            const result = await runTool(call.name ?? "", (call.args ?? {}) as Record<string, unknown>, { callerPhone: context.callerPhone, businessId: context.businessId });
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
