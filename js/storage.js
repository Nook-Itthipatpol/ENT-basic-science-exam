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

async function loadWithSync(setId, kind, sync) {
  const key = keyFor(setId, kind);
  const local = await read(key);
  const remote = await sync.pull(setId).catch(() => null);
  const winner = resolveByUpdatedAt(local, remote);
  if (winner && winner !== local) await nativeSet(key, JSON.stringify(winner)).catch(() => {});
  return winner;
}

function saveWithSync(setId, kind, sync, value) {
  const key = keyFor(setId, kind);
  const stamped = { ...value, updatedAt: Date.now() };
  sync.push(stamped, setId).catch(() => {});
  return nativeSet(key, JSON.stringify(stamped)).catch(() => {});
}

export const attemptStore = {
  load: (setId = DEFAULT_SET_ID) => loadWithSync(setId, "attempt", attemptSync),
  save: (attempt, setId = DEFAULT_SET_ID) => saveWithSync(setId, "attempt", attemptSync, attempt),
  clear: (setId = DEFAULT_SET_ID) => { attemptSync.clear(setId).catch(() => {}); return nativeRemove(keyFor(setId, "attempt")).catch(() => {}); }
};

export const summaryStore = {
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
