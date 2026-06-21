import { ethers } from "ethers";
import { isDueThisMonth, sameMonth, scheduleWindowForCurrentMonth } from "../src/lib/keeper-window.js";

const LEDGER_ABI = [
  "function keeper() view returns (address)",
  "function recordSettlement(uint256,bool,address,uint256,uint256,bytes32,string) external",
  "event MonthlyScheduleCreated(uint256 indexed id,address indexed owner,address indexed recipient,address settlementSpender,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,uint8 dayOfMonth,uint64 firstRunAt,uint8 maxRetries,bytes32 commandHash)",
  "event ScheduleCancelled(uint256 indexed id,address indexed by)",
  "event SchedulePaused(uint256 indexed id,address indexed by)",
  "event ScheduleResumed(uint256 indexed id,address indexed by)",
  "event SettlementReceipt(uint256 indexed id,bool success,address sourceAsset,uint256 sourceAmount,uint256 destinationAmount,bytes32 settlementRef,string note)",
];

// Settlement runs through ChocoScheduleEscrow: the owner pre-locks one run's USDC, the keeper
// settles from that lock (via the live UniV3 swap inside the escrow) and auto-locks the next run.
const ESCROW_ABI = [
  "function lockedOf(address owner,uint256 scheduleId) view returns (uint256)",
  "function settleRun(address owner,uint256 scheduleId,address recipient,uint256 ckesExactOut) external returns (uint256)",
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

function hexToNum(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return parseInt(value, 16);
  return Number(value);
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
  const deployBlock = Number(env.VITE_LEDGER_DEPLOY_BLOCK || 0);
  const owner = String(ownerFilter || "").toLowerCase();
  const rpcUrl = env.RPC_URL || env.CELO_RPC_URL || env.VITE_CELO_RPC_URL || "https://forno.celo.org";
  const explorerApi = env.VITE_BLOCK_EXPLORER_API_URL || "https://celo.blockscout.com/api";
  const keeperKey = env.KEEPER_KEY || "";
  const logChunkSize = Number(env.LOG_CHUNK_SIZE || 20000);

  if (!deployBlock) throw new Error("Set VITE_LEDGER_DEPLOY_BLOCK.");
  if (shouldSend && !keeperKey) throw new Error("Set KEEPER_KEY to the current ChocoLedger keeper private key.");
  if (shouldSend && !recordOnly) requiredAddress(escrowAddress, "VITE_SCHEDULE_ESCROW_ADDRESS");

  const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: 42220, name: "celo" });
  const signer = shouldSend ? new ethers.Wallet(keeperKey, provider) : null;
  const ledgerReader = new ethers.Contract(ledgerAddress, LEDGER_ABI, provider);
  const ledgerWriter = signer ? ledgerReader.connect(signer) : null;
  const escrowReader = escrowAddress ? new ethers.Contract(escrowAddress, ESCROW_ABI, provider) : null;
  const escrowWriter = signer && escrowAddress ? new ethers.Contract(escrowAddress, ESCROW_ABI, signer) : null;

  async function queryFilterChunked(filter, fromBlock, toBlock) {
    const logs = [];
    const from = Math.max(0, Number(fromBlock || 0));
    const to = Number(toBlock);
    for (let start = from; start <= to; start += logChunkSize + 1) {
      const end = Math.min(to, start + logChunkSize);
      logs.push(...await ledgerReader.queryFilter(filter, start, end));
      if (start + logChunkSize + 1 <= to) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return logs;
  }

  async function getEventLogsFromExplorer(eventName) {
    if (!explorerApi || !deployBlock) return null;
    try {
      const topic0 = ledgerReader.interface.getEvent(eventName).topicHash;
      const url = new URL(explorerApi);
      url.searchParams.set("module", "logs");
      url.searchParams.set("action", "getLogs");
      url.searchParams.set("address", ledgerAddress);
      url.searchParams.set("fromBlock", String(deployBlock));
      url.searchParams.set("toBlock", "latest");
      url.searchParams.set("topic0", topic0);
      url.searchParams.set("sort", "asc");

      const response = await fetch(url.toString());
      if (!response.ok) return null;
      const json = await response.json();
      if (json.status === "0") return [];
      if (!Array.isArray(json.result)) return null;

      const iface = ledgerReader.interface;
      return json.result.map((raw) => {
        try {
          const parsed = iface.parseLog({ topics: raw.topics, data: raw.data });
          if (!parsed || parsed.name !== eventName) return null;
          return {
            args: parsed.args,
            blockNumber: hexToNum(raw.blockNumber),
            index: hexToNum(raw.logIndex || 0),
            timestamp: hexToNum(raw.timeStamp || 0),
          };
        } catch {
          return null;
        }
      }).filter(Boolean);
    } catch {
      return null;
    }
  }

  async function getEventLogs(eventName, filter) {
    const explorerLogs = await getEventLogsFromExplorer(eventName);
    if (explorerLogs !== null) {
      out.log(`  ${eventName}: ${explorerLogs.length} (Blockscout)`);
      return explorerLogs;
    }
    out.log(`  ${eventName}: Blockscout unavailable, falling back to RPC chunks`);
    const latest = await provider.getBlockNumber();
    const rpcLogs = await queryFilterChunked(filter, deployBlock, latest);
    return rpcLogs.map((log) => ({ args: log.args, blockNumber: log.blockNumber, index: log.index ?? 0, timestamp: 0 }));
  }

  async function currentMonthSettlementIds() {
    const now = new Date();
    const monthStartSec = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
    const explorerLogs = await getEventLogsFromExplorer("SettlementReceipt");
    if (explorerLogs !== null) {
      const settled = new Set();
      for (const log of explorerLogs) {
        if (log.timestamp >= monthStartSec) settled.add(String(log.args.id));
      }
      return settled;
    }

    const latest = await provider.getBlockNumber();
    const secondsSinceMonthStart = Math.floor(Date.now() / 1000) - monthStartSec;
    const celoBlockTime = 2;
    const bufferBlocks = 7200;
    const monthStartBlock = Math.max(deployBlock, latest - Math.ceil(secondsSinceMonthStart / celoBlockTime) - bufferBlocks);
    const rpcLogs = await queryFilterChunked(ledgerReader.filters.SettlementReceipt(), monthStartBlock, latest);
    const blockCache = new Map();
    const settled = new Set();
    for (const log of rpcLogs) {
      if (!blockCache.has(log.blockNumber)) blockCache.set(log.blockNumber, await provider.getBlock(log.blockNumber));
      const block = blockCache.get(log.blockNumber);
      if (block && sameMonth(new Date(Number(block.timestamp) * 1000), now)) settled.add(String(log.args.id));
    }
    return settled;
  }

  async function readSchedules() {
    const createdLogs = await getEventLogs("MonthlyScheduleCreated", ledgerReader.filters.MonthlyScheduleCreated());
    const cancelledLogs = await getEventLogs("ScheduleCancelled", ledgerReader.filters.ScheduleCancelled());
    const pausedLogs = await getEventLogs("SchedulePaused", ledgerReader.filters.SchedulePaused());
    const resumedLogs = await getEventLogs("ScheduleResumed", ledgerReader.filters.ScheduleResumed());

    const cancelledIds = new Set(cancelledLogs.map((log) => String(log.args.id)));
    const pauseState = new Map();
    [...pausedLogs.map((log) => ({ log, active: false })), ...resumedLogs.map((log) => ({ log, active: true }))]
      .sort((a, b) => a.log.blockNumber - b.log.blockNumber || Number(a.log.index ?? 0) - Number(b.log.index ?? 0))
      .forEach(({ log, active }) => pauseState.set(String(log.args.id), active));

    return createdLogs
      .filter((log) => !owner || log.args.owner.toLowerCase() === owner)
      .map((log) => {
        const a = log.args;
        const id = String(a.id);
        const cancelled = cancelledIds.has(id);
        const active = cancelled ? false : (pauseState.get(id) ?? true);
        return {
          id: Number(a.id),
          owner: a.owner,
          recipient: a.recipient,
          settlementSpender: a.settlementSpender,
          sourceAsset: a.sourceAsset,
          sourceAmount: a.sourceAmount,
          destinationAmount: a.destinationAmount,
          dayOfMonth: Number(a.dayOfMonth),
          maxRetries: Number(a.maxRetries),
          firstRunAt: Number(a.firstRunAt),
          active,
          cancelled,
        };
      });
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

  const [schedules, settledIds] = await Promise.all([readSchedules(), currentMonthSettlementIds()]);
  const nowSec = Math.floor(Date.now() / 1000);
  // Testing aid: FORCE_SCHEDULE_ID settles that one plan immediately, bypassing only the time
  // window (still requires it to be funded and not already settled this month). Lets you create +
  // fund a plan and exercise the keeper in a close window without waiting for the real run time.
  const forceId = String(env.FORCE_SCHEDULE_ID || "").trim();
  const due = schedules
    .map((schedule) => ({
      ...schedule,
      runAt: scheduleWindowForCurrentMonth(schedule),
      alreadySettled: settledIds.has(String(schedule.id)),
    }))
    .filter((schedule) => {
      if (schedule.alreadySettled) return false;
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
      out.log(`#${schedule.id} settling from escrow lock (${formatToken(locked, 6)} USDC)...`);
      const settleTx = await escrowWriter.settleRun(
        schedule.owner,
        schedule.id,
        schedule.recipient,
        schedule.destinationAmount,
      );
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
