import test from "node:test";
import assert from "node:assert/strict";
import { attemptSync, deleteRow, isSyncConfigured, pullRow, pushRow, resolveByUpdatedAt, rowToPayload, summarySync } from "../js/sync.js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../js/supabase-config.js";

function stubClient({ row = null } = {}) {
  const upsertCalls = [];
  const deleteCalls = [];
  return {
    upsertCalls,
    deleteCalls,
    from(table) {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
        upsert: async (payload) => { upsertCalls.push({ table, payload }); return { error: null }; },
        delete: () => ({ eq: () => ({ eq: async () => { deleteCalls.push(table); return { error: null }; } }) })
      };
    }
  };
}

test("the committed config is a real, well-formed Supabase project, not a leftover placeholder", () => {
  assert.equal(isSyncConfigured(), true);
  assert.match(SUPABASE_URL, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  assert.ok(SUPABASE_ANON_KEY.length > 20, "the publishable key looks truncated");
  assert.doesNotMatch(SUPABASE_ANON_KEY, /^sb_secret_|^service_role/, "never ship a secret or service-role key");
});

test("sync degrades to safe no-ops instead of throwing when the client cannot be created", async () => {
  assert.equal(await attemptSync.pull(), null);
  assert.doesNotThrow(() => attemptSync.push({ answers: {}, updatedAt: 1 }));
  assert.doesNotThrow(() => attemptSync.clear());
  assert.equal(await summarySync.pull(), null);
});

test("resolveByUpdatedAt keeps local when there is no remote row", () => {
  const local = { answers: { 0: "A" }, updatedAt: 5 };
  assert.equal(resolveByUpdatedAt(local, null), local);
});

test("resolveByUpdatedAt adopts remote when there is no local attempt", () => {
  const remote = { answers: { 0: "A" }, updatedAt: 5 };
  assert.equal(resolveByUpdatedAt(null, remote), remote);
});

test("resolveByUpdatedAt picks whichever side was written more recently", () => {
  const older = { answers: { 0: "A" }, updatedAt: 100 };
  const newer = { answers: { 0: "B" }, updatedAt: 200 };
  assert.equal(resolveByUpdatedAt(older, newer), newer, "a newer remote write wins over stale local state");
  assert.equal(resolveByUpdatedAt(newer, older), newer, "a newer local write is kept over stale remote state");
});

test("resolveByUpdatedAt falls back to startedAt for attempts saved before updatedAt existed", () => {
  const local = { startedAt: 10, updatedAt: undefined };
  const remote = { startedAt: 20, updatedAt: undefined };
  assert.equal(resolveByUpdatedAt(local, remote), remote);
});

test("resolveByUpdatedAt favors local on an exact tie", () => {
  const local = { updatedAt: 50 };
  const remote = { updatedAt: 50 };
  assert.equal(resolveByUpdatedAt(local, remote), local);
});

test("pullRow maps a stored row back into an attempt with a numeric updatedAt", async () => {
  const row = { payload: { answers: { 0: "C" } }, updated_at: "2024-01-01T00:00:00.000Z" };
  const client = stubClient({ row });
  const payload = await pullRow(client, "attempts", "user-1");
  assert.deepEqual(payload.answers, { 0: "C" });
  assert.equal(payload.updatedAt, Date.parse(row.updated_at));
});

test("pullRow returns null when there is no row for this user yet", async () => {
  const client = stubClient({ row: null });
  assert.equal(await pullRow(client, "attempts", "user-1"), null);
});

test("pullRow returns null without a user id, never guessing whose row to read", async () => {
  const client = stubClient({ row: { payload: {}, updated_at: "2024-01-01T00:00:00.000Z" } });
  assert.equal(await pullRow(client, "attempts", null), null);
});

test("rowToPayload passes through a null row untouched", () => {
  assert.equal(rowToPayload(null), null);
});

test("pushRow upserts one row scoped to the user and set, stamped with updatedAt", async () => {
  const client = stubClient();
  await pushRow(client, "attempts", "user-1", { answers: { 0: "A" }, updatedAt: 1_700_000_000_000 });
  assert.equal(client.upsertCalls.length, 1);
  const [{ table, payload }] = client.upsertCalls;
  assert.equal(table, "attempts");
  assert.equal(payload.user_id, "user-1");
  assert.equal(payload.set_id, "set-02");
  assert.equal(payload.updated_at, new Date(1_700_000_000_000).toISOString());
});

test("pushRow is a no-op without a signed-in user", async () => {
  const client = stubClient();
  await pushRow(client, "attempts", null, { updatedAt: 1 });
  assert.equal(client.upsertCalls.length, 0);
});

test("deleteRow removes the row for this user and set only", async () => {
  const client = stubClient();
  await deleteRow(client, "attempts", "user-1");
  assert.deepEqual(client.deleteCalls, ["attempts"]);
});
