// Утасны дугаарыг дуу болгохын өмнө хоёр хоёр оронгоор нь монгол үг болгоно:
// "99112233" → "ерэн ес, арван нэг, хорин хоёр, гучин гурав". Цифрээр нь өгвөл
// дуу хоолой "долоон хоёрын" гэх мэт буруу уншдаг.

const UNITS = ["тэг", "нэг", "хоёр", "гурав", "дөрөв", "тав", "зургаа", "долоо", "найм", "ес"];
const TENS = ["", "арав", "хорь", "гуч", "дөч", "тавь", "жар", "дал", "ная", "ер"];
const TENS_BEFORE_UNIT = ["", "арван", "хорин", "гучин", "дөчин", "тавин", "жаран", "далан", "наян", "ерэн"];

// 0–99 хоёр оронтой хэсэг; эхэндээ 0-тэй бол ("05") "тэг тав" гэж уншина.
export function pairToWords(pair: string): string {
  const [tens, units] = [Number(pair[0]), Number(pair[1])];
  if (tens === 0) return `тэг ${UNITS[units]}`;
  return units === 0 ? TENS[tens] : `${TENS_BEFORE_UNIT[tens]} ${UNITS[units]}`;
}

// 8 оронтой дугаар (зай, зураастай ч, +976-тай ч) бүрийг үгээр сольно.
export function speakPhoneNumbers(text: string): string {
  return text.replace(/(?:\+?976[\s-]?)?(?<!\d)\d(?:[\s-]?\d){7}(?!\d)/g, (match) => {
    const digits = match.replace(/\D/g, "").slice(-8);
    return [0, 2, 4, 6].map((index) => pairToWords(digits.slice(index, index + 2))).join(", ");
  });
}

// Тоо (үнэ, цаг, хүний тоо) үгээр: дуу хоолой цифрийг хэмнэлгүй, гацаж уншдаг.
// Нэр үгийн өмнө залгах хэлбэрээр: "8 цагт" → "найман цагт", "5 хүний" → "таван хүний",
// бусад үед үндсэн хэлбэрээр: "18,000." → "арван найман мянга". Үнийг "төгрөг"-гүй хэлнэ.
const UNITS_BEFORE = ["", "нэг", "хоёр", "гурван", "дөрвөн", "таван", "зургаан", "долоон", "найман", "есөн"];

function below1000(value: number, attributive: boolean): string[] {
  const words: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds) {
    if (hundreds > 1) words.push(UNITS_BEFORE[hundreds]);
    words.push(rest || attributive ? "зуун" : "зуу");
  }
  const tens = Math.floor(rest / 10);
  const units = rest % 10;
  if (tens) words.push(units || attributive ? TENS_BEFORE_UNIT[tens] : TENS[tens]);
  // "арван нэгэн цаг", "хорин нэгэн хүн" (ганц "нэг цаг" хэвээр).
  if (units) words.push(attributive ? (units === 1 && words.length ? "нэгэн" : UNITS_BEFORE[units]) : UNITS[units]);
  return words;
}

export function numberToWords(value: number, attributive: boolean): string {
  if (value === 0) return "тэг";
  const thousands = Math.floor(value / 1000);
  const rest = value % 1000;
  const words: string[] = [];
  if (thousands) {
    if (thousands > 1) words.push(...below1000(thousands, true));
    words.push(rest || !attributive ? "мянга" : "мянган");
  }
  words.push(...below1000(rest, attributive));
  return words.join(" ");
}

// Цаг ("18:00"), бутархай, 7-оос дээш оронтой (утасны дугаар г.м.) тоог хөндөхгүй.
export function speakNumbers(text: string): string {
  // Тооны араас "төгрөг", "₮" хэлэхгүй: "18,000 төгрөг." → "18,000."
  const withoutCurrency = text.replace(/(\d)\s*(?:₮|төгрөг(?![\p{L}]))/gu, "$1");
  return withoutCurrency.replace(/(?<![\d:.,])(\d{1,3}(?:,\d{3})+|\d{1,6})(?![\d:]|[.,]\d)(\s*)(?=(\S?))/gu, (match, digits: string, space: string, next: string) => {
    const value = Number(digits.replace(/,/g, ""));
    const attributive = /\p{L}/u.test(next) && space.length > 0;
    return numberToWords(value, attributive) + space;
  });
}

