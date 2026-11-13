import { createClient } from "./supabase.js";

const env = (typeof window !== "undefined" && window.__ENV__) || {};

export const SUPABASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  env.VITE_SUPABASE_URL ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
  "https://ktbmxjakzkopijdzkxlo.supabase.co";

export const SUPABASE_ANON_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  env.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY) ||
  "sb_publishable_ffsFhgLkKV1IGGEJKGV-2w_b9xRTZ1H";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: "cng_supabase_auth_token",
  },
});
