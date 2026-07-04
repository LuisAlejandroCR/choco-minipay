import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  zeroAddress,
} from "viem";
import { celo } from "viem/chains";
import { APP_CONFIG } from "../lib/app-config.js";

const MENTO = APP_CONFIG.mento;

export const CELO_MAINNET = {
  chainId: APP_CONFIG.network.chainId,
  chainIdHex: APP_CONFIG.network.chainIdHex,
  rpcUrl: APP_CONFIG.network.rpcUrl,
  txExplorer: `${APP_CONFIG.network.explorerTxUrl.replace(/\/$/, "")}/`,
};

export const ADDRESSES = {
  ledger: APP_CONFIG.contracts.ledger,
  registry: APP_CONFIG.contracts.registry,
  settlementSpender: APP_CONFIG.contracts.settlementSpender,
  ckesSwap: APP_CONFIG.contracts.ckesSwap,
  ckesSwapUniV3: APP_CONFIG.contracts.ckesSwapUniV3,
  scheduleEscrow: APP_CONFIG.contracts.scheduleEscrow,
  demoRecipient: APP_CONFIG.recipients.demoRecipientAddress,
  usdc: APP_CONFIG.assets.usdc,
  usdm: APP_CONFIG.assets.usdm,
  kesm: APP_CONFIG.assets.kesm,
  feeCurrency: APP_CONFIG.assets.feeCurrency,
  mentoBroker: MENTO.broker,
  mentoProvider: MENTO.exchangeProvider,
};

export function getActiveEthereumProvider() {
  if (typeof window === "undefined") return null;
  return window.__chocoEthereumProvider || window.ethereum || null;
}

export function setActiveEthereumProvider(provider) {
  if (typeof window === "undefined" || !provider?.request) return;
  window.__chocoEthereumProvider = provider;
  try {
    window.ethereum = provider;
  } catch {
    try {
      Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    } catch {
      // Some browser wallets expose a read-only descriptor. The internal Choco provider still works.
    }
  }
}

export function isMiniPay() {
  return getActiveEthereumProvider()?.isMiniPay === true;
}

export function shortAddress(address) {
  if (!address || !isAddress(address)) return "Not connected";
  return `x${address.slice(-4)}`;
}

export function labelWithAddress(label, address) {
  const suffix = shortAddress(address);
  const name = String(label || "").trim();
  if (!name) return suffix;
  return suffix === "Not connected" ? name : `${name} ${suffix}`;
}

export function getApprovalTarget({ deliveryMode = "now", intent = null } = {}) {
  const sourceAsset = intent?.sourceAsset || APP_CONFIG.assets.source;
  if (sourceAsset === APP_CONFIG.assets.destination) return null;

  if (deliveryMode === "schedule") {
    return {
      name: "Choco settlement spender",
      address: ADDRESSES.settlementSpender,
      asset: sourceAsset,
    };
  }

  if (isAddress(ADDRESSES.ckesSwap || "")) {
    return {
      name: "Choco swap contract",
      address: ADDRESSES.ckesSwap,
      asset: APP_CONFIG.assets.source,
    };
  }

  return {
    name: "Mento Broker",
    address: ADDRESSES.mentoBroker,
    asset: APP_CONFIG.assets.source,
  };
}

export function assertAddress(address, label) {
  if (!isAddress(address) || address === zeroAddress) throw new Error(`${label} is not a valid Celo address.`);
  return address;
}

export function makePublicClient() {
  // Generous timeout + retries. MiniPay's WebView on emerging-market connections is slower than a
  // desktop browser and forno occasionally rate-limits, which surfaced as a transient "temporarily
  // unavailable" on the Confirm screen even when the send itself succeeds. These are read-only RPC
  // calls, so retrying is always safe.
  return createPublicClient({
    chain: celo,
    transport: http(CELO_MAINNET.rpcUrl, { timeout: 20_000, retryCount: 4, retryDelay: 500 }),
  });
}

export function makeWalletClient(account) {
  const provider = getActiveEthereumProvider();
  if (!provider) throw new Error("Open Choco in MiniPay or a Celo wallet browser.");
  return createWalletClient({ account, chain: celo, transport: custom(provider) });
}

// Attempt to switch to Celo, adding the network if the wallet doesn't know it yet (EIP-3085).
export async function switchToCeloChain(provider = getActiveEthereumProvider()) {
  if (!provider) throw new Error("No wallet provider.");
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CELO_MAINNET.chainIdHex }] });
  } catch (switchErr) {
    // 4902 = chain not yet registered in the wallet — add it, then switch.
    if (switchErr?.code === 4902 || switchErr?.code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CELO_MAINNET.chainIdHex,
          chainName: "Celo Mainnet",
          nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
          rpcUrls: [CELO_MAINNET.rpcUrl],
          blockExplorerUrls: ["https://celoscan.io"],
        }],
      });
    } else {
      throw switchErr;
    }
  }
}

export async function connectInjectedWallet() {
  const provider = getActiveEthereumProvider();
  if (!provider) throw new Error("Open Choco in MiniPay or a Celo wallet browser.");
  const [account] = await provider.request({ method: "eth_requestAccounts" });
  const chainId = await provider.request({ method: "eth_chainId" });

  if (String(chainId).toLowerCase() !== CELO_MAINNET.chainIdHex.toLowerCase()) {
    try {
      await switchToCeloChain(provider);
    } catch {
      // Don't block connection — return the account anyway so App can show ChainGateScreen.
    }
  }

  return account;
}