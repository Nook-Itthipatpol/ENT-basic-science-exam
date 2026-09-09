import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const SUPABASE_JS_URL = "https://esm.sh/@supabase/supabase-js@2.45.4";
export const SET_ID = "set-02"; // default set_id for callers that don't sync more than one set

const isPlaceholder = (value) => !value || value.startsWith("YOUR-");
export const isSyncConfigured = () => !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

let clientPromise = null;
export function getClient() {
  if (!isSyncConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import(SUPABASE_JS_URL)
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } }))
      .catch(() => null);
  }
  return clientPromise;
}

async function withClient(action, fallback) {
  try { const client = await getClient(); return client ? await action(client) : fallback; } catch { return fallback; }
}

async function currentUserId(client) {
  const { data } = await client.auth.getSession();
  return data?.session?.user?.id ?? null;
}

export function resolveByUpdatedAt(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const localTime = local.updatedAt ?? local.startedAt ?? 0;
  const remoteTime = remote.updatedAt ?? remote.startedAt ?? 0;
  return remoteTime > localTime ? remote : local;
}

export function rowToPayload(row) {
  if (!row) return null;
  return { ...row.payload, updatedAt: Date.parse(row.updated_at) };
}

export async function pullRow(client, table, userId, setId = SET_ID) {
  if (!userId) return null;
  const { data, error } = await client.from(table).select("payload,updated_at").eq("user_id", userId).eq("set_id", setId).maybeSingle();
  if (error || !data) return null;
  return rowToPayload(data);
}

export async function pushRow(client, table, userId, payload, setId = SET_ID) {
  if (!userId) return;
  const updatedAt = payload.updatedAt || Date.now();
  await client.from(table).upsert({ user_id: userId, set_id: setId, payload, updated_at: new Date(updatedAt).toISOString() }, { onConflict: "user_id,set_id" });
}

export async function deleteRow(client, table, userId, setId = SET_ID) {
  if (!userId) return;
  await client.from(table).delete().eq("user_id", userId).eq("set_id", setId);
}

function makeSync(table) {
  return {
    pull: (setId = SET_ID) => withClient(async (client) => pullRow(client, table, await currentUserId(client), setId), null),
    push: (payload, setId = SET_ID) => withClient(async (client) => { const userId = await currentUserId(client); if (userId) await pushRow(client, table, userId, payload, setId); }, undefined),
    clear: (setId = SET_ID) => withClient(async (client) => { const userId = await currentUserId(client); if (userId) await deleteRow(client, table, userId, setId); }, undefined)
  };
}

export const attemptSync = makeSync("attempts");
export const summarySync = makeSync("summaries");

export async function getSession() { return withClient(async (client) => (await client.auth.getSession()).data?.session ?? null, null); }
export async function sendMagicLink(email) {
  const client = await getClient();
  if (!client) throw new Error("Sync is not configured");
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` } });
  if (error) throw error;
}
export async function signOut() { const client = await getClient(); if (client) await client.auth.signOut(); }
export function onAuthChange(handler) { getClient().then((client) => client?.auth.onAuthStateChange((_event, session) => handler(session))); }
