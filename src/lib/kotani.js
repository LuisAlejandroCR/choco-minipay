// Kotani Pay — Africa expanded offramp (Nigeria, Ghana, South Africa).
// Kenya stays on the existing ChocoGateway → KESm flow; Kotani only adds new countries.
//
// Apply for API access at kotanipay.com (~1 week). The API key is server-only:
// when it arrives, add an /api/kotani proxy (same pattern as api/bridge.js) and
// set VITE_KOTANI_ENABLED=true to light up the new corridors.

export const KOTANI_READY = import.meta.env.VITE_KOTANI_ENABLED === "true";

// Kenya first — it is Choco's live corridor and routes to the existing plan screen.
export const AFRICA_CORRIDORS = [
  {
    code: "kes", label: "Kenya", flag: "🇰🇪",
    currency: "Kenyan Shilling (KESm)",
    rail: "Choco on-chain · M-Pesa ready",
    live: true,       // always live — existing ChocoGateway flow
    native: true,     // handled by Choco itself, not Kotani
  },
  {
    code: "ngn", label: "Nigeria", flag: "🇳🇬",
    currency: "Nigerian Naira",
    rail: "Bank transfer · mobile money",
    live: KOTANI_READY,
    native: false,
    recipientType: "phone",
    recipientLabel: "Mobile number",
    recipientPlaceholder: "+234 80x xxx xxxx",
  },
  {
    code: "ghs", label: "Ghana", flag: "🇬🇭",
    currency: "Ghanaian Cedi",
    rail: "MTN MoMo · bank transfer",
    live: KOTANI_READY,
    native: false,
    recipientType: "phone",
    recipientLabel: "MoMo number",
    recipientPlaceholder: "+233 5x xxx xxxx",
  },
  {
    code: "zar", label: "South Africa", flag: "🇿🇦",
    currency: "South African Rand",
    rail: "Bank transfer",
    live: KOTANI_READY,
    native: false,
    recipientType: "bank",
    recipientLabel: "Account number",
    recipientPlaceholder: "Bank account number",
    bankCodeLabel: "Bank code",
    bankCodePlaceholder: "e.g. ABSA, FNB, CAPITEC",
  },
];

// ── Client functions — call the /api/kotani proxy (server holds the API key) ──

// Returns { rate, localAmount, fee } for a USDC → local currency quote.
// currency: "ngn" | "ghs" | "zar"   amountUsdc: number or string
export async function getKotaniQuote(currency, amountUsdc) {
  const r = await fetch(`/api/kotani?action=quote&currency=${currency}&amount=${amountUsdc}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Quote failed.");
  return data;
}

// Initiates a payout. Returns { reference, depositAddress, expiresAt }.
// recipient: { phone } for mobile money, or { accountNumber, bankCode, name } for bank transfer.
export async function initiateKotaniPayout(currency, amountUsdc, recipient) {
  const r = await fetch("/api/kotani?action=payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency, amountUsdc: String(amountUsdc), recipient }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Payout initiation failed.");
  return data;
}

// Polls payout status by reference. Returns { status, localAmount }.
// status: "pending" | "processing" | "completed" | "failed"
export async function getKotaniStatus(reference) {
  const r = await fetch(`/api/kotani?action=status&reference=${encodeURIComponent(reference)}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Status check failed.");
  return data;
}
