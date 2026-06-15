import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { celo } from "viem/chains";
import { APP_CONFIG, STABLECOINS } from "./app-config.js";

export const CELO_MAINNET = {
  chainId: APP_CONFIG.network.chainId,
  chainIdHex: APP_CONFIG.network.chainIdHex,
  rpcUrl: APP_CONFIG.network.rpcUrl,
  txExplorer: `${APP_CONFIG.network.explorerTxUrl.replace(/\/$/, "")}/`,
};

const MENTO = APP_CONFIG.mento;

export const ADDRESSES = {
  registry: APP_CONFIG.contracts.registry,
  settlementSpender: APP_CONFIG.contracts.settlementSpender,
  demoRecipient: APP_CONFIG.recipients.demoRecipientAddress,
  usdc: APP_CONFIG.assets.usdc,
  usdm: APP_CONFIG.assets.usdm,
  kesm: APP_CONFIG.assets.kesm,
  feeCurrency: APP_CONFIG.assets.feeCurrency,
  mentoBroker: MENTO.broker,
  mentoProvider: MENTO.exchangeProvider,
};

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
];

// Mento V2 Broker — the only swap surface Choco touches. No custom router contract.
// Mainnet has no direct USDC/cKES pool, so USDC settles in two oracle-priced hops: USDC -> USDm -> cKES.
export const MENTO_BROKER_ABI = [
  {
    type: "function",
    name: "getAmountOut",
    stateMutability: "view",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "swapIn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exchangeProvider", type: "address" },
      { name: "exchangeId", type: "bytes32" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "createMonthlySchedule",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "settlementSpender", type: "address" },
      { name: "sourceAsset", type: "address" },
      { name: "sourceAmount", type: "uint256" },
      { name: "destinationAmount", type: "uint256" },
      { name: "dayOfMonth", type: "uint8" },
      { name: "firstRunAt", type: "uint64" },
      { name: "commandHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "cancelSchedule",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
];

// Event ABI used to rebuild plans and history straight from chain state — nothing is stored off-chain.
export const REGISTRY_EVENTS_ABI = [
  {
    type: "event",
    name: "MonthlyScheduleCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "settlementSpender", type: "address", indexed: false },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "destinationAmount", type: "uint256", indexed: false },
      { name: "dayOfMonth", type: "uint8", indexed: false },
      { name: "firstRunAt", type: "uint64", indexed: false },
      { name: "maxRetries", type: "uint8", indexed: false },
      { name: "commandHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ScheduleCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "SettlementReceipt",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "success", type: "bool", indexed: false },
      { name: "sourceAsset", type: "address", indexed: false },
      { name: "sourceAmount", type: "uint256", indexed: false },
      { name: "destinationAmount", type: "uint256", indexed: false },
      { name: "settlementRef", type: "bytes32", indexed: false },
      { name: "note", type: "string", indexed: false },
    ],
  },
];

export function isMiniPay() {
  return typeof window !== "undefined" && window.ethereum?.isMiniPay === true;
}

export function shortAddress(address) {
  if (!address || !isAddress(address)) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function assertAddress(address, label) {
  if (!isAddress(address) || address === zeroAddress) throw new Error(`${label} is not a valid Celo address.`);
  return address;
}

export function makePublicClient() {
  return createPublicClient({ chain: celo, transport: http(CELO_MAINNET.rpcUrl) });
}

export function makeWalletClient(account) {
  return createWalletClient({ account, chain: celo, transport: custom(window.ethereum) });
}

export async function connectInjectedWallet() {
  if (!window.ethereum) throw new Error("Open Choco in MiniPay or a Celo wallet browser.");
  const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
  const chainId = await window.ethereum.request({ method: "eth_chainId" });

  if (String(chainId).toLowerCase() !== CELO_MAINNET.chainIdHex.toLowerCase()) {
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CELO_MAINNET.chainIdHex }] });
    } catch {
      throw new Error("Switch your wallet to Celo Mainnet before continuing.");
    }
  }

  return account;
}

async function readErc20Balance(publicClient, token, account) {
  return publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
}

export async function readUsdcBalance(account) {
  assertAddress(account, "Wallet");
  const publicClient = makePublicClient();
  return publicClient.readContract({
    address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [account],
  });
}

