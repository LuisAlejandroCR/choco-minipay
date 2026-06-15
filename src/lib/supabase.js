import { createClient } from "@supabase/supabase-js";

const url = import.meta.env?.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

export const SUPABASE_READY = Boolean(url && anonKey);

export const supabase = SUPABASE_READY
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

export function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}

// In-memory session cache — cleared on page reload. No localStorage (MiniPay tab lifecycle).
let _session = null;

// Sign in with a wallet signature. Prompts the user once per tab via personal_sign,
// then calls the auth-wallet Edge Function and exchanges the token_hash for a session.
// The session is cached in memory; the supabase singleton automatically sends it on
// all subsequent database calls via Authorization: Bearer <access_token>.
export async function signInWithWallet(address) {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!window.ethereum) throw new Error("No wallet found. Please open Choco in MiniPay.");

  // Re-use cached session if it has more than 60 seconds left.
  if (_session && _session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return _session;
  }

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

// Call before any Supabase contact operation. Signs in with the wallet if not yet
// authenticated; re-uses the cached session otherwise. Returns null when Supabase
// is not configured so callers can skip gracefully.
export async function ensureSupabaseAuth(address) {
  if (!SUPABASE_READY || !address) return null;
  return signInWithWallet(address);
}
