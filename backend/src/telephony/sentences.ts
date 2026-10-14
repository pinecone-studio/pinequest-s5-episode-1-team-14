// Урсаж ирэх текстээс бүтэн өгүүлбэрүүдийг салгана. Цифрийн дараах цэг
// ("15.000", "11.00") нь тооны хэсэг байж болох тул ард нь зай иртэл хүлээнэ.
const SENTENCE_END = /(?:[!?…]|(?<!\d)\.|(?<=\d)\.(?=\s))+/;

// Өгүүлбэр дуусаагүй ч эхний таслал (ард нь зай) дээр хуваана: эхний дууг эрт эхлүүлэхэд.
// Хэт богино хэсгийг ("За,") тусад нь уншвал тасархай сонсогдох тул доод урттай.
export function takeFirstClause(buffer: string, minLength = 12): { sentences: string[]; rest: string } {
  const comma = buffer.slice(minLength).search(/,\s/);
  if (comma < 0) return { sentences: [], rest: buffer };
  const splitAt = minLength + comma + 1;
  return { sentences: [buffer.slice(0, splitAt)], rest: buffer.slice(splitAt) };
}

export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  let match: RegExpMatchArray | null;
  while ((match = rest.match(SENTENCE_END))) {
    const splitAt = (match.index ?? 0) + match[0].length;
    sentences.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt);
  }
  return { sentences, rest };
}
