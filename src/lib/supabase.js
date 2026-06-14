import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

// Debug: Check if Supabase env vars are loaded
console.log('[Supabase] URL:', url ? 'SET' : 'MISSING');
console.log('[Supabase] Key:', anonKey ? 'SET' : 'MISSING');
console.log('[Supabase] READY:', Boolean(url && anonKey));

export const SUPABASE_READY = Boolean(url && anonKey);

export const supabase = SUPABASE_READY
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

export function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}
