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
  },
  {
    code: "ghs", label: "Ghana", flag: "🇬🇭",
    currency: "Ghanaian Cedi",
    rail: "MTN MoMo · bank transfer",
    live: KOTANI_READY,
    native: false,
  },
  {
    code: "zar", label: "South Africa", flag: "🇿🇦",
    currency: "South African Rand",
    rail: "Bank transfer",
    live: KOTANI_READY,
    native: false,
  },
];

// Placeholder until the Kotani API key arrives and /api/kotani exists.
export async function initiateKotaniPayout() {
  throw new Error("This corridor is not live yet. Kenya transfers work today.");
}
