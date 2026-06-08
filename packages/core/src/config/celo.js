export const CELO_NETWORKS = {
  celoMainnet: {
    name: "Celo Mainnet",
    chainId: 42220,
    rpcUrl: "https://forno.celo.org",
    explorerTxUrl: "https://celoscan.io/tx",
    blockscoutTxUrl: "https://celo.blockscout.com/tx",
    agentRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    agentExplorerUrl: "https://8004scan.io/agents/celo",
  },
  celoSepolia: {
    name: "Celo Sepolia",
    chainId: 11142220,
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    explorerTxUrl: "https://celo-sepolia.blockscout.com/tx",
    agentRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    agentExplorerUrl: "https://testnet.8004scan.io/agents/celo-sepolia",
  },
};

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