export async function readStablecoinBalances(account) {
  assertAddress(account, "Wallet");
  const publicClient = makePublicClient();

  const values = await Promise.all(STABLECOINS.map((token) => (
    token.native
      ? publicClient.getBalance({ address: account })
      : publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      })
  )));

  return STABLECOINS.map((token, index) => ({
    ...token,
    raw: values[index],
    formatted: Number(formatUnits(values[index], token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 4 }),
  }));
}

function usdcAmountForIntent(intent) {
  return parseUnits(Number(intent.sourceAmount || intent.estimatedUsdc).toFixed(6), 6);
}

function sourceAmountForIntent(intent) {
  const decimals = intent.sourceAsset === APP_CONFIG.assets.source ? 6 : 18;
  const amount = intent.sourceAsset === APP_CONFIG.assets.source
    ? Number(intent.sourceAmount || intent.estimatedUsdc).toFixed(6)
    : String(intent.amountKes);
  return parseUnits(amount, decimals);
}

function sourceAssetAddressForIntent(intent) {
  return intent.sourceAsset === APP_CONFIG.assets.source ? ADDRESSES.usdc : ADDRESSES.kesm;
}

function destinationAmountForIntent(intent) {
  return parseUnits(String(Math.max(1, Math.floor(Number(intent.destinationAmount || intent.amountKes)))), 18);
}

async function approveTokenIfNeeded({ account, tokenAddress, spender, amount }) {
  assertAddress(tokenAddress, "Source asset");
  assertAddress(spender, "Settlement spender");
  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account, spender],
  });

  if (allowance >= amount) return null;

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Send now. cKES transfers go wallet -> recipient directly. USDC routes USDC -> USDm -> cKES through
// the Mento Broker (each hop signed by the wallet), then the received cKES is delivered to the recipient.
export async function sendNow({ account, recipient, intent }) {
  assertAddress(account, "Wallet");
  assertAddress(recipient, "Recipient");
  assertAddress(ADDRESSES.feeCurrency, "VITE_FEE_CURRENCY_ADDRESS");

  const publicClient = makePublicClient();
  const walletClient = makeWalletClient(account);

  if (intent.sourceAsset === APP_CONFIG.assets.destination) {
    const hash = await walletClient.writeContract({
      address: ADDRESSES.kesm,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, sourceAmountForIntent(intent)],
      feeCurrency: ADDRESSES.feeCurrency,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { approveHash: null, hash };
  }

  assertAddress(ADDRESSES.mentoBroker, "VITE_MENTO_BROKER_ADDRESS");
  assertAddress(ADDRESSES.mentoProvider, "VITE_MENTO_BIPOOL_ADDRESS");
  const usdcAmount = usdcAmountForIntent(intent);

  // Hop 1: USDC -> USDm
  const usdmQuote = await publicClient.readContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, MENTO.usdcToUsdm, ADDRESSES.usdc, ADDRESSES.usdm, usdcAmount],
  });
  const approveHash = await approveTokenIfNeeded({ account, tokenAddress: ADDRESSES.usdc, spender: ADDRESSES.mentoBroker, amount: usdcAmount });
  const usdmBefore = await readErc20Balance(publicClient, ADDRESSES.usdm, account);
  const swap1Hash = await walletClient.writeContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "swapIn",
    args: [ADDRESSES.mentoProvider, MENTO.usdcToUsdm, ADDRESSES.usdc, ADDRESSES.usdm, usdcAmount, (usdmQuote * 985n) / 1000n],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash: swap1Hash });
  const usdmAfter = await readErc20Balance(publicClient, ADDRESSES.usdm, account);
  const usdmReceived = usdmAfter > usdmBefore ? usdmAfter - usdmBefore : usdmQuote;

  // Hop 2: USDm -> cKES
  const ckesQuote = await publicClient.readContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "getAmountOut",
    args: [ADDRESSES.mentoProvider, MENTO.usdmToCkes, ADDRESSES.usdm, ADDRESSES.kesm, usdmReceived],
  });
  await approveTokenIfNeeded({ account, tokenAddress: ADDRESSES.usdm, spender: ADDRESSES.mentoBroker, amount: usdmReceived });
  const ckesBefore = await readErc20Balance(publicClient, ADDRESSES.kesm, account);
  const swap2Hash = await walletClient.writeContract({
    address: ADDRESSES.mentoBroker,
    abi: MENTO_BROKER_ABI,
    functionName: "swapIn",
    args: [ADDRESSES.mentoProvider, MENTO.usdmToCkes, ADDRESSES.usdm, ADDRESSES.kesm, usdmReceived, (ckesQuote * 985n) / 1000n],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash: swap2Hash });
  const ckesAfter = await readErc20Balance(publicClient, ADDRESSES.kesm, account);
  const ckesReceived = ckesAfter > ckesBefore ? ckesAfter - ckesBefore : ckesQuote;

  // Deliver the received cKES to the recipient.
  const hash = await walletClient.writeContract({
    address: ADDRESSES.kesm,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, ckesReceived],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, swap1Hash, swap2Hash, hash, ckesReceived };
  
}

