// Publishable client config for optional Supabase sync. The anon key below is
// safe to ship in client-side code by design — paired with the Row Level
// Security policies in supabase/schema.sql, it only ever lets a signed-in
// user read or write their own rows. Nobody else's data is reachable with it.
// These point at the live project. Blanking them (or restoring a "YOUR-"
// placeholder) puts the app back in local-only mode: no network calls are
// made and everything still works from localStorage.
export const SUPABASE_URL = "https://qwlemnpgkyzqjyrjtiwo.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_jPyrt3HRreurUaniN99OYA_WZd4Po1n";
