/**
 * Block 12: Balance + Quote
 *
 * Provides two primitives for the review screen:
 *   readUsdcBalance — reads the sender's USDC balance from the chain via eth_call.
 *   buildQuote      — fetches balance + live rate and returns the full quote object.
 *
 * The callRpc parameter must be an async function matching the server.js signature:
 *   callRpc(method: string, params?: unknown[]) → Promise<unknown>
 *
 * Live rate source: Celo SortedOracles `medianRate(address)`, which gives the
 * cKES/CELO and USDm/CELO rates. Ratio → cKES per USDC.
 *
 * If the oracle call fails (e.g. pair not registered on testnet), the function falls
 * back to a mock rate of 130 cKES/USDC, clearly labeled in the `rateSource` field.
 * The mock is never hardcoded at the point of use — the oracle path always runs first.
 *
 * Block 13 connect-point: replace fetchLiveKesRate with Mento Broker getAmountOut
 * once the USDC/cKES exchange ID is confirmed on Celo Sepolia.
 */

import { getCeloNetworkConfig, getStablecoinConfig } from "../config/celo.js";

// ── ABI selectors ────────────────────────────────────────────────────────────

// keccak256("balanceOf(address)") → ERC-20 standard, universally verified.
const SELECTOR_BALANCE_OF = "0x70a08231";

// keccak256("medianRate(address)") → Celo SortedOracles
// Verify with: require('ethers').id("medianRate(address)").slice(0, 10)
// Block 13: swap for Mento Broker getAmountOut once exchange pool is confirmed.
const SELECTOR_MEDIAN_RATE = "0x63c0e8e0";

// Fallback rate — used ONLY when every oracle call fails.
// Response is labeled "mock-until-provider-connected" so the caller can detect it.
const MOCK_KES_PER_USDC = 130;

// ── Low-level ABI helpers ─────────────────────────────────────────────────────

/**
 * Build eth_call data for a function that takes a single address argument.
 */
function encodeAddressCall(selector, address) {
  const addr = address.toLowerCase().replace("0x", "").padStart(64, "0");
  return `${selector}${addr}`;
}

/**
 * Decode a single uint256 from an eth_call hex result.
 * Returns 0n for empty / malformed responses (no-throw).
 */
function decodeUint256(hexResult) {
  if (!hexResult || hexResult === "0x" || hexResult.length < 10) return 0n;
  try {
    return BigInt(hexResult);
  } catch {
    return 0n;
  }
}

/**
 * Decode two consecutive uint256 values from an eth_call hex result.
 * Used for SortedOracles medianRate which returns (numerator, denominator).
 * Returns [0n, 1n] (safe / skip) when the response is malformed.
 */
