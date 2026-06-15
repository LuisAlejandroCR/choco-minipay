import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const SUPABASE_READY = Boolean(url && anonKey);

// persistSession: true lets Supabase store the JWT in localStorage so the user
// only needs to sign "Sign in to Choco" once per session expiry (~1 hour),
// not once per page load. MiniPay supports localStorage within the mini-app tab.
export const supabase = SUPABASE_READY
  ? createClient(url, anonKey, { auth: { persistSession: true, storageKey: "choco-sb-auth" } })
  : null;

export function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}

// In-memory fast path — avoids the async getSession() call when the session is
// already loaded in this JS execution context.
let _session = null;

export async function signInWithWallet(address) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!window.ethereum) throw new Error("No wallet found. Please open Choco in MiniPay.");

  // 1. In-memory cache: still valid with >60 s to expiry
  if (_session && _session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return _session;
  }

  // 2. Restored from localStorage by Supabase client (survives page reload / mini-app reopen)
  const { data: stored } = await supabase.auth.getSession();
  if (stored?.session && stored.session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    _session = stored.session;
    return _session;
  }

  // 3. Full sign-in: one personal_sign per expired/absent session
  const timestamp = Date.now();
  const message = `Sign in to Choco\nWallet: ${address}\nTime: ${timestamp}`;

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, address],
  });

  const res = await fetch(`${url}/functions/v1/auth-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature, message }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Wallet authentication failed");
  }

  const { token_hash } = await res.json();

  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
  if (error) throw new Error(`Supabase session error: ${error.message}`);

  _session = data.session;
  return _session;
}

// Call before any Supabase contact operation. Returns null when Supabase is not
// configured so callers can skip gracefully.
export async function ensureSupabaseAuth(address) {
  if (!SUPABASE_READY || !address) return null;
  return signInWithWallet(address);
}
