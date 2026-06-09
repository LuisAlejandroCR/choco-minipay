export const DEFAULT_CELO_NETWORK_KEY = "celoSepolia";

export function normalizeChainId(chainId) {
  if (typeof chainId === "number") return Number.isFinite(chainId) ? chainId : 0;
  if (typeof chainId !== "string" || chainId.trim() === "") return 0;
  const normalizedChainId = chainId.trim().toLowerCase();
  const parsedChainId = normalizedChainId.startsWith("0x")
    ? Number.parseInt(normalizedChainId, 16)
    : Number(normalizedChainId);
  return Number.isFinite(parsedChainId) ? parsedChainId : 0;
}

export function toHexChainId(chainId) {
  const normalizedChainId = normalizeChainId(chainId);
  return normalizedChainId > 0 ? `0x${normalizedChainId.toString(16)}` : "";
}

export const CELO_NATIVE_CURRENCY = {
  name: "CELO",
  symbol: "CELO",
  decimals: 18,
};

export const CELO_NETWORKS = {
  celoMainnet: {
    key: "celoMainnet",
    badge: "MAINNET",
    label: "MAINNET - Celo Mainnet",
    name: "Celo Mainnet",
    chainId: 42220,
    chainIdHex: toHexChainId(42220),
    rpcUrl: "https://forno.celo.org",
    explorerUrl: "https://celoscan.io",
    explorerTxUrl: "https://celoscan.io/tx",
    blockscoutTxUrl: "https://celo.blockscout.com/tx",
    agentRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry: null,
    agentExplorerUrl: "https://8004scan.io/agents/celo",
    agentId: null,
    nativeCurrency: CELO_NATIVE_CURRENCY,
    isTestnet: false,
  },
  celoSepolia: {
    key: "celoSepolia",
    badge: "TESTNET",
    label: "TESTNET - Celo Sepolia",
    name: "Celo Sepolia",
    chainId: 11142220,
    chainIdHex: toHexChainId(11142220),
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    explorerUrl: "https://celo-sepolia.blockscout.com",
    explorerTxUrl: "https://celo-sepolia.blockscout.com/tx",
    blockscoutTxUrl: "https://celo-sepolia.blockscout.com/tx",
    agentRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    agentExplorerUrl: "https://testnet.8004scan.io/agents/celo-sepolia",
    agentId: 309,
    nativeCurrency: CELO_NATIVE_CURRENCY,
    isTestnet: true,
    // Block 12: confirmed on celo-sepolia.blockscout.com
    mentoBrokerAddress: "0xB9Ae2065142EB79b6c5EB1E8778F883fad6B07Ba", // Mento Broker v2
    cKesAddress: "0x140114B70cf23C265e8EB0DcFcada2a6aC4999b0",         // cKES ERC-20 (Celo Kenyan Shilling, 18 dec)
    sortedOraclesAddress: "0xfaa7Ca2B056E60F6733aE75AA0709140a6eAfD20", // Celo SortedOracles — used for live cKES/USDm rate in Block 12
  },
};

export function getCeloNetworkConfig(key = DEFAULT_CELO_NETWORK_KEY) {
  return CELO_NETWORKS[key] || CELO_NETWORKS[DEFAULT_CELO_NETWORK_KEY];
}

export const CELO_STABLECOINS = {
  celoMainnet: {
    USDm: {
      symbol: "USDm",
      decimals: 18,
      tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      feeCurrencyAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    },
    USDC: {
      symbol: "USDC",
      decimals: 6,
      tokenAddress: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      feeCurrencyAddress: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    },
    USDT: {
      symbol: "USDT",
      decimals: 6,
      tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      feeCurrencyAddress: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",
    },
  },
  // Addresses verified on-chain via Blockscout (celo-sepolia.blockscout.com).
  // feeCurrencyAddress for 6-decimal tokens is null — fee currency adapters are
  // not yet whitelisted on Celo Sepolia. USDm (18 dec) uses its own address as
  // a placeholder; confirm adapter deployment before activating gas abstraction.
  celoSepolia: {
    USDm: {
      symbol: "USDm",
      decimals: 18,
      tokenAddress: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
      feeCurrencyAddress: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b",
    },
    USDC: {
      symbol: "USDC",
      decimals: 6,
      tokenAddress: "0x01C5C0122039549AD1493B8220cABEdD739BC44E",
      feeCurrencyAddress: null,
    },
    USDT: {
      symbol: "USDT",
      decimals: 6,
      tokenAddress: "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
      feeCurrencyAddress: null,
    },
  },
};

export function getStablecoinConfig(networkKey, symbol) {
  return CELO_STABLECOINS[networkKey]?.[symbol] ?? null;
}

export function getNetworkStablecoins(networkKey) {
  return CELO_STABLECOINS[networkKey] ?? {};
}

export const MINIPAY_DEEPLINKS = {
  deposit: "https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT",
  discover: "https://link.minipay.xyz/discover",
  balance: "https://link.minipay.xyz/balance",
  qr: "https://link.minipay.xyz/qr",
  android: "https://play.google.com/store/apps/details?id=com.opera.minipay",
  ios: "https://apps.apple.com/de/app/minipay-easy-global-wallet/id6504087257",
};

export const MINIPAY_TRUSTED_ISSUER = "0x7888612486844Bb9BE598668081c59A9f7367FBc";
