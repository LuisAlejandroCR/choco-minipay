import { ethers } from "ethers";
import { isDueThisMonth, scheduleWindowForCurrentMonth } from "../src/lib/keeper-window.js";

// The keeper reads schedule state DIRECTLY from ChocoLedger (scheduleCount + getSchedule +
// lastSettlementAt) instead of replaying historical events. State reads are bounded by the number of
// schedules (tiny) rather than by chain height, so a run is a handful of eth_calls that can't time out —
// and there's no dependency on an explorer/log index that can hiccup. The chain stays the source of
// truth: this reads live contract storage, which is more authoritative than reconstructing state from
// an event log (and `active`/`cancelled` already reflect pauses/resumes/cancellations).
const LEDGER_ABI = [
  "function keeper() view returns (address)",
  "function scheduleCount() view returns (uint256)",
  "function lastSettlementAt(uint256) view returns (uint64)",
  "function getSchedule(uint256) view returns (tuple(address owner,address recipient,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint64 firstRunAt,bool active,bool cancelled,bytes32 commandHash,bytes32 receiptLabelHash))",
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
];

// Settlement runs through ChocoGateway: the owner pre-locks one run's USDC, the keeper settles it
// with only the scheduleId (the gateway reads recipient + amount from the ChocoLedger schedule, so
// the keeper can't redirect funds) and auto-locks the next run.
const ESCROW_ABI = [
  "function lockedOf(address owner,uint256 scheduleId) view returns (uint256)",
  "function settleScheduledRun(uint256 scheduleId) external returns (uint256)",
  "function lockFor(address owner,uint256 scheduleId,uint256 usdcAmount) external",
];

function requiredAddress(value, label) {
  if (!value || !ethers.isAddress(value)) throw new Error(`Set ${label} to a valid Celo address.`);
  return value;
}

function formatAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatToken(value, decimals) {
  return ethers.formatUnits(value, decimals);
}

function formatLocal(seconds) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(Number(seconds) * 1000));
}

