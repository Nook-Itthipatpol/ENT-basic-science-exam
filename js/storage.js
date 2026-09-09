import { attemptSync, resolveByUpdatedAt, summarySync } from "./sync.js";

const ATTEMPT_KEY = "ent-r1-set-02-attempt";
const SUMMARY_KEY = "ent-r1-set-02-summary";

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

async function loadWithSync(key, sync) {
  const local = await read(key);
  const remote = await sync.pull().catch(() => null);
  const winner = resolveByUpdatedAt(local, remote);
  if (winner && winner !== local) await nativeSet(key, JSON.stringify(winner)).catch(() => {});
  return winner;
}

function saveWithSync(key, sync, value) {
  const stamped = { ...value, updatedAt: Date.now() };
  sync.push(stamped).catch(() => {});
  return nativeSet(key, JSON.stringify(stamped)).catch(() => {});
}

export const attemptStore = {
  load: () => loadWithSync(ATTEMPT_KEY, attemptSync),
  save: (attempt) => saveWithSync(ATTEMPT_KEY, attemptSync, attempt),
  clear: () => { attemptSync.clear().catch(() => {}); return nativeRemove(ATTEMPT_KEY).catch(() => {}); }
};

export const summaryStore = {
  load: () => loadWithSync(SUMMARY_KEY, summarySync),
  save: (summary) => saveWithSync(SUMMARY_KEY, summarySync, summary)
};
