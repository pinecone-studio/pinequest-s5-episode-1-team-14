// Дуудлага бүрийн system instruction: persona, одоогийн огноо, дуудагчийн
// дугаар болон батлагдсан мэдлэгийг бүхэлд нь агуулна. Мэдлэг цөөн тул
// хайлтын tool дуудахын оронд шууд prompt-д өгнө — нэг эргэлт хэмнэж,
// залгавартай асуултад ("буузны үнэ") түлхүүр үг таарахгүй байх асуудалгүй.

import { CALENDAR_TIME_ZONE } from "../calendar/googleCalendar.js";
import { KNOWLEDGE_GROUNDING_INSTRUCTION } from "../knowledge/rag.js";
import type { KnowledgeItem } from "../knowledge/store.js";

// Gemini холбогдохыг хүлээлгүй шууд тоглуулна; AI гэдгээ эхэнд нь мэдэгдэнэ.
export const CALL_GREETING = "Сайн байна уу? Би AI туслах байна. Танд юугаар туслах вэ?";

const PERSONA_INSTRUCTION = `Чи бол Улаанбаатар хотын жижиг рестораны монгол
хэлээр ярьдаг AI ресепшн ажилтан. Зочдод эелдэг, товч, ойлгомжтой хариулна.

Цаг захиалгатай холбоотой дүрэм (ЗААВАЛ):
- Захиалгыг ХЭЗЭЭ Ч "баталгаажлаа", "захиаллаа" гэж амаар бүү хэл — зөвхөн
  create_appointment function амжилттай ажилласны дараа л баталгаажсан гэж үзнэ.
- create_appointment дуудахаасаа өмнө заавал check_availability-гаар сул цаг
  шалгасан байх ёстой.
- Функц алдаа буцаавал зочинд үнэнээр хэлж, өөр цаг санал болго, худал
  баталгаажуулалт бүү хэл.`;

const WEEKDAYS: Record<string, string> = {
  Monday: "Даваа", Tuesday: "Мягмар", Wednesday: "Лхагва", Thursday: "Пүрэв",
  Friday: "Баасан", Saturday: "Бямба", Sunday: "Ням",
};

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "long",
});

export function buildSystemInstruction(input: {
  knowledge: readonly KnowledgeItem[];
  callerPhone?: string | null;
  // false: мэндчилгээг систем тоглуулаагүй, загвар өөрөө эхэлж хэлнэ.
  greeted?: boolean;
  now?: Date;
}): string {
  const p = Object.fromEntries(clock.formatToParts(input.now ?? new Date()).map(({ type, value }) => [type, value]));
  const sections = [
    PERSONA_INSTRUCTION,
    `Одоо ${p.year}-${p.month}-${p.day} (${WEEKDAYS[p.weekday]} гараг) ${p.hour}:${p.minute}, Улаанбаатарын цаг (+08:00).
"Өнөөдөр", "маргааш", гарагийн нэр зэргийг энэ огнооноос тооцоол.`,
    input.greeted === false
      ? `Дуудлага холбогдмогц хамгийн түрүүнд "${CALL_GREETING}" гэж нэг удаа мэндэл.`
      : `Дуудлагын эхэнд систем чиний өмнөөс "${CALL_GREETING}" гэж аль хэдийн мэндэлсэн.
Дахин бүү мэндэл, өөрийгөө дахин бүү танилцуул.`,
  ];
  if (input.callerPhone) {
    sections.push(`Дуудагчийн утасны дугаар: ${input.callerPhone}. Захиалгад өөр дугаар хэлээгүй бол
үүнийг ашиглана, гэхдээ захиалахаас өмнө зочноор баталгаажуул.`);
  }
  // Баримтыг итгэмжлэгдсэн зааврын дараа, тусад нь JSON өгөгдөл болгон өгнө.
  const items = input.knowledge.map(({ id, category, title, content, price }) => ({ id, category, title, content, price }));
  sections.push(KNOWLEDGE_GROUNDING_INSTRUCTION, JSON.stringify({ approvedBusinessKnowledge: items }));
  return sections.join("\n\n");
}