function decodeTwoUint256(hexResult) {
  const clean = hexResult?.startsWith("0x") ? hexResult.slice(2) : String(hexResult ?? "");
  if (clean.length < 128) return [0n, 1n];
  try {
    return [
      BigInt("0x" + clean.slice(0, 64)),
      BigInt("0x" + clean.slice(64, 128)),
    ];
  } catch {
    return [0n, 1n];
  }
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/**
 * Format a USDC amount in 6-decimal minor units to a human-readable string.
 * formatUsdc(2100000n) → "2.1 USDC"
 * formatUsdc(2307692n) → "2.31 USDC"
 */
export function formatUsdc(minorValue) {
  const n = typeof minorValue === "bigint" ? minorValue : BigInt(String(minorValue));
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""} USDC`;
}

/**
 * Guard — throws a clear setup message if Block 12 prerequisites are missing.
 * cKesAddress and mentoBrokerAddress must be non-null strings in celo.js.
 * This prevents silent failures from null addresses.
 */
export function assertQuoteAddresses(networkKey = "celoSepolia") {
  const config = getCeloNetworkConfig(networkKey);
  if (!config.cKesAddress) {
    throw new Error(
      `[quote] Block 12 setup: cKesAddress is null in celo.js for "${networkKey}". ` +
      "Confirm the cKES ERC-20 address on celo-sepolia.blockscout.com before calling buildQuote.",
    );
  }
  if (!config.mentoBrokerAddress) {
    throw new Error(
      `[quote] Block 12 setup: mentoBrokerAddress is null in celo.js for "${networkKey}". ` +
      "Confirm the Mento broker address on celo-sepolia.blockscout.com before calling buildQuote.",
    );
  }
  return config;
}

// ── Balance ───────────────────────────────────────────────────────────────────

/**
 * Read the sender's USDC balance from the chain.
 *
 * @param {string}   walletAddress  Sender's 0x wallet address
 * @param {string}   networkKey     e.g. "celoSepolia"
 * @param {Function} callRpc        async (method, params) => result
 * @returns {{ wei: string, formatted: string, usdcMinor: bigint }}
 */
export async function readUsdcBalance(walletAddress, networkKey, callRpc) {
  assertQuoteAddresses(networkKey);
  const usdc = getStablecoinConfig(networkKey, "USDC");
  if (!usdc) throw new Error(`[quote] No USDC config for network "${networkKey}"`);

  const data = encodeAddressCall(SELECTOR_BALANCE_OF, walletAddress);
  const hex = await callRpc("eth_call", [{ to: usdc.tokenAddress, data }, "latest"]);
  const usdcMinor = decodeUint256(hex);

  return {
    wei: usdcMinor.toString(),
    formatted: formatUsdc(usdcMinor),
    usdcMinor,
  };
}

// ── Rate ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the live cKES-per-USDC rate from Celo SortedOracles.
 *
 * Algorithm:
 *   medianRate(cKES) → (cKES numerator, denominator) → cKES per CELO
 *   medianRate(USDm) → (USDm numerator, denominator) → USDm per CELO (≈ USD per CELO)
 *   cKES per USDC ≈ cKES per CELO / USDm per CELO  (since 1 USDC ≈ 1 USDm ≈ 1 USD)
 *
 * Throws on any error — caller falls back to mock rate.
 */
async function fetchLiveKesRate(networkKey, callRpc) {
  const config = getCeloNetworkConfig(networkKey);
  const { sortedOraclesAddress, cKesAddress } = config;
  if (!sortedOraclesAddress || !cKesAddress) {
    throw new Error("[quote] sortedOraclesAddress or cKesAddress missing from celo.js");
  }

  const usdm = getStablecoinConfig(networkKey, "USDm");
  if (!usdm) throw new Error(`[quote] No USDm config for network "${networkKey}"`);

  // medianRate(cKES) → cKES per CELO
  const cKesHex = await callRpc("eth_call", [{
    to: sortedOraclesAddress,
    data: encodeAddressCall(SELECTOR_MEDIAN_RATE, cKesAddress),
  }, "latest"]);
  const [cKesNum, cKesDen] = decodeTwoUint256(cKesHex);
  if (cKesNum === 0n || cKesDen === 0n) {
    throw new Error("[quote] SortedOracles returned zero/invalid cKES rate — pair may not be registered");
  }

  // medianRate(USDm) → USDm per CELO (USD proxy)
  const usdmHex = await callRpc("eth_call", [{
    to: sortedOraclesAddress,
    data: encodeAddressCall(SELECTOR_MEDIAN_RATE, usdm.tokenAddress),
  }, "latest"]);
  const [usdmNum, usdmDen] = decodeTwoUint256(usdmHex);
  if (usdmNum === 0n || usdmDen === 0n) {
    throw new Error("[quote] SortedOracles returned zero/invalid USDm rate");
  }

  // cKES per USDC ≈ (cKesNum/cKesDen) / (usdmNum/usdmDen)
  //              = (cKesNum * usdmDen) / (cKesDen * usdmNum)
  // Use BigInt arithmetic to preserve precision, then convert to Number.
  const SCALE = 10n ** 9n;
  const rateScaled = (cKesNum * usdmDen * SCALE) / (cKesDen * usdmNum);
  const rate = Number(rateScaled) / Number(SCALE);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`[quote] Computed rate is not usable: ${rate}`);
  }
  return rate;
}

// ── Quote builder ─────────────────────────────────────────────────────────────

/**
 * Build the full Block 12 quote for a USDC → cKES transfer.
 *
 * @param {object}   params
 * @param {string}   params.walletAddress  Sender's 0x address
 * @param {number}   params.amountMinor    cKES integer amount (e.g. 300 for "KES 300")
 * @param {string}   [params.networkKey]   Defaults to "celoSepolia"
 * @param {Function} params.callRpc        async (method, params) => result
 *
 * @returns {Promise<{
 *   sourceAsset:      string,
 *   sourceAmount:     number,
 *   destinationAsset: string,
 *   destinationAmount: number,
 *   rate:             number,
 *   rateSource:       string,
 *   balanceUsdc:      string,
 *   balanceUsdcWei:   string,
 *   requiredUsdcWei:  string,
 *   hasEnoughUsdc:    boolean,
 *   expiresInSeconds: number,
 * }>}
 */
export async function buildQuote({ walletAddress, amountMinor, networkKey = "celoSepolia", callRpc }) {
  assertQuoteAddresses(networkKey); // throws early if config is incomplete

  // 1. Read real USDC balance from the chain
  const balance = await readUsdcBalance(walletAddress, networkKey, callRpc);

  // 2. Fetch live rate — fall back to mock only on failure
  let cKesPerUsdc = MOCK_KES_PER_USDC;
  let rateSource = "mock-until-provider-connected";
  try {
    const liveRate = await fetchLiveKesRate(networkKey, callRpc);
    cKesPerUsdc = liveRate;
    rateSource = "sorted-oracles";
  } catch (err) {
    // Non-fatal on testnet. Block 13 wires the Mento Broker swap path.
    console.warn("[quote] Live KES rate unavailable, using mock:", err.message);
  }

  // 3. Compute required USDC (6-decimal minor units) from the desired cKES amount
  const sourceAmountUsdc = Number(amountMinor) / cKesPerUsdc;
  const requiredUsdcMinor = BigInt(Math.ceil(sourceAmountUsdc * 1_000_000));
  const hasEnoughUsdc = balance.usdcMinor >= requiredUsdcMinor;

  return {
    sourceAsset: "USDC",
    sourceAmount: Math.round(sourceAmountUsdc * 100) / 100,
    destinationAsset: "cKES",
    destinationAmount: Number(amountMinor),
    rate: Math.round(cKesPerUsdc * 100) / 100,
    rateSource,
    balanceUsdc: balance.formatted,
    balanceUsdcWei: balance.wei,
    requiredUsdcWei: requiredUsdcMinor.toString(),
    hasEnoughUsdc,
    expiresInSeconds: 45,
  };
}
