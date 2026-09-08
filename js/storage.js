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

export const attemptStore = {
  load: () => read(ATTEMPT_KEY),
  save: (attempt) => nativeSet(ATTEMPT_KEY, JSON.stringify(attempt)).catch(() => {}),
  clear: () => nativeRemove(ATTEMPT_KEY).catch(() => {})
};

export const summaryStore = {
  load: () => read(SUMMARY_KEY),
  save: (summary) => nativeSet(SUMMARY_KEY, JSON.stringify(summary)).catch(() => {})
};
