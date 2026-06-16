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
  demoRecipient: APP_CONFIG.recipients.demoRecipientAddress,
  usdc: APP_CONFIG.assets.usdc,
  usdm: APP_CONFIG.assets.usdm,
  kesm: APP_CONFIG.assets.kesm,
  feeCurrency: APP_CONFIG.assets.feeCurrency,
  mentoBroker: MENTO.broker,
  mentoProvider: MENTO.exchangeProvider,
};

export function isMiniPay() {
  return typeof window !== "undefined" && window.ethereum?.isMiniPay === true;
}

export function shortAddress(address) {
  if (!address || !isAddress(address)) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