function startOfCurrentMonthSec(now = new Date()) {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

function makeLogger(logger) {
  return {
    log: (...args) => (logger?.log || console.log)(...args),
    warn: (...args) => (logger?.warn || console.warn)(...args),
    error: (...args) => (logger?.error || console.error)(...args),
  };
}

export async function runDueSchedules({
  env = process.env,
  shouldSend = false,
  recordOnly = false,
  ownerFilter = env.SCHEDULE_OWNER || "",
  logger,
} = {}) {
  const out = makeLogger(logger);
  const ledgerAddress = requiredAddress(env.VITE_LEDGER_ADDRESS || "", "VITE_LEDGER_ADDRESS");
  const escrowAddress = env.VITE_SCHEDULE_ESCROW_ADDRESS || "";
  const owner = String(ownerFilter || "").toLowerCase();
  const rpcUrl = env.RPC_URL || env.CELO_RPC_URL || env.VITE_CELO_RPC_URL || "https://forno.celo.org";
  const keeperKey = env.KEEPER_KEY || "";

  if (shouldSend && !keeperKey) throw new Error("Set KEEPER_KEY to the current ChocoLedger keeper private key.");
  if (shouldSend && !recordOnly) requiredAddress(escrowAddress, "VITE_SCHEDULE_ESCROW_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
  const signer = shouldSend ? new ethers.Wallet(keeperKey, provider) : null;
  const ledgerReader = new ethers.Contract(ledgerAddress, LEDGER_ABI, provider);
  const ledgerWriter = signer ? ledgerReader.connect(signer) : null;
  const escrowReader = escrowAddress ? new ethers.Contract(escrowAddress, ESCROW_ABI, provider) : null;
  const escrowWriter = signer && escrowAddress ? new ethers.Contract(escrowAddress, ESCROW_ABI, signer) : null;

  // Read every schedule's CURRENT state straight from the ledger. `active`/`cancelled` already reflect
  // pauses/resumes/cancellations (the contract mutates them in place), and `lastSettlementAt` is the same
  // value the contract's own once-per-period guard uses — so "already settled this month" needs no event
  // scan. Bounded by scheduleCount; if that ever grows into the hundreds, switch these reads to Multicall3.
  async function readSchedulesFromState() {
    const total = Number(await ledgerReader.scheduleCount());
    if (total === 0) return [];
    const monthStartSec = startOfCurrentMonthSec();
    const ids = Array.from({ length: total }, (_, i) => i + 1);
    const rows = await Promise.all(ids.map(async (id) => {
      const [schedule, lastSettle] = await Promise.all([
        ledgerReader.getSchedule(id),
        ledgerReader.lastSettlementAt(id),
      ]);
      return { id, schedule, lastSettle: Number(lastSettle) };
    }));
    return rows
      .filter(({ schedule }) => schedule.owner !== ethers.ZeroAddress && (!owner || schedule.owner.toLowerCase() === owner))
      .map(({ id, schedule, lastSettle }) => ({
        id,
        owner: schedule.owner,
        recipient: schedule.recipient,
        sourceAsset: schedule.sourceAsset,
        sourceAmount: schedule.sourceAmount,
        destinationAmount: schedule.destinationAmount,
        dayOfMonth: Number(schedule.dayOfMonth),
        firstRunAt: Number(schedule.firstRunAt),
        active: schedule.active,
        cancelled: schedule.cancelled,
        // Same meaning as the old SettlementReceipt-event scan, but read from on-chain state: the
        // last settle landed at or after the start of this calendar month → already done this period.
        alreadySettledThisMonth: lastSettle >= monthStartSec,
      }));
  }

  const code = await provider.getCode(ledgerAddress);
  if (code === "0x") throw new Error(`No contract code at VITE_LEDGER_ADDRESS=${ledgerAddress}.`);

  out.log("Ledger:", ledgerAddress);
  out.log("Escrow:", escrowAddress || "(not set)");
  out.log("RPC:", rpcUrl);
  if (signer) out.log("Keeper wallet:", signer.address);

  if (shouldSend) {
    const keeper = await ledgerReader.keeper();
    if (keeper.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error(`Keeper mismatch. Ledger keeper is ${keeper}.`);
    }
  }

  const schedules = await readSchedulesFromState();
  const nowSec = Math.floor(Date.now() / 1000);
  // Testing aid: FORCE_SCHEDULE_ID settles that one plan immediately, bypassing only the time
  // window (still requires it to be funded and not already settled this month). Lets you create +
  // fund a plan and exercise the keeper in a close window without waiting for the real run time.
  const forceId = String(env.FORCE_SCHEDULE_ID || "").trim();
  const due = schedules
    .map((schedule) => ({ ...schedule, runAt: scheduleWindowForCurrentMonth(schedule) }))
    .filter((schedule) => {
      if (schedule.alreadySettledThisMonth) return false;
      if (forceId && String(schedule.id) === forceId) {
        out.log(`#${schedule.id} forced (FORCE_SCHEDULE_ID) — bypassing the run-time window.`);
        return true;
      }
      return isDueThisMonth(schedule, nowSec);
    });

  out.log(`Schedules: ${schedules.length}`);
  out.log(`Due now: ${due.length}`);

  const executed = [];
  for (const schedule of due) {
    const route = `${formatToken(schedule.sourceAmount, 6)} USDC -> ${formatToken(schedule.destinationAmount, 18)} KESm`;
    let lockStatus = "escrow not configured";
    if (escrowReader) {
      const locked = await escrowReader.lockedOf(schedule.owner, schedule.id);
      lockStatus = locked > 0n ? `funded ${formatToken(locked, 6)} USDC` : "not funded (awaiting lock)";
    }
    out.log(`#${schedule.id} ${formatAddress(schedule.owner)} -> ${formatAddress(schedule.recipient)} | ${route} | ${formatLocal(schedule.runAt)} | ${lockStatus}`);
  }

  if (!shouldSend) {
    out.log("\nDry run only. Add --send to execute due plans. Add --record-only only for manual audit testing.");
    return { ok: true, dryRun: true, schedules: schedules.length, due: due.length, executed };
  }

  for (const schedule of due) {
    let settlementRef = ethers.ZeroHash;
    let escrowTxHash = "";
    if (!recordOnly) {
      // Only funded runs settle. Unfunded plans are skipped (not reverted) so the batch — and the
      // CI job that calls it — stays green; the app prompts the owner to lock the next run.
      const locked = await escrowReader.lockedOf(schedule.owner, schedule.id);
      if (locked === 0n) {
        out.warn(`#${schedule.id} skipped: no escrow lock — owner must fund the next run.`);
        executed.push({ id: schedule.id, skipped: true, reason: "not funded" });
        continue;
      }
      out.log(`#${schedule.id} settling held run (${formatToken(locked, 6)} USDC) via gateway...`);
      // Only the scheduleId — the gateway reads recipient + destination amount from the ledger.
      // Explicit gas limit: the two swaps burn ~630k, then `_log -> ledger.logAttemptFor` runs inside a
      // try/catch. Under the EVM 63/64 rule a tight limit (~728k) starves that sub-call, so the audit
      // entry silently OOGs ("not enough gas for reentrancy sentry" — caught; settlement still succeeds)
      // and the run isn't counted. A higher limit lets logAttemptFor finish. You only pay for gas USED.
      const settleEst = await escrowWriter.settleScheduledRun.estimateGas(schedule.id).catch(() => 0n);
      const settleGas = settleEst > 0n && (settleEst * 3n) / 2n > 1_200_000n ? (settleEst * 3n) / 2n : 1_200_000n;
      const settleTx = await escrowWriter.settleScheduledRun(schedule.id, { gasLimit: settleGas });
      escrowTxHash = settleTx.hash;
      out.log(`#${schedule.id} escrow tx: ${escrowTxHash}`);
      await settleTx.wait();
      settlementRef = escrowTxHash;
    }

    out.log(`#${schedule.id} recording ledger settlement...`);
    const recordTx = await ledgerWriter.recordSettlement(
      schedule.id,
      true,
      schedule.sourceAsset,
      schedule.sourceAmount,
      schedule.destinationAmount,
      settlementRef,
      recordOnly ? "scheduled batch record-only" : "scheduled escrow settlement",
    );
    out.log(`#${schedule.id} ledger tx: ${recordTx.hash}`);
    await recordTx.wait();

    // Auto-lock next month's run from the owner's standing allowance. Best-effort: if they lack
    // funds/allowance this reverts and the app surfaces a top-up notice — the run we just settled
    // is unaffected.
    let nextLock = "skipped";
    if (!recordOnly && escrowWriter) {
      try {
        const lockTx = await escrowWriter.lockFor(schedule.owner, schedule.id, schedule.sourceAmount);
        await lockTx.wait();
        nextLock = lockTx.hash;
        out.log(`#${schedule.id} next run locked: ${lockTx.hash}`);
      } catch (err) {
        nextLock = "failed";
        out.warn(`#${schedule.id} next-run auto-lock failed (owner top-up needed): ${err.shortMessage || err.message || err}`);
      }
    }
    executed.push({ id: schedule.id, escrowTxHash, ledgerTxHash: recordTx.hash, nextLock });
  }

  return { ok: true, dryRun: false, schedules: schedules.length, due: due.length, executed };
}