// Цагийг үгээр, нөхцөлийг нь зөв залгаж: "18:00 цагт" → "арван найман цагт",
// "11:00-оос" → "арван нэгэн цагаас", "7:30-д" → "долоон цаг хагаст". Дуу хоолой
// "18:00-оос" гэх мэтийг тоо, зураас, нөхцөл гэж салгаж эвгүй уншдаг.
const CASES: [RegExp, Record<"цаг" | "хагас" | "минут", string>][] = [
  [/^(аас|оос|ээс|өөс)$/, { цаг: "цагаас", хагас: "хагасаас", минут: "минутаас" }],
  [/^(д|т|ад|од|эд|өд)$/, { цаг: "цагт", хагас: "хагаст", минут: "минутад" }],
  [/^(ийн|ын|ний|ны|ний)$/, { цаг: "цагийн", хагас: "хагасын", минут: "минутын" }],
  [/^(тай|той|тэй)$/, { цаг: "цагтай", хагас: "хагастай", минут: "минуттай" }],
  [/^(аар|оор|ээр|өөр)$/, { цаг: "цагаар", хагас: "хагасаар", минут: "минутаар" }],
  [/^(хүртэл)$/, { цаг: "цаг хүртэл", хагас: "хагас хүртэл", минут: "минут хүртэл" }],
];

// Өдрийн хэсэг ба 12 цагийн хэлбэр: 21:30 → "оройн" 9:30. Утсаар 24 цагаар хэлэх нь хиймэл сонсогддог.
// part: "оройн 7 цагт"; adverb: хагаст хүмүүс "орой долоо хагаст" гэж ярьдаг.
function dayPart(hours: number): { part: string; adverb: string; hour: number } {
  const hour = hours % 12 || 12;
  if (hours < 5) return { part: "шөнийн", adverb: "шөнө", hour };
  if (hours < 12) return { part: "өглөөний", adverb: "өглөө", hour };
  if (hours < 18) return { part: "өдрийн", adverb: "өдөр", hour };
  return { part: "оройн", adverb: "орой", hour };
}

function timeToWords(hours: number, minutes: number, suffix: string, withPart: boolean): string {
  const last = minutes === 0 ? "цаг" : minutes === 30 ? "хагас" : "минут";
  const ending = CASES.find(([pattern]) => pattern.test(suffix))?.[1][last] ?? last + suffix;
  const { part, adverb, hour: twelve } = dayPart(hours);
  if (minutes === 30) return `${withPart ? `${adverb} ` : ""}${numberToWords(twelve, false)} ${ending}`;
  const hour = (withPart ? `${part} ` : "") + numberToWords(twelve, true);
  if (minutes === 0) return `${hour} ${ending}`;
  return `${hour} цаг ${numberToWords(minutes, true)} ${ending}`;
}

const PART_BEFORE = /(?:өглөөний|өдрийн|үдийн|оройн|шөнийн)\s+$/u;

export function speakTimes(text: string): string {
  // "18:00 цагт", "18:00-оос", "18:00" (өмнө нь "оройн" байвал давхардуулахгүй).
  const clock = text.replace(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?:\s+цаг(\p{L}*)|[-‐](\p{L}+))?/gu,
    (_match, h: string, m: string, afterWord: string | undefined, afterDash: string | undefined, offset: number, whole: string) =>
      timeToWords(Number(h), Number(m), afterWord ?? afterDash ?? "", !PART_BEFORE.test(whole.slice(0, offset))));
  // "21 цаг 30 минутад", "15 цагт" гэх мэт 24 цагийн хэлбэр (13-23); 12-оос бага цагийг хөндөхгүй.
  // "7 цаг хагаст", "19 хагаст" → "долоо хагаст" (өдрийн хэсгийг 13-аас дээш цагт л нэмнэ).
  // Өмнө нь "оройн" гэж бичсэн бол хагасын өмнө "орой" болгоно: "оройн 8 хагаст" → "орой найм хагаст".
  const half = clock.replace(/(?:(өглөөний|өдрийн|оройн|шөнийн)\s+)?(?<![\d:])(\d{1,2}) (?:цаг )?хагас(\p{L}*)/giu,
    (match, part: string | undefined, h: string, suffix: string, offset: number, whole: string) => {
      if (Number(h) > 23) return match;
      if (part) {
        const adverb = { өглөөний: "өглөө", өдрийн: "өдөр", оройн: "орой", шөнийн: "шөнө" }[part.toLowerCase() as "оройн"];
        const word = part[0] === part[0].toUpperCase() ? adverb[0].toUpperCase() + adverb.slice(1) : adverb;
        return `${word} ${timeToWords(Number(h), 30, suffix, false)}`;
      }
      return timeToWords(Number(h), 30, suffix, Number(h) > 12 && !PART_BEFORE.test(whole.slice(0, offset)));
    });
  return half.replace(/(?<![\d:])(1[3-9]|2[0-3]) цаг(?:\s+(\d{1,2}) минут(\p{L}*)|(\p{L}*))(?!\p{L})/gu,
    (_match, h: string, m: string | undefined, minuteSuffix: string | undefined, hourSuffix: string | undefined, offset: number, whole: string) =>
      timeToWords(Number(h), Number(m ?? 0), (m ? minuteSuffix : hourSuffix) ?? "", !PART_BEFORE.test(whole.slice(0, offset))));
}
