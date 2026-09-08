import test from "node:test";
import assert from "node:assert/strict";
import { attemptStore, summaryStore } from "../js/storage.js";

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

  assert.equal(preferred.value(ATTEMPT_KEY), JSON.stringify({ answers: { 0: "B" } }));
  assert.equal(fallback.value(ATTEMPT_KEY), JSON.stringify({ currentQuestion: 1 }));
});

test("falls back to localStorage when window.storage is unavailable", async () => {
  const fallback = createStorage();
  setWindow({ localStorage: fallback });
  const summary = { score: 7, total: 10, submittedAt: 1234 };

  await summaryStore.save(summary);

  assert.equal(fallback.value(SUMMARY_KEY), JSON.stringify(summary));
  assert.deepEqual(await summaryStore.load(), summary);
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
  assert.deepEqual(await attemptStore.load(), replacement);
  assert.deepEqual(preferred.calls.filter(([method]) => method === "removeItem"), [["removeItem", ATTEMPT_KEY]]);
});
