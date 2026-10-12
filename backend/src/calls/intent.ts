import type { CallSession } from "./store.js";

// ponytail: AI-ийн хариултын түлхүүр үгээр таамаглана; нарийвчлал чухал болвол
// дуудлагын дараа загвараар ангилуулна. Захиалга үүссэн бол twilio.ts шууд тэмдэглэдэг.
export function inferIntent(call: { checkedAvailability: boolean; replyText: string }): CallSession["intent"] {
  if (call.checkedAvailability) return "BOOK_APPOINTMENT";
  const text = call.replyText.toLowerCase();
  if (!text.trim()) return null;
  if (/төгрөг|₮|үнэ/.test(text)) return "ASK_PRICE";
  if (/ажилладаг|ажлын цаг|цагийн хуваарь|нээлттэй|нээдэг|хаадаг/.test(text)) return "ASK_OPENING_HOURS";
  return "GENERAL_QUERY";
}
