import { isAddress } from "viem";
import { CKES_SWAP_ABI } from "./abis.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { applyExactOutputBuffer } from "./tokens.js";

const routeEnv = import.meta.env || {};
const uniV3BackupDisabled = String(routeEnv.VITE_DISABLE_UNIV3_BACKUP || "").toLowerCase() === "true";

export const ROUTE_IDS = {
  CHOCO_GATEWAY_MENTO: "choco-gateway-mento-usdc-usdm-kesm",
  CHOCO_UNIV3:         "choco-univ3-usdc-usdm-kesm",
};

// Routes are tried in order. The first route whose quote call succeeds is selected.
// The backup route is automatic for users when configured. Keep the UI simple:
// Choco tries the primary route first, then falls back internally. Use
// VITE_DISABLE_UNIV3_BACKUP=true only as an operational kill switch.
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
    executable:      !uniV3BackupDisabled && isAddress(ADDRESSES.ckesSwapUniV3 || ""),
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
  return publicClient.readContract({
    address: route.contractAddress,
    abi:     CKES_SWAP_ABI,
    functionName: "quoteExactOut",
    args:    [ckesAmountRaw],
  }); // RAW net cost; the slippage buffer is applied by selectTransferRouteExactOut below
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
      const usdcQuoted = await quoteRouteExactOut(publicClient, route, ckesAmountRaw); // raw net cost
      if (!(usdcQuoted > 0n)) throw new Error("Route returned an empty quote.");
      const usdcAmountIn = applyExactOutputBuffer(usdcQuoted); // buffered max-in (cap); the unused surplus refunds as USDm
      return { ok: true, route, usdcAmountIn, usdcQuoted, contractAddress: route.contractAddress, failures };
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

// Retry the inverse quote with backoff. Right after a send, forno can briefly rate-limit the burst of
// reads (receipt poll + balance + ledger refresh) and/or the Mento leg report goes momentarily stale,
// so the *second* transfer's quote needs a few seconds to recover — a 1s window wasn't enough. The
// retries only run when the quote actually fails, so a normal first-try quote stays instant.
export async function selectTransferRouteExactOutWithRetry({ ckesAmountRaw, attempts = 6, publicClient = makePublicClient() }) {
  let result = await selectTransferRouteExactOut({ ckesAmountRaw, publicClient });
  for (let attempt = 1; !result.ok && attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 400 * attempt)));
    result = await selectTransferRouteExactOut({ ckesAmountRaw, publicClient });
  }
  return result;
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
