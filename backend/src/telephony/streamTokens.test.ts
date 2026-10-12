import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { WebSocket } from "ws";
import { consumeStreamToken, issueStreamToken } from "./streamTokens.js";
import { handleTwilioMediaStream } from "./twilio.js";

test("a stream token works once, only before it expires, and unknown values are rejected", () => {
  const token = issueStreamToken(1_000);
  assert.equal(consumeStreamToken(token, 2_000), true);
  assert.equal(consumeStreamToken(token, 2_000), false);
  assert.equal(consumeStreamToken(issueStreamToken(1_000), 61_000), false);
  assert.equal(consumeStreamToken("guess"), false);
  assert.equal(consumeStreamToken(undefined), false);
  assert.notEqual(issueStreamToken(), issueStreamToken());
});

test("media stream closes without starting a call when the start message has no valid token", () => {
  for (const customParameters of [undefined, {}, { streamToken: "guess" }]) {
    const closes: number[] = [];
    const sent: string[] = [];
    const socket = Object.assign(new EventEmitter(), {
      send: (data: string) => sent.push(data),
      close: (code: number) => { closes.push(code); socket.emit("close"); },
    });
    handleTwilioMediaStream(socket as unknown as WebSocket);
    socket.emit("message", Buffer.from(JSON.stringify({
      event: "start", start: { streamSid: "MZ1", callSid: "CA1", customParameters },
    })));
    assert.deepEqual(closes, [1008]);
    assert.deepEqual(sent, []);
  }
});