export async function createScheduleViaRegistry({ account, recipient, intent }) {
  assertAddress(account, "Wallet");
  assertAddress(recipient, "Recipient");
  assertAddress(ADDRESSES.registry, "VITE_REGISTRY_ADDRESS");
  assertAddress(ADDRESSES.settlementSpender, "VITE_SETTLEMENT_SPENDER_ADDRESS");
  assertAddress(ADDRESSES.feeCurrency, "VITE_FEE_CURRENCY_ADDRESS");

  const amount = sourceAmountForIntent(intent);
  const sourceAsset = sourceAssetAddressForIntent(intent);
  assertAddress(sourceAsset, "Source asset");
  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const approveHash = await approveTokenIfNeeded({ account, tokenAddress: sourceAsset, spender: ADDRESSES.settlementSpender, amount });

  const hash = await walletClient.writeContract({
    address: ADDRESSES.registry,
    abi: REGISTRY_ABI,
    functionName: "createMonthlySchedule",
    args: [
      recipient,
      ADDRESSES.settlementSpender,
      sourceAsset,
      amount,
      destinationAmountForIntent(intent),
      intent.dayOfMonth,
      BigInt(intent.firstRunAt),
      keccak256(toHex(intent.rawCommand)),
    ],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { approveHash, hash };
}

export async function cancelScheduleViaRegistry({ account, id }) {
  assertAddress(account, "Wallet");
  assertAddress(ADDRESSES.registry, "VITE_REGISTRY_ADDRESS");
  if (id === undefined || id === null || id === "") throw new Error("Missing on-chain schedule id.");

  const walletClient = makeWalletClient(account);
  const publicClient = makePublicClient();
  const hash = await walletClient.writeContract({
    address: ADDRESSES.registry,
    abi: REGISTRY_ABI,
    functionName: "cancelSchedule",
    args: [BigInt(id)],
    feeCurrency: ADDRESSES.feeCurrency,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { hash };
}

function formatDay(day) {
  const value = Number(day);
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function scheduleTimeLabel() {
  const hour = APP_CONFIG.transfer.defaultScheduleHour;
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

function formatChainDate(seconds) {
  if (!seconds) return "Pending";
  const date = new Date(Number(seconds) * 1000);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formatted.replace(",", "")} Local`;
}

function isCkesAsset(address) {
  return String(address).toLowerCase() === String(ADDRESSES.kesm).toLowerCase();
}

function mapScheduleToPlan(log) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `schedule-${a.id}`,
    onchainId: Number(a.id),
    recipient: shortAddress(a.recipient),
    recipientAddress: a.recipient,
    amount: amountKes.toLocaleString("en-US"),
    amountMinor: amountKes,
    amountKes,
    asset: APP_CONFIG.assets.destination,
    payAsset: isCkesAsset(a.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    corridor: APP_CONFIG.transfer.corridor,
    schedule: `Every ${formatDay(a.dayOfMonth)} - ${scheduleTimeLabel()}`,
    dayLabel: formatDay(a.dayOfMonth),
    nextDate: formatDay(a.dayOfMonth),
    fee: APP_CONFIG.transfer.networkFeeLabel,
    routeEstimate: "",
    hash: log.transactionHash,
    status: "Active",
    deliveryMode: "schedule",
  };
}

function mapScheduleToMovement(log, timestamp) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `tx-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: shortAddress(a.recipient),
    amount: amountKes.toLocaleString("en-US"),
    asset: APP_CONFIG.assets.destination,
    payAsset: isCkesAsset(a.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    schedule: `Every ${formatDay(a.dayOfMonth)} - ${scheduleTimeLabel()}`,
    date: formatChainDate(timestamp),
    status: "Scheduled",
    hash: log.transactionHash,
    type: "Plan confirmed",
    deliveryMode: "schedule",
    from: a.owner,
    to: `${shortAddress(a.recipient)} - Celo`,
    toAddress: a.recipient,
    routeEstimate: "",
    sortKey: timestamp || 0,
  };
}

function mapSettlementToMovement(log, schedule, timestamp) {
  const a = log.args;
  const amountKes = Math.round(Number(formatUnits(a.destinationAmount, 18)));
  return {
    id: `settle-${log.transactionHash}-${log.logIndex}`,
    planId: `schedule-${a.id}`,
    recipient: schedule ? shortAddress(schedule.recipient) : "Recipient",
    amount: amountKes.toLocaleString("en-US"),
    asset: APP_CONFIG.assets.destination,
    payAsset: schedule && isCkesAsset(schedule.sourceAsset) ? APP_CONFIG.assets.destination : APP_CONFIG.assets.source,
    schedule: schedule ? `Every ${formatDay(schedule.dayOfMonth)} - ${scheduleTimeLabel()}` : "Scheduled",
    date: formatChainDate(timestamp),
    status: a.success ? "Sent" : "Failed",
    hash: log.transactionHash,
    type: a.success ? "Settlement sent" : "Settlement failed",
    deliveryMode: "schedule",
    from: schedule ? schedule.owner : "",
    to: schedule ? `${shortAddress(schedule.recipient)} - Celo` : "Recipient",
    toAddress: schedule ? schedule.recipient : "",
    routeEstimate: "",
    sortKey: timestamp || 0,
  };
}

// cKES ERC20 Transfer events + ChocoCkesSwap UsdcToCkesSwap events feed the send-now history.
// We treat each (txHash, logIndex) as a unique movement; swaps that immediately re-transfer cKES
// to a recipient produce two events in the same tx and are correlated by txHash.
const TRANSFER_EVENT_ABI = [
  { type: "event", name: "Transfer", inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ] },
];

const SWAP_EVENT_ABI = [
  { type: "event", name: "UsdcToCkesSwap", inputs: [
    { name: "payer", type: "address", indexed: true },
    { name: "usdcIn", type: "uint256", indexed: false },
    { name: "usdmMid", type: "uint256", indexed: false },
    { name: "ckesOut", type: "uint256", indexed: false },
    { name: "ckesMinOut", type: "uint256", indexed: false },
  ] },
];

async function readSendNowHistory(publicClient, owner, fromBlock) {
  const ckesAddress = ADDRESSES.kesm;
  const swapAddress = APP_CONFIG.contracts.ckesSwap;

  const transfers = await publicClient.getContractEvents({
    address: ckesAddress,
    abi: TRANSFER_EVENT_ABI,
    eventName: "Transfer",
    args: { from: owner },
    fromBlock,
    toBlock: "latest",
  });

  let swaps = [];
  if (swapAddress && isAddress(swapAddress)) {
    swaps = await publicClient.getContractEvents({
      address: swapAddress,
      abi: SWAP_EVENT_ABI,
      eventName: "UsdcToCkesSwap",
      args: { payer: owner },
      fromBlock,
      toBlock: "latest",
    });
  }

  const swapByTx = new Map(swaps.map((log) => [log.transactionHash, log]));
  // Drop self-transfers and the wrapper's internal transfer-to-payer leg of a swap. The "outgoing"
  // entries are the cKES -> recipient deliveries that follow a swap or are direct cKES sends.
  const movements = transfers
    .filter((log) => String(log.args.to).toLowerCase() !== String(owner).toLowerCase())
    .filter((log) => !(swapAddress && String(log.args.from).toLowerCase() === String(swapAddress).toLowerCase()))
    .map((log) => ({ transferLog: log, swapLog: swapByTx.get(log.transactionHash) || null }));

  const blockNumbers = [...new Set(movements.map((entry) => entry.transferLog.blockNumber))];
  const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

  return movements.map(({ transferLog, swapLog }) => {
    const amountKes = Math.round(Number(formatUnits(transferLog.args.value, 18)));
    const usdcIn = swapLog ? Number(formatUnits(swapLog.args.usdcIn, 6)) : 0;
    const timestamp = timeByBlock.get(transferLog.blockNumber);
    return {
      id: `send-${transferLog.transactionHash}-${transferLog.logIndex}`,
      planId: "send-now",
      recipient: shortAddress(transferLog.args.to),
      recipientAddress: transferLog.args.to,
      amount: amountKes.toLocaleString("en-US"),
      amountMinor: amountKes,
      asset: APP_CONFIG.assets.destination,
      payAsset: swapLog ? APP_CONFIG.assets.source : APP_CONFIG.assets.destination,
      payAmount: swapLog ? usdcIn : amountKes,
      schedule: "Send once now",
      date: formatChainDate(timestamp),
      status: "Sent",
      hash: transferLog.transactionHash,
      type: swapLog ? "USDC swap + cKES send" : "cKES send",
      deliveryMode: "now",
      from: transferLog.args.from,
      to: `${shortAddress(transferLog.args.to)} - Celo`,
      toAddress: transferLog.args.to,
      routeEstimate: swapLog ? `${usdcIn} USDC -> ${amountKes} cKES via Mento` : "",
      sortKey: timestamp || 0,
    };
  });
}

// Rebuild the owner's plans and movement history from registry events. Returns empty lists
// (no error) until the registry address is configured, so the UI degrades cleanly pre-deploy.
export async function readOwnerLedger(owner) {
  if (!owner || !isAddress(owner)) return { plans: [], history: [] };

  const publicClient = makePublicClient();
  const fromBlock = APP_CONFIG.contracts.registryDeployBlock ? BigInt(APP_CONFIG.contracts.registryDeployBlock) : 0n;

  // Send-now history is always read (cKES Transfers + Swap events). Schedule data only when the
  // registry is deployed, so the UI still has History for send-now transactions pre-registry.
  let sendNowHistory = [];
  try {
    sendNowHistory = await readSendNowHistory(publicClient, owner, fromBlock);
  } catch (sendNowError) {
    sendNowHistory = [];
  }

  if (!ADDRESSES.registry || !isAddress(ADDRESSES.registry)) {
    return { plans: [], history: sendNowHistory.sort((a, b) => b.sortKey - a.sortKey) };
  }

  try {
    const created = await publicClient.getContractEvents({
      address: ADDRESSES.registry,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "MonthlyScheduleCreated",
      args: { owner },
      fromBlock,
      toBlock: "latest",
    });
    const cancelled = await publicClient.getContractEvents({
      address: ADDRESSES.registry,
      abi: REGISTRY_EVENTS_ABI,
      eventName: "ScheduleCancelled",
      fromBlock,
      toBlock: "latest",
    });
    const ids = created.map((log) => log.args.id);
    const settlements = ids.length
      ? await publicClient.getContractEvents({
        address: ADDRESSES.registry,
        abi: REGISTRY_EVENTS_ABI,
        eventName: "SettlementReceipt",
        args: { id: ids },
        fromBlock,
        toBlock: "latest",
      })
      : [];

    const blockNumbers = [...new Set([...created, ...settlements].map((log) => log.blockNumber))];
    const blocks = await Promise.all(blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber })));
    const timeByBlock = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]));

    const cancelledIds = new Set(cancelled.map((log) => String(log.args.id)));
    const scheduleById = new Map(created.map((log) => [String(log.args.id), log.args]));

    const plans = created
      .filter((log) => !cancelledIds.has(String(log.args.id)))
      .map(mapScheduleToPlan);

    const history = [
      ...sendNowHistory,
      ...created.map((log) => mapScheduleToMovement(log, timeByBlock.get(log.blockNumber))),
      ...settlements.map((log) => mapSettlementToMovement(log, scheduleById.get(String(log.args.id)), timeByBlock.get(log.blockNumber))),
    ].sort((a, b) => b.sortKey - a.sortKey);

    return { plans, history };
  } catch (error) {
    return { plans: [], history: sendNowHistory, error: `Could not read on-chain ledger: ${error.shortMessage || error.message}` };
  }
}
