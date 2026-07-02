// Ramp Network onramp widget — lazy-loaded from CDN so no npm install is required and the
// build stays clean until you add the SDK to package.json.
//
// Register at https://ramp.network/for-business to get a production API key and activate
// the 0.3–0.5% partner referral program.
//
// Env vars (add to .env.example + Vercel):
//   VITE_RAMP_API_KEY          — production key
//   VITE_RAMP_API_KEY_SANDBOX  — sandbox key for dev testing

const RAMP_CDN = "https://cdn.ramp.network/ramp-instant-sdk.js";
const RAMP_API_KEY = import.meta.env.VITE_RAMP_API_KEY || import.meta.env.VITE_RAMP_API_KEY_SANDBOX || "";

// True only when a key is configured; lets callers decide whether to show the "Fund wallet" button.
export const RAMP_READY = Boolean(RAMP_API_KEY);

function loadRampSdk() {
  return new Promise((resolve, reject) => {
    if (window.RampInstantSDK) { resolve(window.RampInstantSDK); return; }
    const script = document.createElement("script");
    script.src = RAMP_CDN;
    script.onload = () => resolve(window.RampInstantSDK);
    script.onerror = () => reject(new Error("Failed to load Ramp Network SDK from CDN."));
    document.head.appendChild(script);
  });
}

// Open the Ramp onramp widget.  Delivers USDC or USDT directly to the user's Celo wallet.
// walletAddress — the user's Celo address (Privy embedded or MetaMask/MiniPay).
export async function openRampOnramp(walletAddress) {
  if (!RAMP_API_KEY) {
    console.warn("[Choco/Ramp] VITE_RAMP_API_KEY is not set — fund wallet is disabled.");
    return;
  }
  const RampInstantSDK = await loadRampSdk();
  new RampInstantSDK({
    hostAppName: "Choco",
    hostLogoUrl: "https://usechoco.app/logo.png",
    hostApiKey: RAMP_API_KEY,
    defaultFlow: "ONRAMP",
    userAddress: walletAddress,
    // CELO_ prefix is Ramp's chain identifier; USDC/USDT are the tokens.
    enabledCryptoAssets: "CELO_USDC,CELO_USDT",
    finalUrl: window.location.href,
  }).show();
}
