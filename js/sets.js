// Static metadata for every mock set, kept small enough to load on the home
// screen without pulling any set's actual question data. Only "active" sets
// have a module to dynamically import; add a set by adding a manifest entry
// (and, once it exists, a js/sets/<id>.js module) — no other file changes.
export const SET_MANIFEST = [
  { id: "set-02", title: "Basic Science Mock", questionCount: 61, durationSeconds: 90 * 60, status: "active", module: "./sets/set-02.js" },
  { id: "set-03", title: "Basic Science Mock", questionCount: 61, durationSeconds: 90 * 60, status: "active", module: "./sets/set-03.js" },
  { id: "set-04", title: "Basic Science Mock", questionCount: 61, durationSeconds: 90 * 60, status: "active", module: "./sets/set-04.js" }
];

export const findInManifest = (manifest, setId) => manifest.find((set) => set.id === setId) || null;

export function loadFromManifest(manifest, setId) {
  const meta = findInManifest(manifest, setId);
  if (!meta || meta.status !== "active") return Promise.resolve(null);
  return import(meta.module).then((mod) => ({ ...meta, questions: mod.questions }));
}

export const findSet = (setId) => findInManifest(SET_MANIFEST, setId);
export const loadSet = (setId) => loadFromManifest(SET_MANIFEST, setId);
