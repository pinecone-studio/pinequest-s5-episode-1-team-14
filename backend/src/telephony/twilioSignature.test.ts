import assert from "node:assert/strict";
import { test } from "node:test";
import { computeTwilioSignature, isValidTwilioSignature } from "./twilioSignature.js";

// OpenSSL-ээр бие даан тооцоолсон лавлагаа утга (TypeScript хэрэгжилтээс
// тусдаа): printf '%s' 'https://mycompany.test/voiceCallSidCA1234bar2foo1' |
//   openssl dgst -sha1 -hmac "s3cr3t-auth-token" -binary | base64
const AUTH_TOKEN = "s3cr3t-auth-token";
const URL = "https://mycompany.test/voice";
const KNOWN_SIGNATURE = "ipz1rrP6X+6Uoy5J2slnGSqvP14=";

function params(): URLSearchParams {
  const p = new URLSearchParams();
  p.set("CallSid", "CA1234");
  p.set("bar", "2");
  p.set("foo", "1");
  return p;
}

test("computeTwilioSignature matches an independently computed OpenSSL fixture", () => {
  assert.equal(computeTwilioSignature(AUTH_TOKEN, URL, params()), KNOWN_SIGNATURE);
});

test("isValidTwilioSignature accepts the genuine signature and rejects tampering", () => {
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, params(), KNOWN_SIGNATURE), true);
  assert.equal(isValidTwilioSignature("wrong-token", URL, params(), KNOWN_SIGNATURE), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL + "x", params(), KNOWN_SIGNATURE), false);
  const tamperedParams = params();
  tamperedParams.set("foo", "999");
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, tamperedParams, KNOWN_SIGNATURE), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, params(), undefined), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, params(), ""), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, params(), [KNOWN_SIGNATURE]), false);
  assert.equal(isValidTwilioSignature(AUTH_TOKEN, URL, params(), KNOWN_SIGNATURE + "a"), false);
});
