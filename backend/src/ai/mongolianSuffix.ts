// Бизнесийн нэрэнд нөхцөлийг эгшиг зохицлоор залгана: "Тал Нутаг" → "Тал Нутагтай", "Тал Нутгаас".
// Латин нэрэнд ("CallAI") зураасаар: "CallAI-тай".

type Harmony = "а" | "о" | "э" | "ө";

function harmony(word: string): Harmony {
  const vowels = word.toLowerCase().replace(/[^аоуэөүеёяюи]/g, "");
  if (/[ауяю]/.test(vowels)) return "а";
  if (/[оё]/.test(vowels)) return "о";
  if (/ө/.test(vowels)) return "ө";
  return "э";
}

const COMITATIVE: Record<Harmony, string> = { а: "тай", о: "той", э: "тэй", ө: "тэй" };
const ABLATIVE: Record<Harmony, string> = { а: "аас", о: "оос", э: "ээс", ө: "өөс" };

// Олон үетэй үгийн сүүлийн богино эгшиг эгшгээр эхэлсэн нөхцөлийн өмнө гээгдэнэ: нутаг → нутгаас, наадам → наадмаас.
function dropFleeting(word: string): string {
  const syllables = word.toLowerCase().match(/[аоуэөүеёяюи]+/g) ?? [];
  const match = word.match(/^(.*[бвгджзклмнпрстфхцчшщ])([аоэө])([глрмсдвб])$/iu);
  return syllables.length >= 2 && match ? match[1] + match[3] : word;
}

export function withSuffix(name: string, kind: "comitative" | "ablative"): string {
  const trimmed = name.trim();
  const last = trimmed.split(/\s+/).pop() ?? trimmed;
  if (!/[а-яөүё]/iu.test(last)) return `${trimmed}-${kind === "comitative" ? "тай" : "аас"}`;
  const group = harmony(last);
  if (kind === "comitative") return trimmed + COMITATIVE[group];
  const head = trimmed.slice(0, trimmed.length - last.length);
  const vowelEnd = /[аоуэөүеёяюи]$/iu.test(last);
  return head + (vowelEnd ? `${last}г${ABLATIVE[group]}` : dropFleeting(last) + ABLATIVE[group]);
}
