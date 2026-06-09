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
    agentExplorerUrl: "https://8004scan.io/agents/celo",
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
    agentExplorerUrl: "https://testnet.8004scan.io/agents/celo-sepolia",
    nativeCurrency: CELO_NATIVE_CURRENCY,
    isTestnet: true,
  },
};

export function getCeloNetworkConfig(key = DEFAULT_CELO_NETWORK_KEY) {
  return CELO_NETWORKS[key] || CELO_NETWORKS[DEFAULT_CELO_NETWORK_KEY];
}

export const CELO_STABLECOINS = {
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
};

export const MINIPAY_DEEPLINKS = {
  deposit: "https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT",
  discover: "https://link.minipay.xyz/discover",
  balance: "https://link.minipay.xyz/balance",
  qr: "https://link.minipay.xyz/qr",
};

export const MINIPAY_TRUSTED_ISSUER = "0x7888612486844Bb9BE598668081c59A9f7367FBc";
