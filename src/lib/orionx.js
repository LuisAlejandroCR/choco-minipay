// Orionx Business Payments — Chile (CLP) and Peru (PEN) offramp.
// Apply at orionx.com/business. Set ORIONX_API_KEY (server-only) and VITE_ORIONX_ENABLED=true
// once approved. Chile and Peru show as "Soon" until the flag flips on.

export const ORIONX_READY = import.meta.env.VITE_ORIONX_ENABLED === "true";

export const ORIONX_CORRIDORS = [
  {
    code: "clp",
    label: "Chile",
    flag: "🇨🇱",
    currency: "Chilean Peso",
    rail: "Bank transfer",
    bankLabel: "Account number",
    bankPlaceholder: "Bank account number",
    idLabel: "RUT",
    idPlaceholder: "12.345.678-9",
    idField: "rut",
  },
  {
    code: "pen",
    label: "Peru",
    flag: "🇵🇪",
    currency: "Peruvian Sol",
    rail: "Bank transfer (CCI)",
    bankLabel: "CCI number",
    bankPlaceholder: "20-digit interbank code",
    idLabel: "DNI / RUC",
    idPlaceholder: "Document number",
    idField: "dni",
  },
];

// Returns { rate, localAmount, fee } for a USDC → local currency quote.
export async function getOrionxQuote(currency, amountUsdc) {
  const r = await fetch(`/api/orionx?action=quote&currency=${currency}&amount=${amountUsdc}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Quote failed.");
  return data;
}

// Initiates a payout. Returns { reference, depositAddress, expiresAt }.
// recipient: { bankAccount, rut } for Chile or { bankAccount, dni } for Peru.
export async function initiateOrionxPayout(currency, amountUsdc, recipient) {
  const r = await fetch("/api/orionx?action=payout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency, amountUsdc: String(amountUsdc), recipient }),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Payout initiation failed.");
  return data;
}

// Polls payout status by reference. Returns { status, localAmount }.
export async function getOrionxStatus(reference) {
  const r = await fetch(`/api/orionx?action=status&reference=${encodeURIComponent(reference)}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || "Status check failed.");
  return data;
}
