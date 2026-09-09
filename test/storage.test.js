import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SET_ID, attemptStore, summaryStore } from "../js/storage.js";

const ATTEMPT_KEY = "ent-r1-set-02-attempt";
const SUMMARY_KEY = "ent-r1-set-02-summary";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) { calls.push(["getItem", key]); return values.get(key) ?? null; },
    setItem(key, value) { calls.push(["setItem", key, value]); values.set(key, value); },
    removeItem(key) { calls.push(["removeItem", key]); values.delete(key); },
    value(key) { return values.get(key); }
  };
}

function setWindow({ storage, localStorage }) {
  globalThis.window = { storage, localStorage };
}

test.after(() => { delete globalThis.window; });

test("prefers window.storage over localStorage for attempt reads and writes", async () => {
  const preferred = createStorage({ [ATTEMPT_KEY]: JSON.stringify({ currentQuestion: 2 }) });
  const fallback = createStorage({ [ATTEMPT_KEY]: JSON.stringify({ currentQuestion: 1 }) });
  setWindow({ storage: preferred, localStorage: fallback });

  assert.deepEqual(await attemptStore.load(), { currentQuestion: 2 });
  await attemptStore.save({ answers: { 0: "B" } });

  const saved = JSON.parse(preferred.value(ATTEMPT_KEY));
  assert.deepEqual(saved.answers, { 0: "B" });
  assert.equal(typeof saved.updatedAt, "number", "save stamps updatedAt for last-write-wins sync");
  assert.equal(fallback.value(ATTEMPT_KEY), JSON.stringify({ currentQuestion: 1 }));
});

test("falls back to localStorage when window.storage is unavailable", async () => {
  const fallback = createStorage();
  setWindow({ localStorage: fallback });
  const summary = { score: 7, total: 10, submittedAt: 1234 };

  await summaryStore.save(summary);

  const saved = JSON.parse(fallback.value(SUMMARY_KEY));
  assert.deepEqual({ score: saved.score, total: saved.total, submittedAt: saved.submittedAt }, summary);
  const loaded = await summaryStore.load();
  assert.deepEqual({ score: loaded.score, total: loaded.total, submittedAt: loaded.submittedAt }, summary);
});

test("loads null for missing or corrupt persisted JSON", async () => {
  const preferred = createStorage({ [ATTEMPT_KEY]: "{not-json", [SUMMARY_KEY]: "" });
  setWindow({ storage: preferred, localStorage: createStorage() });

  assert.equal(await attemptStore.load(), null);
  assert.equal(await summaryStore.load(), null);
});

test("clearing an attempt removes its state and permits a clean replacement", async () => {
  const preferred = createStorage();
  setWindow({ storage: preferred, localStorage: createStorage() });
  const replacement = { answers: {}, currentQuestion: 0, startedAt: 999, submittedAt: null, score: null };

  await attemptStore.save({ answers: { 4: "E" }, currentQuestion: 4 });
  await attemptStore.clear();
  assert.equal(await attemptStore.load(), null);

  await attemptStore.save(replacement);
  const loaded = await attemptStore.load();
  assert.deepEqual({ ...loaded, updatedAt: undefined }, { ...replacement, updatedAt: undefined });
  assert.deepEqual(preferred.calls.filter(([method]) => method === "removeItem"), [["removeItem", ATTEMPT_KEY]]);
});

test("the default set id reuses Set 02's original keys, so old local data is never orphaned", () => {
  assert.equal(DEFAULT_SET_ID, "set-02");
  assert.equal(ATTEMPT_KEY, "ent-r1-set-02-attempt");
  assert.equal(SUMMARY_KEY, "ent-r1-set-02-summary");
});

test("each set is stored under its own key, isolated from other sets", async () => {
  const storage = createStorage();
  setWindow({ storage, localStorage: createStorage() });

  await attemptStore.save({ answers: { 0: "A" }, currentQuestion: 0 }, "set-02");
  await attemptStore.save({ answers: { 0: "B" }, currentQuestion: 0 }, "set-03");

  const set02 = await attemptStore.load("set-02");
  const set03 = await attemptStore.load("set-03");
  assert.deepEqual(set02.answers, { 0: "A" });
  assert.deepEqual(set03.answers, { 0: "B" });
  assert.ok(storage.value("ent-r1-set-03-attempt"), "set-03 gets its own storage key");
  assert.equal(storage.value(ATTEMPT_KEY), JSON.stringify(set02));

  await attemptStore.clear("set-03");
  assert.equal(await attemptStore.load("set-03"), null);
  assert.deepEqual((await attemptStore.load("set-02")).answers, { 0: "A" }, "clearing one set leaves the other untouched");
});
