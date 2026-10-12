// Монгол үгийн нөхцөл (тийн ялгал, олон тоо, зэрэг) ялгаатай хоёр үгийг
// адил язгуур гэж үзэх эсэхийг шалгана. Бүрэн морфологийн шинжилгээ биш —
// богино үг нь урт үгийн эхлэл мөн бөгөөд үлдэх сүүл нь мэдэгдэж байгаа
// нөхцөлийн жагсаалтад яг тохирч байвал л таарна гэж үзнэ. Иймээс
// "цаг"/"цагт", "засалт"/"засалтын" мэт хувилбарууд таарах ч "гар"/"гарц"
// мэт өөр язгуурын үгс санамсаргүй таарахгүй.
const KNOWN_SUFFIXES = new Set([
  // Үйлдэл холбох/үгийн сан: олон тоо
  "нууд", "нүүд", "ууд", "үүд",
  // Харьяалах (genitive) / заах (accusative)
  "ийн", "ын", "ийг", "ыг",
  // Өгөх-орших (dative-locative)
  "ад", "эд", "ид", "од", "өд", "д", "т",
  // Гарах (ablative)
  "аас", "ээс", "оос", "өөс",
  // Үйлдэх (instrumental)
  "аар", "ээр", "оор", "өөр",
  // Хамтрах (comitative) / үгүйсгэх
  "тай", "тэй", "той", "гүй",
  // Чиглэл заах
  "руу", "рүү", "луу", "лүү",
]);

const MIN_ROOT_LENGTH = 3;

export function sharesRoot(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < MIN_ROOT_LENGTH || !longer.startsWith(shorter)) return false;
  return KNOWN_SUFFIXES.has(longer.slice(shorter.length));
}
