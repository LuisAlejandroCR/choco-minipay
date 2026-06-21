import { isAddress } from "viem";
import { CKES_SWAP_ABI } from "./abis.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { applyExactOutputBuffer } from "./tokens.js";

export const ROUTE_IDS = {
  CHOCO_GATEWAY_MENTO: "choco-gateway-mento-usdc-usdm-kesm",
  CHOCO_UNIV3:         "choco-univ3-usdc-usdm-kesm",
};

// Routes are tried in order. The first route whose quote call succeeds is selected.
// No human intervention needed — if the Mento KESm oracle goes down, the app
// automatically falls to the Uniswap V3 backup. When Mento recovers, it's used again.
// Both contracts must be deployed once; after that switching is fully automatic.
export const TRANSFER_ROUTES = [
  {
    id:              ROUTE_IDS.CHOCO_GATEWAY_MENTO,
    label:           "Mento USDC -> USDm -> KESm",
    executable:      isAddress(ADDRESSES.ckesSwap || ""),
    contractAddress: ADDRESSES.ckesSwap,
    description:     "Primary route via Mento BiPool. Wallet pays USDC; recipient receives KESm.",
  },
  {
    id:              ROUTE_IDS.CHOCO_UNIV3,
    label:           "Uniswap V3 USDC -> USDm -> KESm",
    executable:      isAddress(ADDRESSES.ckesSwapUniV3 || ""),
    contractAddress: ADDRESSES.ckesSwapUniV3,
    description:     "Backup route: USDC->USDm via Mento, USDm->KESm via Uniswap V3 (no KESm oracle needed).",
  },
];

// True when at least one swap contract address is configured in env vars.
// Used by swap.js to decide whether to use the route system or fall back to the 5-step direct path.
export function hasAnyExecutableRoute() {
  return TRANSFER_ROUTES.some(r => r.executable);
}

export function routeQuoteMessage(error) {
  const msg = [
    error?.message,
    error?.shortMessage,
    error?.cause?.message,
    error?.cause?.shortMessage,
  ].filter(Boolean).join(" ");

  if (/no valid median/i.test(msg)) {
    return "This transfer is temporarily unavailable. Try again later.";
  }
  if (/missing|not configured|invalid address/i.test(msg)) {
    return "This transfer is not available yet. Contact support.";
  }
  return "This transfer is temporarily unavailable. Try again later.";
}

async function quoteRouteExactOut(publicClient, route, ckesAmountRaw) {
  if (!isAddress(route.contractAddress || "")) {
    throw new Error("Swap contract is not configured.");
  }
  const quoted = await publicClient.readContract({
    address: route.contractAddress,
    abi:     CKES_SWAP_ABI,
    functionName: "quoteExactOut",
    args:    [ckesAmountRaw],
  });
  return applyExactOutputBuffer(quoted);
}

async function quoteRouteForwardIn(publicClient, route, usdcAmountRaw) {
  if (!isAddress(route.contractAddress || "")) {
    throw new Error("Swap contract is not configured.");
  }
  return publicClient.readContract({
    address: route.contractAddress,
    abi:     CKES_SWAP_ABI,
    functionName: "quote",
    args:    [usdcAmountRaw],
  });
}

// Inverse quote: given a cKES target, find the cheapest available route and return the USDC cost.
// Tries each route in TRANSFER_ROUTES order; skips disabled routes; catches quote failures silently.
export async function selectTransferRouteExactOut({ ckesAmountRaw, publicClient = makePublicClient() }) {
  if (!(ckesAmountRaw > 0n)) {
    return { ok: false, reason: "NO_AMOUNT", message: "Enter a KESm amount before sending.", failures: [] };
  }

  const failures = [];
  for (const route of TRANSFER_ROUTES) {
    if (!route.executable) continue;
    try {
      const usdcAmountIn = await quoteRouteExactOut(publicClient, route, ckesAmountRaw);
      if (!(usdcAmountIn > 0n)) throw new Error("Route returned an empty quote.");
      return { ok: true, route, usdcAmountIn, contractAddress: route.contractAddress, failures };
    } catch (error) {
      failures.push({ route, error, message: routeQuoteMessage(error) });
    }
  }

  return {
    ok: false,
    reason: "ROUTE_UNAVAILABLE",
    message: failures[0]?.message || "This transfer is temporarily unavailable. Try again later.",
    failures,
  };
}

// Forward quote: given a fixed USDC input, find the route that can execute it and return cKES out.
// Used by the fixed-input swap path (when the user specifies USDC amount instead of a cKES target).
export async function selectTransferRouteForwardIn({ usdcAmountRaw, publicClient = makePublicClient() }) {
  if (!(usdcAmountRaw > 0n)) {
    return { ok: false, reason: "NO_AMOUNT", message: "Enter a USDC amount before sending.", failures: [] };
  }

  const failures = [];
  for (const route of TRANSFER_ROUTES) {
    if (!route.executable) continue;
    try {
      const ckesAmountOut = await quoteRouteForwardIn(publicClient, route, usdcAmountRaw);
      if (!(ckesAmountOut > 0n)) throw new Error("Route returned an empty quote.");
      return { ok: true, route, ckesAmountOut, contractAddress: route.contractAddress, failures };
    } catch (error) {
      failures.push({ route, error, message: routeQuoteMessage(error) });
    }
  }

  return {
    ok: false,
    reason: "ROUTE_UNAVAILABLE",
    message: failures[0]?.message || "This transfer is temporarily unavailable. Try again later.",
    failures,
  };
}
