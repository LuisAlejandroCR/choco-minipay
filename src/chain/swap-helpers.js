import { formatUnits, parseUnits } from "viem";
import { CKES_SWAP_ABI, ERC20_ABI } from "./abis.js";

// When a send-now needs a USDC approval, approve this many sends' worth so the next several sends reuse the
// warm allowance (one approval per batch instead of one per send). The gateway only ever pulls the actual
// amount and refunds surplus, so a slightly larger allowance to our own contract is safe.
export const SEND_APPROVE_BATCH = 10n;

// HARD CEILING on the batch (in USDC, 6-dec). This is the trust guard: the multiplier scales with the send,
// so a 50k-KESm (~$390) transfer would otherwise request a ~$3,900 approval. Capping the batch at a small
// absolute amount means a LARGE send approves EXACTLY what it spends ("approve $390 to send $390" — no
// multiple), while small/frequent sends still batch up to this ceiling. Tune this one number to taste.
export const SEND_APPROVE_CAP = parseUnits("1.0002", 6);

// Pick the approval amount: batch ~SEND_APPROVE_BATCH small sends, but never above SEND_APPROVE_CAP ($1.20),
// never below THIS send's need (so a large send approves its exact amount — no scary multiple), and never
// above the wallet balance. `balance` is already read for the affordability check, so this is free, and the
// caller has ensured balance >= the single-send need, so it never under-approves.
export function batchApproveAmount(perSend, balance) {
  const batched = perSend * SEND_APPROVE_BATCH;
  const capped = batched < SEND_APPROVE_CAP ? batched : SEND_APPROVE_CAP; // never batch above the ceiling
  const cover = capped > perSend ? capped : perSend;                      // but always cover this send
  return cover < balance ? cover : balance;                              // and never exceed the balance
}

export function readErc20Balance(publicClient, token, account) {
  return publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
}

export function readErc20Allowance(publicClient, token, owner, spender) {
  return publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, spender] });
}

export function formatUsdc(amount) {
  return `${Number(formatUnits(amount, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDC`;
}

export function routeError(error) {
  const reason = error?.shortMessage || error?.details || error?.message || "gateway route reverted";
  return new Error(`Choco route could not execute before wallet signing: ${reason}`);
}

export function confirmTransactionInBackground(publicClient, hash) {
  publicClient.waitForTransactionReceipt({ hash }).catch((error) => {
    console.warn("Choco could not confirm the transaction receipt yet.", error);
  });
}

// Pre-flight simulate of the swap, retried with backoff: it runs the gateway's full route, which can
// momentarily hit a Mento "no valid median" right after a prior send. Returns { ok:true } or { ok:false, error }.
export async function simulateSwapWithRetry(publicClient, { account, swapContract, recipient, usdcNeeded, ckesExact }, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    try {
      await publicClient.simulateContract({
        account,
        address: swapContract,
        abi: CKES_SWAP_ABI,
        functionName: "swapAndSendExact",
        args: [recipient, usdcNeeded, ckesExact],
      });
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError };
}

// Gateway sends do two swaps and then `_log -> ledger.logAttemptFor` inside a try/catch. Under the
// EVM 63/64 gas rule a wallet's auto-estimate can starve that sub-call, so the AttemptLogged audit
// entry — the ONLY history record for a send-now — silently OOGs while the transfer still succeeds.
// Pass an explicit gas limit with headroom so logAttemptFor completes. You only pay for gas USED.
const SEND_GAS_FLOOR = 1_200_000n;
export async function sendGasLimit(publicClient, params) {
  try {
    const est = await publicClient.estimateContractGas(params);
    const buffered = (est * 3n) / 2n;
    return buffered > SEND_GAS_FLOOR ? buffered : SEND_GAS_FLOOR;
  } catch {
    return SEND_GAS_FLOOR;
  }
}
