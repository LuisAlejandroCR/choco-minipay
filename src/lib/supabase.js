import { createClient } from "@supabase/supabase-js";
import { isAddress, stringToHex } from "viem";

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

export function buildWalletSignInMessage(address, timestamp = Date.now()) {
  return `Sign in to Choco\nWallet: ${address}\nTime: ${timestamp}`;
}

export function buildPersonalSignPayload(message) {
  return stringToHex(message);
}

export async function signInWithWallet(address) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const walletAddress = String(address || "").trim();
  if (!isAddress(walletAddress)) throw new Error("Connect a valid Celo wallet before loading saved contacts.");

  // 1. In-memory cache: still valid with >60 s to expiry
  if (_session && _session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return _session;
  }

  // 2. Restored from localStorage by Supabase client (survives page reload / mini-app reopen).
  // This path works without window.ethereum — a stored JWT never needs a wallet prompt.
  const { data: stored } = await supabase.auth.getSession();
  if (stored?.session && stored.session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    _session = stored.session;
    return _session;
  }

  // 3. Full sign-in needs an injected wallet for personal_sign
  if (!window.ethereum) throw new Error("No wallet found. Please open Choco in MiniPay.");

  // 4. One personal_sign per expired/absent session
  const timestamp = Date.now();
  const message = buildWalletSignInMessage(walletAddress, timestamp);
  const signPayload = buildPersonalSignPayload(message);

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [signPayload, walletAddress],
  });

  const res = await fetch(`${url}/functions/v1/auth-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: walletAddress, signature, message }),
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

// Returns the current session without triggering a new personal_sign. Safe to call during
// background flows (e.g., buildPlan) where an unexpected wallet dialog would confuse the user.
export async function getCachedSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}
