import assert from "node:assert/strict";
import fs, { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { BusinessKnowledgeStore, KNOWLEDGE_CATEGORIES } from "./store.js";

const draft = { category: "service", title: "Үс засалт", content: "Туршилтын үйлчилгээ", price: 0 };

test("knowledge CRUD survives reopening and only explicitly active items pass the filter", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "frontdesk-knowledge-"));
  context.after(() => {
    assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, "data", "knowledge.json");
  const store = new BusinessKnowledgeStore(file);
  assert.deepEqual(store.list(), []);
  assert.equal(store.delete("missing"), false);

  const created = store.save({ ...draft, updatedAt: "caller timestamp is ignored" });
  assert.match(created.id, /^[\da-f-]{36}$/);
  assert.equal(created.active, false);
  assert.equal(created.price, 0);
  assert.equal(new Date(created.updatedAt).toISOString(), created.updatedAt);
  assert.deepEqual(store.list({ activeOnly: true }), []);
  const reopened = new BusinessKnowledgeStore(file);
  assert.deepEqual(reopened.get(created.id), created);

  const approved = reopened.save({ ...created, active: true });
  assert.deepEqual(store.list({ activeOnly: true }), [approved]);
  assert.equal(store.list().length, 1);
  const replacement = store.save({ ...draft, id: created.id, content: "Шинэ тайлбар" });
  assert.equal(replacement.active, false);
  assert.deepEqual(reopened.list({ activeOnly: true }), []);
  replacement.content = "Unsaved mutation";
  assert.equal(reopened.get(created.id)?.content, "Шинэ тайлбар");

  for (const category of KNOWLEDGE_CATEGORIES) store.save({ ...draft, category });
  assert.equal(store.list().length, KNOWLEDGE_CATEGORIES.length + 1);
  assert.equal(store.delete(created.id), true);
  assert.equal(reopened.get(created.id), undefined);
  assert.equal(store.delete(created.id), false);
  assert.deepEqual(readdirSync(dirname(file)), ["knowledge.json"]);
});

test("invalid input, corrupt data, and failed writes preserve existing records", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "frontdesk-knowledge-"));
  context.after(() => {
    assert.equal(dirname(realpathSync(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, "knowledge.json");
  const store = new BusinessKnowledgeStore(file);
  const valid = store.save(draft);
  const original = readFileSync(file, "utf8");
  const invalidInputs: unknown[] = [
    null, [], "service", {},
    { ...draft, id: " " }, { ...draft, id: null },
    { ...draft, category: "unverified" },
    { ...draft, title: " " }, { ...draft, content: 123 },
    { ...draft, active: "true" }, { ...draft, active: null },
    { ...draft, price: -1 }, { ...draft, price: NaN },
    { ...draft, price: Infinity }, { ...draft, price: "100" },
    { ...draft, price: null }, { ...draft, unexpected: true },
  ];
  for (const input of invalidInputs) {
    assert.throws(() => store.save(input), TypeError);
    assert.equal(readFileSync(file, "utf8"), original);
  }

  for (const corrupt of [
    "{broken", "{}", "[null]", JSON.stringify([valid, valid]),
    JSON.stringify([{ ...valid, updatedAt: "invalid" }]),
    JSON.stringify([{ ...valid, active: "true" }]),
  ]) {
    writeFileSync(file, corrupt);
    assert.throws(() => store.list());
    assert.throws(() => store.save(draft));
    assert.throws(() => store.delete(valid.id));
    assert.equal(readFileSync(file, "utf8"), corrupt);
  }

  const unreadableStore = new BusinessKnowledgeStore(directory);
  assert.throws(() => unreadableStore.list());
  assert.throws(() => unreadableStore.save(draft));

  writeFileSync(file, original);
  const renameFailure = context.mock.method(fs, "renameSync", () => {
    throw new Error("Simulated filesystem failure");
  });
  assert.throws(() => store.save({ ...valid, title: "Should not persist" }), /filesystem failure/);
  renameFailure.mock.restore();
  assert.equal(readFileSync(file, "utf8"), original);
  assert.deepEqual(readdirSync(directory), ["knowledge.json"]);
});
