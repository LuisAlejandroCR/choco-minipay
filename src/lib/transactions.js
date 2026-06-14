import { APP_CONFIG } from "./app-config.js";

export function isTransactionHash(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(value || ""));
}

export function getTransactionExplorerUrl(hash) {
  if (!isTransactionHash(hash)) return "";
  return `${APP_CONFIG.network.explorerTxUrl.replace(/\/$/, "")}/${hash}`;
}

export function formatTransactionHash(hash) {
  if (!isTransactionHash(hash)) return "Pending wallet signature";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}
