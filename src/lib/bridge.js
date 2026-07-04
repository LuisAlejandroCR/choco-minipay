// Bridge (Stripe) LATAM offramp — frontend client (calls /api/bridge proxy, never the API directly).
// Set VITE_BRIDGE_ENABLED=true once Bridge KYB is approved and BRIDGE_API_KEY is in Vercel.
// Apply for KYB at bridge.xyz — takes ~1-2 weeks.

export const BRIDGE_READY = import.meta.env.VITE_BRIDGE_ENABLED === "true";

// Corridor definitions: rail and bankField must match Bridge's API expectations.
export const LATAM_CORRIDORS = [
  {
    code: "brl", rail: "pix",   label: "Brazil",   flag: "🇧🇷",
    currency: "Brazilian Real",
    bankField: "pix_key",
    bankLabel: "PIX key",
    bankPlaceholder: "CPF, phone (+55…), email, or random key",
    status: "live",
  },
  {
    code: "mxn", rail: "spei",  label: "Mexico",   flag: "🇲🇽",
    currency: "Mexican Peso",
    bankField: "clabe",
    bankLabel: "CLABE",
    bankPlaceholder: "18-digit CLABE number",
    status: "live",
  },
  {
    code: "cop", rail: "bre_b", label: "Colombia", flag: "🇨🇴",
    currency: "Colombian Peso",
    bankField: "account_number",
    bankLabel: "Account number",
    bankPlaceholder: "Bank account number",
    status: "beta",
  },
];

// customerId is kept in sessionStorage (cleared on tab close) rather than localStorage.
// localStorage would let an XSS steal the id across sessions and call /api/bridge to
// create a liquidation address pointing to an attacker's bank account.
// sessionStorage limits the exposure window to the active tab only.
// KYC approval lives on Bridge's servers — users re-enter their email once per session.
const cidKey = (wallet) => `choco:bridge:cid:${String(wallet || "").toLowerCase()}`;

export function getStoredCustomerId(walletAddress) {
  if (!walletAddress) return "";
  try { return sessionStorage.getItem(cidKey(walletAddress)) || ""; } catch { return ""; }
}

export function saveCustomerId(walletAddress, customerId) {
  if (!walletAddress || !customerId) return;
  try { sessionStorage.setItem(cidKey(walletAddress), customerId); } catch {}
}

async function post(action, body, customerId = "") {
  const qs = customerId ? `&customerId=${customerId}` : "";
  const r = await fetch(`/api/bridge?action=${action}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Bridge error");
  return data;
}

async function get(action, customerId) {
  const r = await fetch(`/api/bridge?action=${action}&customerId=${customerId}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Bridge error");
  return data;
}

// Creates a Bridge-hosted KYC link. Saves the returned customerId to localStorage.
export async function createKycLink(email, walletAddress) {
  const data = await post("kyc_link", { email });
  if (data.customerId && walletAddress) saveCustomerId(walletAddress, data.customerId);
  return { kycUrl: data.kycUrl, customerId: data.customerId };
}

// Returns the user's KYC approval status ("approved" | "pending" | "rejected" | …).
export async function getKycStatus(customerId) {
  const data = await get("kyc_status", customerId);
  return data.status;
}

// Returns an existing deposit address for the given rail/currency, or creates a new one.
export async function getOrCreateLiquidationAddress({ customerId, rail, currency, bankAccount }) {
  // Reuse an existing address for the same rail+currency so repeat sends skip the API call.
  try {
    const existing = await get("liquidation_addresses", customerId);
    const match = (existing.addresses || []).find(
      (a) => a.destination?.payment_rail === rail && a.destination?.currency === currency,
    );
    if (match?.address) return match.address;
  } catch {
    // Non-fatal: fall through to create a new one.
  }
  const created = await post("liquidation_address", { rail, currency, bankAccount }, customerId);
  return created.address;
}
