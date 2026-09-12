import { attemptSync, resolveByUpdatedAt, summarySync } from "./sync.js";

// ent-r1-<setId>-<kind>. Set 02's keys are unchanged from before per-set
// storage existed (ent-r1-set-02-attempt/-summary), so existing local data
// keeps loading under this scheme with no migration step needed.
export const DEFAULT_SET_ID = "set-02";
const keyFor = (setId, kind) => `ent-r1-${setId}-${kind}`;

async function nativeGet(key) {
  if (window.storage?.getItem) return window.storage.getItem(key);
  return window.localStorage.getItem(key);
}

async function nativeSet(key, value) {
  if (window.storage?.setItem) return window.storage.setItem(key, value);
  window.localStorage.setItem(key, value);
}

async function nativeRemove(key) {
  if (window.storage?.removeItem) return window.storage.removeItem(key);
  window.localStorage.removeItem(key);
}

async function read(key) {
  try { const value = await nativeGet(key); return value ? JSON.parse(value) : null; } catch { return null; }
}

// The home screen paints from this first. It touches localStorage only, so a
// stalled or hung Supabase request can never keep the app on a blank page —
// the remote copy is folded in afterwards by loadWithSync.
const loadLocal = (setId, kind) => read(keyFor(setId, kind));

async function loadWithSync(setId, kind, sync) {
  const key = keyFor(setId, kind);
  const local = await read(key);
  const remote = await sync.pull(setId).catch(() => null);
  const winner = resolveByUpdatedAt(local, remote);
  if (winner && winner !== local) await nativeSet(key, JSON.stringify(winner)).catch(() => {});
  return winner;
}

// Every answer and every navigation calls save. localStorage is written
// straight through — it is the source of truth and must survive a crash — but
// the Supabase push is coalesced, so a full attempt costs a handful of remote
// writes instead of one per click. Pending pushes are flushed when the tab
// goes away, and cancelled outright if the row is cleared first.
export const SYNC_DEBOUNCE_MS = 2000;

export function createPushQueue(delayMs = SYNC_DEBOUNCE_MS) {
  const pending = new Map();

  const cancel = (key) => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(key);
  };

  const flush = (key) => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(key);
    entry.sync.push(entry.value, entry.setId).catch(() => {});
  };

  return {
    cancel,
    flush,
    flushAll: () => [...pending.keys()].forEach(flush),
    pendingCount: () => pending.size,
    queue(key, sync, setId, value) {
      cancel(key);
      const timer = setTimeout(() => flush(key), delayMs);
      timer?.unref?.(); // a queued push must never hold a Node test run open
      pending.set(key, { sync, setId, value, timer });
    }
  };
}

const pushQueue = createPushQueue();
export const flushPendingSync = () => pushQueue.flushAll();

function saveWithSync(setId, kind, sync, value) {
  const key = keyFor(setId, kind);
  const stamped = { ...value, updatedAt: Date.now() };
  pushQueue.queue(key, sync, setId, stamped);
  return nativeSet(key, JSON.stringify(stamped)).catch(() => {});
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", flushPendingSync);
  window.addEventListener("visibilitychange", () => { if (window.document?.hidden) flushPendingSync(); });
}

export const attemptStore = {
  loadLocal: (setId = DEFAULT_SET_ID) => loadLocal(setId, "attempt"),
  load: (setId = DEFAULT_SET_ID) => loadWithSync(setId, "attempt", attemptSync),
  save: (attempt, setId = DEFAULT_SET_ID) => saveWithSync(setId, "attempt", attemptSync, attempt),
  clear: (setId = DEFAULT_SET_ID) => {
    pushQueue.cancel(keyFor(setId, "attempt")); // don't let a queued push resurrect the row
    attemptSync.clear(setId).catch(() => {});
    return nativeRemove(keyFor(setId, "attempt")).catch(() => {});
  }
};

export const summaryStore = {
  loadLocal: (setId = DEFAULT_SET_ID) => loadLocal(setId, "summary"),
  load: (setId = DEFAULT_SET_ID) => loadWithSync(setId, "summary", summarySync),
  save: (summary, setId = DEFAULT_SET_ID) => saveWithSync(setId, "summary", summarySync, summary)
};

// Which set's exam is currently open, so a page reload on #exam/#review knows
// what to load. Purely a local UI convenience — never synced.
const ACTIVE_SET_KEY = "ent-r1-active-set";
export const activeSetId = {
  load: () => read(ACTIVE_SET_KEY),
  save: (setId) => nativeSet(ACTIVE_SET_KEY, JSON.stringify(setId)).catch(() => {})
};
