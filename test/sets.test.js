import test from "node:test";
import assert from "node:assert/strict";
import { QUESTION_COUNT } from "../js/sets/set-02.js";
import { SET_MANIFEST, findInManifest, findSet, loadFromManifest, loadSet } from "../js/sets.js";

test("the manifest's Set 02 metadata matches the real question data", () => {
  const meta = findSet("set-02");
  assert.equal(meta.status, "active");
  assert.equal(meta.questionCount, QUESTION_COUNT);
  assert.equal(meta.durationSeconds, 90 * 60);
});

test("unannounced sets are listed as coming soon, without a loadable module", () => {
  const set03 = findSet("set-03");
  assert.equal(set03.status, "soon");
  assert.equal(set03.module, undefined);
});

test("finding an unknown set id returns null instead of throwing", () => {
  assert.equal(findSet("set-99"), null);
});

test("loading a set the home screen has not opened yet resolves the real questions", async () => {
  const loaded = await loadSet("set-02");
  assert.equal(loaded.questions.length, QUESTION_COUNT);
  assert.equal(loaded.id, "set-02");
});

test("loading a coming-soon set resolves null rather than attempting an import", async () => {
  assert.equal(await loadSet("set-03"), null);
});

test("loading an unknown set id resolves null", async () => {
  assert.equal(await loadSet("set-99"), null);
});

test("adding a set is a manifest entry plus a module — loadFromManifest proves the plumbing generically", async () => {
  const manifest = [{ id: "fixture", title: "Fixture Set", questionCount: 2, durationSeconds: 60, status: "active", module: "../test/fixtures/fixture-set.js" }];

  assert.deepEqual(findInManifest(manifest, "fixture"), manifest[0]);

  const loaded = await loadFromManifest(manifest, "fixture");
  assert.equal(loaded.questions.length, 2);
  assert.equal(loaded.title, "Fixture Set");
  assert.equal(await loadFromManifest(manifest, "unknown"), null);
});

test("the manifest never authors real content for sets that are not ready yet", () => {
  for (const set of SET_MANIFEST) {
    if (set.status !== "active") assert.equal(set.module, undefined, `${set.id} should have no module until it is real`);
  }
});
