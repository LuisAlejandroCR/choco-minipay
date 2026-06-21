import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { ADDRESSES, makePublicClient } from "../../chain/client.js";
import { ERC20_ABI } from "../../chain/abis.js";
import { isEscrowConfigured, readLockedRun } from "../../chain/escrow.js";
import { deriveScheduleNotices } from "../../lib/scheduleNotices.js";

// Live "ring bell" feed: for each active scheduled plan, read its escrow lock + the wallet's USDC
// balance and derive the funded / needs-lock / top-up notice. All on-chain, computed each time the
// plan list refreshes — no backend, never stale. Empty until plans exist (and locks once escrow is live).
export function useScheduleNotices(plans, walletAddress) {
  const [notices, setNotices] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const active = (plans || []).filter((p) => p.deliveryMode === "schedule" && p.active !== false);
    if (!walletAddress || active.length === 0) {
      setNotices([]);
      return undefined;
    }

    (async () => {
      try {
        const publicClient = makePublicClient();
        const usdcRaw = await publicClient.readContract({
          address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [walletAddress],
        });
        const usdcBalance = Number(formatUnits(usdcRaw, 6));

        const enriched = await Promise.all(active.map(async (plan) => {
          let lockedUsdc = 0;
          if (isEscrowConfigured()) {
            try {
              const locked = await readLockedRun({ owner: walletAddress, scheduleId: plan.onchainId, publicClient });
              lockedUsdc = Number(formatUnits(locked, 6));
            } catch { lockedUsdc = 0; }
          }
          const amountUsdc = Number(plan.usdcPerRun || 0);
          return {
            id: plan.id,
            recipient: plan.recipient,
            amountUsdc,
            lockedUsdc,
            hasWalletFunds: usdcBalance >= amountUsdc,
            nextRunLabel: plan.schedule || plan.nextDate,
            active: true,
          };
        }));

        if (!cancelled) setNotices(deriveScheduleNotices({ plans: enriched }));
      } catch {
        if (!cancelled) setNotices([]);
      }
    })();

    return () => { cancelled = true; };
  }, [plans, walletAddress]);

  return notices;
}
