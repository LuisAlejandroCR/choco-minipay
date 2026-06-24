const env = import.meta.env || {};
const configuredChainId = Number(env.VITE_CELO_CHAIN_ID || 42220);

function parseAddressList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanMainnetLabel(value, fallback) {
  const label = String(value || fallback);
  return configuredChainId === 42220 ? label.replace(/\s*testnet\s*/gi, " ").replace(/\s+/g, " ").trim() : label;
}

function parseScheduleTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

const defaultScheduleTime = parseScheduleTime(env.VITE_DEFAULT_SCHEDULE_TIME || env.VITE_DEFAULT_SCHEDULE_HOUR);

export const APP_CONFIG = {
  appName: "Choco",
  network: {
    name: cleanMainnetLabel(env.VITE_CELO_NETWORK_NAME, "Celo"),
    label: cleanMainnetLabel(env.VITE_CELO_NETWORK_LABEL, "Celo Mainnet"),
    badge: cleanMainnetLabel(env.VITE_CELO_NETWORK_BADGE, "Mainnet"),
    chainId: configuredChainId,
    chainIdHex: env.VITE_CELO_CHAIN_ID_HEX || "0xa4ec",
    rpcUrl: env.VITE_CELO_RPC_URL || "https://forno.celo.org",
    explorerUrl: env.VITE_BLOCK_EXPLORER_URL || "https://celoscan.io",
    explorerTxUrl: env.VITE_BLOCK_EXPLORER_TX_URL || "https://celoscan.io/tx",
    explorerApiUrl: env.VITE_BLOCK_EXPLORER_API_URL || "https://celo.blockscout.com/api",
    explorerApiKey: env.VITE_CELOSCAN_API_KEY || "",
  },
  assets: {
    source: env.VITE_SOURCE_ASSET || "USDC",
    destination: env.VITE_DESTINATION_ASSET || "KESm",
    bridge: env.VITE_BRIDGE_ASSET || "USDm",
    usdc: env.VITE_USDC_ADDRESS || "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    usdm: env.VITE_USDM_ADDRESS || "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    kesm: env.VITE_KESM_ADDRESS || "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",
    feeCurrency: env.VITE_FEE_CURRENCY_ADDRESS || "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  },
  contracts: {
    ledger: env.VITE_LEDGER_ADDRESS || "",
    ledgerDeployBlock: env.VITE_LEDGER_DEPLOY_BLOCK || "",
    registry: env.VITE_REGISTRY_ADDRESS || "",
    settlementSpender: env.VITE_SETTLEMENT_SPENDER_ADDRESS || "",
    registryDeployBlock: env.VITE_REGISTRY_DEPLOY_BLOCK || "",
    audit: env.VITE_AUDIT_CONTRACT_ADDRESS || "",
    ckesSwap: env.VITE_CKES_SWAP_CONTRACT_ADDRESS || "",
    ckesSwapUniV3: env.VITE_CKES_SWAP_UNIV3_ADDRESS || "",
    // The escrow IS the gateway (one ChocoGateway holds funds + settles). Fall back to the swap
    // contract address so scheduled plans hold funds whenever the gateway is configured, even if
    // VITE_SCHEDULE_ESCROW_ADDRESS wasn't set separately (e.g. missing on Vercel).
    scheduleEscrow: env.VITE_SCHEDULE_ESCROW_ADDRESS || env.VITE_CKES_SWAP_CONTRACT_ADDRESS || "",
    ckesSwapDeployBlock: env.VITE_CKES_SWAP_DEPLOY_BLOCK || "",
    ckesSwapAddresses: parseAddressList(env.VITE_CKES_SWAP_CONTRACT_ADDRESSES || env.VITE_CKES_SWAP_CONTRACT_ADDRESS),
  },
  mento: {
    broker: env.VITE_MENTO_BROKER_ADDRESS || "0x777A8255cA72412f0d706dc03C9D1987306B4CaD",
    exchangeProvider: env.VITE_MENTO_BIPOOL_ADDRESS || "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901",
    usdcToUsdm: env.VITE_MENTO_USDC_USDM_ID || "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7",
    usdmToCkes: env.VITE_MENTO_USDM_CKES_ID || "0x89de88b8eb790de26f4649f543cb6893d93635c728ac857f0926e842fb0d298b",
  },
  agent: {
    registry: env.VITE_AGENT_REGISTRY_ADDRESS || "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    agentId: env.VITE_AGENT_ID || "",
    owner: env.VITE_AGENT_OWNER_ADDRESS || "",
    agentUri: env.VITE_AGENT_URI || "https://usechoco.app/agent.json",
    explorerUrl: env.VITE_AGENT_EXPLORER_URL || "https://8004scan.io/agents/celo",
  },
  recipients: {
    demoRecipientAddress: env.VITE_DEMO_RECIPIENT_ADDRESS || "",
    defaultLabel: env.VITE_DEFAULT_RECIPIENT_LABEL || "recipient",
  },
  transfer: {
    corridor: env.VITE_CORRIDOR_LABEL || "US to Kenya",
    destinationCountry: env.VITE_DESTINATION_COUNTRY || "Kenya",
    kesPerUsdc: Number(env.VITE_KES_PER_USDC || 129.39),
    exactOutputBufferBps: Number(env.VITE_EXACT_OUTPUT_BUFFER_BPS || 200),
    minExactOutputBufferUsdc: Number(env.VITE_MIN_EXACT_OUTPUT_BUFFER_USDC || 0.001),
    defaultScheduleHour: defaultScheduleTime?.hour ?? 4,
    defaultScheduleMinute: defaultScheduleTime?.minute ?? Number(env.VITE_DEFAULT_SCHEDULE_MINUTE || 0),
    minimumConfidence: Number(env.VITE_AGENT_MIN_CONFIDENCE || 0.75),
    networkFeeLabel: env.VITE_NETWORK_FEE_LABEL || "Network fee",
    retryPolicy: env.VITE_RETRY_POLICY || "3 attempts",
  },
  ui: {
    initialScreen: ["splash", "pitch", "plan"].includes(env.VITE_INITIAL_SCREEN) ? env.VITE_INITIAL_SCREEN : "splash",
    liveDemoUrl: env.VITE_LIVE_DEMO_URL || "/demo.html",
    showDemoPrompt: env.VITE_SHOW_DEMO_PROMPT !== "false",
    worldMapUrl: env.VITE_WORLD_MAP_URL || "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg",
  },
};

export const STABLECOINS = [
  { key: "usdc", label: APP_CONFIG.assets.source, address: APP_CONFIG.assets.usdc, decimals: 6 },
  { key: "celo", label: "CELO", address: "", decimals: 18, native: true },
  { key: "usdm", label: APP_CONFIG.assets.bridge, address: APP_CONFIG.assets.usdm, decimals: 18 },
  { key: "ckes", label: APP_CONFIG.assets.destination, address: APP_CONFIG.assets.kesm, decimals: 18 },
];
