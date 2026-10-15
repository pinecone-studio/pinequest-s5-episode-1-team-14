import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeMuLaw } from "./twilio.js";
import { aLawToMuLaw, buildRtpPacket, rtpOrder, muLawToALaw, digestAuthorization, PacedAudio, parseChallenge, parseRtpPacket, parseSdpAudio, parseSipMessage, parseStunMappedAddress } from "./sip.js";

test("SIP messages are parsed, including compact header names", () => {
  const message = parseSipMessage("INVITE sip:75000000@1.2.3.4 SIP/2.0\r\nv: SIP/2.0/UDP 9.9.9.9\r\nFrom: <sip:99112233@host>;tag=a\r\ni: abc\r\nCSeq: 1 INVITE\r\n\r\nv=0\r\n");
  assert.equal(message.startLine, "INVITE sip:75000000@1.2.3.4 SIP/2.0");
  assert.deepEqual(message.headers[0], ["via", "SIP/2.0/UDP 9.9.9.9"]);
  assert.deepEqual(message.headers[2], ["call-id", "abc"]);
  assert.equal(message.body, "v=0\r\n");
});

test("digest authorization matches the RFC 2617 example", () => {
  // RFC 2617 §3.5-ын жишээ: хариу нь 6629fae49393a05397450978507c4ef1.
  const challenge = parseChallenge('Digest realm="testrealm@host.com", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  const value = digestAuthorization({ username: "Mufasa", password: "Circle Of Life", method: "GET", uri: "/dir/index.html", challenge, cnonce: "0a4f113b" });
  assert.match(value, /response="6629fae49393a05397450978507c4ef1"/);
  assert.match(value, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/);
  // qop-гүй сервер (манай операторынх шиг) cnonce ашиглахгүй.
  assert.doesNotMatch(digestAuthorization({ username: "u", password: "p", method: "REGISTER", uri: "sip:h", challenge: { realm: "r", nonce: "n" } }), /cnonce/);
});

test("SDP audio offer is read and non-audio offers are rejected", () => {
  const sdp = "v=0\r\nc=IN IP4 202.0.0.1\r\nm=audio 7248 RTP/AVP 0 8 18\r\na=rtpmap:0 PCMU/8000\r\n";
  assert.deepEqual(parseSdpAudio(sdp), { ip: "202.0.0.1", port: 7248, payloadTypes: [0, 8, 18] });
  assert.equal(parseSdpAudio("v=0\r\n"), null);
});

test("RTP packets round-trip and skip header extensions", () => {
  const payload = Buffer.from([1, 2, 3, 4]);
  const packet = buildRtpPacket(7, 160, 0x11223344, payload, true);
  assert.equal(packet.length, 16);
  assert.equal(packet[1], 0x80);
  assert.deepEqual(parseRtpPacket(packet), { payloadType: 0, sequence: 7, payload });
  const extended = Buffer.concat([Buffer.from([0x90, 0x00, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1]), Buffer.from([0xbe, 0xde, 0, 1, 9, 9, 9, 9]), payload]);
  assert.deepEqual(parseRtpPacket(extended)?.payload, payload);
  assert.equal(parseRtpPacket(Buffer.from([1, 2, 3])), null);
});

test("paced audio emits 20ms frames and returns marks only after the audio before them", () => {
  const audio = new PacedAudio();
  audio.push(Buffer.alloc(200, 1));
  audio.mark("a");
  audio.push(Buffer.alloc(160, 2));
  audio.mark("b");

  const first = audio.next();
  assert.equal(first.frame?.length, 160);
  assert.deepEqual(first.marks, []);
  // Үлдсэн 40 байт нь mark-ийн өмнө дуусах тул чимээгүйгээр гүйцээнэ.
  const second = audio.next();
  assert.equal(second.frame?.[39], 1);
  assert.equal(second.frame?.[40], 0xff);
  const third = audio.next();
  assert.deepEqual(third.marks, ["a"]);
  assert.equal(third.frame?.[0], 2);
  assert.deepEqual(audio.next(), { frame: null, marks: ["b"] });

  audio.push(Buffer.alloc(160, 3));
  audio.mark("c");
  assert.deepEqual(audio.clear(), ["c"]);
  assert.deepEqual(audio.next(), { frame: null, marks: [] });
});

test("STUN reply yields the public address and port", () => {
  // XOR-MAPPED-ADDRESS: 192.0.2.1:32853 (RFC 5769-ийн жишээ утга).
  const reply = Buffer.from("0101000c2112a442b7e7a701bc34d686fa87dfae" + "002000080001a147e112a643", "hex");
  assert.deepEqual(parseStunMappedAddress(reply), { address: "192.0.2.1", port: 32853 });
  assert.equal(parseStunMappedAddress(Buffer.alloc(20)), null);
});

test("A-law and mu-law convert both ways without changing the sound", () => {
  // Чимээгүй A-law 0xD5 нь mu-law-ийн хамгийн нам түвшин (0xFE/0xFF).
  assert.ok(aLawToMuLaw(Buffer.from([0xd5]))[0] >= 0xfe);
  assert.equal(muLawToALaw(Buffer.from([0xff]))[0], 0xd5);
  const all = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
  // Хоёр тийш хөрвүүлэхэд дууны түвшин бараг хэвээр (хоёр код өөр алхамтай тул яг ижил биш).
  const before = decodeMuLaw(all);
  const after = decodeMuLaw(aLawToMuLaw(muLawToALaw(all)));
  before.forEach((sample, index) => {
    assert.ok(Math.abs(after[index] - sample) <= Math.max(32, Math.abs(sample) * 0.07), `${sample} -> ${after[index]}`);
  });
});

test("RTP ordering drops duplicates and slightly late packets but accepts a restarted stream", () => {
  assert.equal(rtpOrder(100, 101), "next");
  assert.equal(rtpOrder(100, 105), "next");
  assert.equal(rtpOrder(65535, 0), "next");
  assert.equal(rtpOrder(100, 100), "duplicate");
  assert.equal(rtpOrder(100, 98), "late");
  // Оператор урсгалыг шинэ дугаараас эхлүүлсэн: өмнө нь бүгдийг хаяж байсан.
  assert.equal(rtpOrder(30000, 1200), "restart");
  assert.equal(rtpOrder(1200, 40000), "restart");
});
