import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SET_ID, attemptStore, createPushQueue, summaryStore } from "../js/storage.js";

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

test("loadLocal reads only localStorage, so a hung sync pull cannot block the first paint", async () => {
  const storage = createStorage();
  setWindow({ storage, localStorage: createStorage() });

  await attemptStore.save({ answers: { 0: "A" }, currentQuestion: 0 }, "set-03");
  await summaryStore.save({ score: 40, total: 61, percent: 66 }, "set-03");
  storage.calls.length = 0;

  const attempt = await attemptStore.loadLocal("set-03");
  const summary = await summaryStore.loadLocal("set-03");

  assert.deepEqual(attempt.answers, { 0: "A" });
  assert.equal(summary.score, 40);
  assert.deepEqual(
    storage.calls,
    [["getItem", "ent-r1-set-03-attempt"], ["getItem", "ent-r1-set-03-summary"]],
    "loadLocal must not write back a sync winner, or await anything but storage"
  );
});

test("loadLocal is set-scoped and tolerates missing or corrupt local data", async () => {
  const storage = createStorage({ "ent-r1-set-04-attempt": "{not json" });
  setWindow({ storage, localStorage: createStorage() });

  await attemptStore.save({ answers: { 1: "C" } }, "set-02");
  assert.deepEqual((await attemptStore.loadLocal("set-02")).answers, { 1: "C" });
  assert.equal(await attemptStore.loadLocal("set-03"), null, "an untouched set reads back empty, not another set's attempt");
  assert.equal(await attemptStore.loadLocal("set-04"), null, "corrupt JSON resolves null rather than throwing during boot");
});

function recordingSync() {
  const pushes = [];
  return { pushes, push: async (value, setId) => { pushes.push({ value, setId }); } };
}

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("repeated saves to one key coalesce into a single remote push", async () => {
  const queue = createPushQueue(20);
  const sync = recordingSync();

  for (const answer of ["A", "B", "C"]) queue.queue("k", sync, "set-02", { answer });
  assert.equal(sync.pushes.length, 0, "nothing goes out while the user is still clicking");

  await tick(40);
  assert.equal(sync.pushes.length, 1, "one write per quiet period, not one per click");
  assert.deepEqual(sync.pushes[0], { value: { answer: "C" }, setId: "set-02" }, "the latest state wins");
});

test("different keys are debounced independently and flushAll sends every pending push", async () => {
  const queue = createPushQueue(10_000);
  const attempt = recordingSync();
  const summary = recordingSync();

  queue.queue("ent-r1-set-02-attempt", attempt, "set-02", { answers: { 0: "A" } });
  queue.queue("ent-r1-set-02-summary", summary, "set-02", { score: 1 });
  assert.equal(queue.pendingCount(), 2);

  queue.flushAll();
  assert.equal(queue.pendingCount(), 0);
  assert.equal(attempt.pushes.length, 1);
  assert.equal(summary.pushes.length, 1);
});

test("cancelling a queued push stops a stale write from resurrecting a cleared row", async () => {
  const queue = createPushQueue(20);
  const sync = recordingSync();

  queue.queue("k", sync, "set-02", { answers: { 0: "A" } });
  queue.cancel("k");
  await tick(40);
  assert.equal(sync.pushes.length, 0);
});

test("saving still writes localStorage synchronously, debounce or not", async () => {
  const storage = createStorage();
  setWindow({ storage, localStorage: createStorage() });

  await attemptStore.save({ answers: { 3: "D" } }, "set-02");
  assert.deepEqual(JSON.parse(storage.value(ATTEMPT_KEY)).answers, { 3: "D" }, "a crash mid-attempt must not lose the local copy");
});
