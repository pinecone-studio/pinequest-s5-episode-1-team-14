// Шинэ дугаарыг бизнест холбох нэг удаагийн команд (сервер дээр ажиллуулна):
//   printf '%s' "<нууц үг>" | npm run line:add -- <8 оронтой дугаар> <бизнес эзний имэйл | default>
// "default" бол үндсэн (рестораны) бизнес. Нууц үг хоосон бол SIP_USER-ийн нууц үгийг (ижил дугаар) ашиглана.
// Нууц үгийг stdin-ээс уншина (shell-ийн түүхэнд үлдэхгүй). Дараа нь сервисийг дахин эхлүүлнэ.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BUSINESS_ID, normalizeEmail, type Account } from "../accounts/store.js";
import { readJsonArray } from "../storage/jsonFile.js";
import { LineStore } from "./lines.js";

const [number, emailInput] = process.argv.slice(2);
const email = normalizeEmail(emailInput);
const toDefault = emailInput === DEFAULT_BUSINESS_ID;
const password = readFileSync(0, "utf8").trim() || (number === process.env.SIP_USER ? process.env.SIP_PASSWORD ?? "" : "");
const account = toDefault ? { businessId: DEFAULT_BUSINESS_ID } : (readJsonArray(resolve(__dirname, "../../data/accounts.json")) as Account[]).find((item) => item.email === email);
if (!number || (!email && !toDefault) || !password) {
  console.error("Хэрэглээ: printf '%s' <нууц үг> | npm run line:add -- <дугаар> <имэйл>");
  process.exit(1);
}
if (!account) {
  console.error("Ийм имэйлтэй бүртгэл олдсонгүй. Эхлээд callai.world/signup-аар бүртгүүлнэ.");
  process.exit(1);
}
new LineStore().save({ number, password, businessId: account.businessId });
console.log(`…${number.slice(-2)} дугаарыг бизнест холболоо. Одоо: systemctl restart frontdesk`);
