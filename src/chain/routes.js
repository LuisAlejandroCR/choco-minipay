import { isAddress } from "viem";
import { CKES_SWAP_ABI } from "./abis.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { applyExactOutputBuffer } from "./tokens.js";

export const ROUTE_IDS = {
  CHOCO_GATEWAY_MENTO: "choco-gateway-mento-usdc-usdm-kesm",
  CHOCO_UNIV3:         "choco-univ3-usdc-usdm-kesm",
};

// Routes are evaluated at module load time from env-derived ADDRESSES constants.
// Primary route (Mento BiPool) is tried first; backup (Uniswap V3) is tried automatically
// when the primary fails - e.g. when the Mento KESm oracle has no valid median.
// The backup route is only active when VITE_CKES_SWAP_UNIV3_ADDRESS is set in the environment.
export const TRANSFER_ROUTES = [
  {
    id:              ROUTE_IDS.CHOCO_GATEWAY_MENTO,
    label:           "Mento USDC -> USDm -> KESm",
    executable:      true,
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
    throw new Error("VITE_CKES_SWAP_CONTRACT_ADDRESS is not configured.");
  }
  const quoted = await publicClient.readContract({
    address: route.contractAddress,
    abi:     CKES_SWAP_ABI,
    functionName: "quoteExactOut",
    args:    [ckesAmountRaw],
  });
  return applyExactOutputBuffer(quoted);
}

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
