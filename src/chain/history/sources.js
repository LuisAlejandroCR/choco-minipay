// Low-level history data sources: RPC chunked log scans, Etherscan-compatible explorer queries,
// receipt decoding, and the small shared helpers. Kept dependency-light so both the send-now and
// schedule readers (and the orchestrator in ../history.js) can import from one place.
import { decodeEventLog, toEventHash } from "viem";
import { APP_CONFIG } from "../../lib/app-config.js";
import { ATTEMPT_EVENT_ABI, ESCROW_EVENTS_ABI, REGISTRY_EVENTS_ABI } from "../abis.js";
import { uniqueAddresses } from "../history-mappers.js";

export const LOG_CHUNK_SIZE = 900n; // forno rejects ranges >~1000 blocks
export const EXPLORER_TX_OFFSET = 10000;
export const OPTIONAL_RPC_TIMEOUT_MS = 4500;
export const SELECTORS = {
  createSchedule: "0x09b549a3",
  cancelSchedule: "0x237fc2a6",
  pauseSchedule: "0xd2c9f4a0",
  resumeSchedule: "0x635c1c6c",
  recordSettlement: "0xa74c3b74",
  recordSettlementLegacy: "0xebc97f9d",
  swapAndSend: "0x28b16ca8",
  swapAndSendExact: "0x47f703ee",
};

export function getSwapAddresses() {
  return uniqueAddresses([
    ...(APP_CONFIG.contracts.ckesSwapAddresses || []),
    APP_CONFIG.contracts.ckesSwap,
  ]);
}

// Sequential for-loop — one chunk at a time per event type.
// Running N of these in parallel = N concurrent forno requests (safe).
export async function getContractEventsChunked(publicClient, params) {
  const latest = params.toBlock && params.toBlock !== "latest"
    ? BigInt(params.toBlock)
    : await publicClient.getBlockNumber();
  const first = params.fromBlock ? BigInt(params.fromBlock) : 0n;
  if (first > latest) return [];

  const logs = [];
  for (let from = first; from <= latest; from += LOG_CHUNK_SIZE + 1n) {
    const to = from + LOG_CHUNK_SIZE > latest ? latest : from + LOG_CHUNK_SIZE;
    logs.push(...await publicClient.getContractEvents({
      ...params,
      fromBlock: from,
      toBlock: to,
    }));
  }
  return logs;
}

function hexToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.startsWith("0x")) return BigInt(value);
  return BigInt(Number(value || 0));
}

function hexToNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return parseInt(value, 16);
  return Number(value || 0);
}

// Look up an event ABI across the registry + attempt-log ABIs, so the explorer-log path can decode
// AttemptLogged (the canonical send-now record) as well as the schedule events.
function eventAbiByName(eventName) {
  return [...REGISTRY_EVENTS_ABI, ...ATTEMPT_EVENT_ABI, ...ESCROW_EVENTS_ABI]
    .find((item) => item.type === "event" && item.name === eventName);
}

// senderWallet is the 2nd indexed param of AttemptLogged → topic2. Left-pad the address to 32 bytes.
export function ownerTopic(owner) {
  return `0x${String(owner).slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function fetchExplorerLogs(contractAddress, fromBlock, eventName, indexedTopics = null) {
  if (!APP_CONFIG.network.explorerApiUrl) return null;
  const eventAbi = eventAbiByName(eventName);
  if (!eventAbi) return null;

  try {
    const url = new URL(APP_CONFIG.network.explorerApiUrl);
    url.searchParams.set("module", "logs");
    url.searchParams.set("action", "getLogs");
    url.searchParams.set("address", contractAddress);
    url.searchParams.set("fromBlock", String(fromBlock || 0n));
    url.searchParams.set("toBlock", "latest");
    url.searchParams.set("topic0", toEventHash(eventAbi));
    // Optional indexed-topic filter, e.g. { topic2: ownerTopic } to fetch only this owner's
    // AttemptLogged server-side instead of pulling every user's and filtering in JS.
    if (indexedTopics) {
      for (const [topic, value] of Object.entries(indexedTopics)) {
        url.searchParams.set(topic, value);
        url.searchParams.set(`topic0_${topic.slice(-1)}_opr`, "and");
      }
    }
    url.searchParams.set("sort", "asc");
    if (APP_CONFIG.network.explorerApiKey) {
      url.searchParams.set("apikey", APP_CONFIG.network.explorerApiKey);
    }

    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    if (json.status === "0") return [];
    if (!Array.isArray(json.result)) return null;

    return json.result.map((raw) => {
      try {
        const decoded = decodeEventLog({
          abi: [eventAbi],
          data: raw.data,
          topics: raw.topics,
          strict: false,
        });
        if (decoded.eventName !== eventName) return null;
        return {
          address: contractAddress,
          transactionHash: raw.transactionHash,
          blockNumber: hexToBigInt(raw.blockNumber),
          logIndex: hexToNumber(raw.logIndex || 0),
          timeStamp: hexToNumber(raw.timeStamp || 0), // explorers return the block time per log
          args: decoded.args,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return null;
  }
}

export function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

export function txSelector(tx) {
  return String(tx?.input || "").slice(0, 10).toLowerCase();
}

export function isSuccessfulTx(tx) {
  return String(tx?.isError || "0") !== "1";
}

export async function fetchExplorerTransactions(address, fromBlock) {
  if (!APP_CONFIG.network.explorerApiUrl || typeof fetch !== "function") return [];

  const url = new URL(APP_CONFIG.network.explorerApiUrl);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("startblock", String(fromBlock || 0n));
  url.searchParams.set("endblock", "latest");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(EXPLORER_TX_OFFSET));
  if (APP_CONFIG.network.explorerApiKey) {
    url.searchParams.set("apikey", APP_CONFIG.network.explorerApiKey);
  }

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Explorer API ${response.status}`);

  const json = await response.json();
  if (json.status === "0" && /no transactions/i.test(String(json.message || json.result || ""))) return [];
  if (!Array.isArray(json.result)) throw new Error("Explorer API returned no transaction list");
  return json.result;
}

export function uniqueExplorerTransactions(txs = []) {
  const seen = new Set();
  return txs.filter((tx) => {
    const key = String(tx?.hash || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function readReceipts(publicClient, txs) {
  return Promise.all(
    txs.map((tx) => publicClient.getTransactionReceipt({ hash: tx.hash })),
  );
}

export async function withTimeout(promise, fallback, ms = OPTIONAL_RPC_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function decodeReceiptEvents(receipt, contractAddress, abi, eventName) {
  return receipt.logs
    .filter((log) => sameAddress(log.address, contractAddress))
    .map((log) => {
      try {
        const decoded = decodeEventLog({
          abi,
          data: log.data,
          topics: log.topics,
          strict: false,
        });
        if (decoded.eventName !== eventName) return null;
        return { ...log, eventName: decoded.eventName, args: decoded.args };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
