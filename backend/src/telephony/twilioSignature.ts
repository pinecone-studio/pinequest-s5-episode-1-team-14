// Twilio webhook хүсэлт үнэхээр Twilio-с ирсэн эсэхийг X-Twilio-Signature
// толгойгоор шалгана: https://www.twilio.com/docs/usage/security#validating-requests
// Бүрэн webhook URL-ийн ард эрэмбэлсэн (түлхүүрээр) параметрүүдийн
// нэр+утгыг шууд залгаад, Auth Token-оор HMAC-SHA1 гарын үсэг зурж base64
// болгоно. Үр дүнг тогтмол хугацааны харьцуулалтаар (timing-safe) шалгана.

import { createHmac, timingSafeEqual } from "node:crypto";

export function computeTwilioSignature(authToken: string, url: string, params: URLSearchParams): string {
  const data = [...new Set(params.keys())].sort()
    .reduce((acc, key) => acc + key + (params.get(key) ?? ""), url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signatureHeader: string | string[] | undefined,
): boolean {
  if (typeof signatureHeader !== "string" || !signatureHeader) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params), "utf8");
  const actual = Buffer.from(signatureHeader, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
