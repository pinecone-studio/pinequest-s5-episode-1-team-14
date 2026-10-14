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
