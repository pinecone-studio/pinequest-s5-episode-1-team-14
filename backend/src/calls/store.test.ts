import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { CALL_INTENTS, CALL_STATUSES, CallSessionStore } from "./store.js";

test("call lifecycle survives reopening, handles callback retries and preserves data on failure", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "frontdesk-calls-"));
  context.after(() => {
    assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, "data", "calls.json");
  const store = new CallSessionStore(file);
  const start = { id: "call-1", callerPhone: "+97699112233", startedAt: "2030-01-15T01:00:00.000Z" };
  assert.deepEqual(store.list(), []);
  assert.equal(store.get("missing"), undefined);
  assert.throws(() => store.update("missing", { intent: "ASK_PRICE" }), /not found/);
  assert.throws(() => store.finish("missing", { status: "failed", endedAt: start.startedAt }), /not found/);

  const active = store.start(start);
  assert.deepEqual(active, { ...start, endedAt: null, duration: 0, intent: null, status: "active", bookingId: null, bookingCreated: false });
  const reopened = new CallSessionStore(file);
  assert.deepEqual(reopened.get(start.id), active, "active calls survive restart without invented end times");
  active.callerPhone = "00000000";
  assert.equal(reopened.get(start.id)?.callerPhone, start.callerPhone, "returned records are detached from disk");
  for (const intent of CALL_INTENTS) assert.equal(store.update(start.id, { intent }).intent, intent);
  const finished = reopened.finish(start.id, { status: "completed", endedAt: "2030-01-15T01:01:30.999Z" });
  assert.equal(finished.duration, 90, "duration is elapsed whole seconds");
  assert.equal(finished.status, "completed");
  assert.deepEqual(store.start(start), finished, "duplicate start cannot reopen or erase a finished call");
  const booked = store.update(start.id, { bookingId: "confirmed-calendar-event", intent: "BOOK_APPOINTMENT" });
  assert.equal(booked.bookingCreated, true, "late confirmed booking results can link to a finished call");
  assert.equal(booked.duration, 90);
  assert.deepEqual(reopened.get(start.id), booked);

  const noWrite = context.mock.method(fs, "renameSync", () => { throw new Error("Unexpected duplicate write"); });
  assert.deepEqual(store.start(start), booked);
  assert.deepEqual(store.update(start.id, { bookingId: booked.bookingId }), booked);
  assert.deepEqual(store.finish(start.id, { status: "completed", endedAt: booked.endedAt! }), booked);
  noWrite.mock.restore();
  for (const status of CALL_STATUSES.filter((value) => value !== "active")) {
    const call = store.start({ ...start, id: status, callerPhone: null, startedAt: "2030-01-15T02:00:00.000Z" });
    assert.equal(store.finish(call.id, { status, endedAt: call.startedAt }).duration, 0);
  }
  assert.equal(store.list().length, 4);
  assert.deepEqual(store.list().map((call) => call.id), ["completed", "failed", "handed_off", "call-1"]);

  const original = readFileSync(file, "utf8");
  for (const input of [
    null, [], {}, { ...start, id: " " }, { ...start, id: "x".repeat(201) },
    { ...start, callerPhone: "anonymous" }, { ...start, callerPhone: 99112233 },
    { ...start, startedAt: "2030-02-30T01:00:00.000Z" }, { ...start, startedAt: "2030-01-15T01:00:00" },
    { ...start, transcript: "unexpected sensitive data" }, { ...start, callerPhone: "88112233" },
  ]) {
    assert.throws(() => store.start(input as Parameters<CallSessionStore["start"]>[0]));
    assert.equal(readFileSync(file, "utf8"), original);
  }
  for (const patch of [
    null, [], { status: "active" }, { duration: 1 }, { intent: "UNKNOWN" }, { intent: undefined },
    { bookingCreated: true }, { bookingId: null }, { bookingId: "other" }, { bookingId: undefined },
  ]) {
    assert.throws(() => store.update(start.id, patch as Parameters<CallSessionStore["update"]>[1]));
    assert.equal(readFileSync(file, "utf8"), original);
  }
  for (const end of [
    null, { status: "active", endedAt: start.startedAt }, { status: "cancelled", endedAt: start.startedAt },
    { status: "completed", endedAt: "invalid" }, { status: "failed", endedAt: booked.endedAt },
    { status: "completed", endedAt: start.startedAt }, { status: "completed", endedAt: booked.endedAt, duration: 1 },
  ]) {
    assert.throws(() => store.finish(start.id, end as Parameters<CallSessionStore["finish"]>[1]));
    assert.equal(readFileSync(file, "utf8"), original);
  }
  const pending = store.start({ ...start, id: "pending", callerPhone: "88112233" });
  const beforeInvalidEnd = readFileSync(file, "utf8");
  assert.throws(() => store.finish(pending.id, { status: "completed", endedAt: "2030-01-14T01:00:00.000Z" }));
  assert.equal(readFileSync(file, "utf8"), beforeInvalidEnd);
  for (const corrupt of [
    "{broken", "{}", "[null]", JSON.stringify([booked, booked]),
    JSON.stringify([{ ...booked, duration: 100 }]), JSON.stringify([{ ...booked, bookingCreated: false }]),
    JSON.stringify([{ ...booked, status: "active" }]), JSON.stringify([{ ...pending, endedAt: booked.endedAt }]),
  ]) {
    writeFileSync(file, corrupt);
    assert.throws(() => store.list());
    assert.throws(() => store.get(start.id));
    assert.throws(() => store.start({ ...start, id: "new" }));
    assert.throws(() => store.update(start.id, { intent: "ASK_PRICE" }));
    assert.throws(() => store.finish(start.id, { status: "completed", endedAt: booked.endedAt! }));
    assert.equal(readFileSync(file, "utf8"), corrupt, "corrupt records are never replaced with an empty store");
  }
  writeFileSync(file, original);
  const renameFailure = context.mock.method(fs, "renameSync", () => { throw new Error("Simulated filesystem failure"); });
  assert.throws(() => store.update(start.id, { intent: "ASK_PRICE" }), /filesystem failure/);
  renameFailure.mock.restore();
  assert.equal(readFileSync(file, "utf8"), original);
  assert.deepEqual(readdirSync(dirname(file)), ["calls.json"], "failed writes clean temporary files");
  assert.throws(() => new CallSessionStore(directory).list(), "read errors propagate");
});
