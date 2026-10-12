// Урсаж ирэх текстээс бүтэн өгүүлбэрүүдийг салгана. Цифрийн дараах цэг
// ("15.000", "11.00") нь тооны хэсэг байж болох тул ард нь зай иртэл хүлээнэ.
const SENTENCE_END = /(?:[!?…]|(?<!\d)\.|(?<=\d)\.(?=\s))+/;

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
