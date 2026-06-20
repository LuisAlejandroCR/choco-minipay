import { isAddress } from "viem";
import { CKES_SWAP_ABI } from "./abis.js";
import { ADDRESSES, makePublicClient } from "./client.js";
import { applyExactOutputBuffer } from "./tokens.js";

export const ROUTE_IDS = {
  CHOCO_GATEWAY_MENTO: "choco-gateway-mento-usdc-usdm-kesm",
};

export const TRANSFER_ROUTES = [
  {
    id: ROUTE_IDS.CHOCO_GATEWAY_MENTO,
    label: "Mento USDC -> USDm -> KESm",
    executable: true,
    description: "Current ChocoGateway route. Wallet pays USDC; recipient receives KESm.",
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

async function quoteChocoGatewayExactOut(publicClient, ckesAmountRaw) {
  if (!isAddress(ADDRESSES.ckesSwap || "")) {
    throw new Error("VITE_CKES_SWAP_CONTRACT_ADDRESS is not configured.");
  }
  const quoted = await publicClient.readContract({
    address: ADDRESSES.ckesSwap,
    abi: CKES_SWAP_ABI,
    functionName: "quoteExactOut",
    args: [ckesAmountRaw],
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
      const usdcAmountIn = await quoteChocoGatewayExactOut(publicClient, ckesAmountRaw);
      if (!(usdcAmountIn > 0n)) throw new Error("Route returned an empty quote.");
      return { ok: true, route, usdcAmountIn, failures };
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