import { getCeloNetworkConfig, normalizeChainId, toHexChainId } from "@core/config/celo.js";
import { DEFAULT_KES_PER_USDC } from "@core/domain/amounts.js";

const env = import.meta.env || {};
const defaultCeloNetwork = getCeloNetworkConfig(env.VITE_CELO_NETWORK_KEY || "celoSepolia");
const configuredChainId = normalizeChainId(env.VITE_CELO_CHAIN_ID || defaultCeloNetwork.chainId);
const activeChainId = configuredChainId || defaultCeloNetwork.chainId;

export const WORLD_MAP_URL = env.VITE_WORLD_MAP_URL || "https://upload.wikimedia.org/wikipedia/commons/5/51/BlankMap-Equirectangular.svg";
export const ACTIVE_CELO_NETWORK = {
  ...defaultCeloNetwork,
  name: env.VITE_CELO_NETWORK_NAME || defaultCeloNetwork.name,
  badge: env.VITE_CELO_NETWORK_BADGE || defaultCeloNetwork.badge,
  label: env.VITE_CELO_NETWORK_LABEL || defaultCeloNetwork.label,
  chainId: activeChainId,
  chainIdHex: env.VITE_CELO_CHAIN_ID_HEX || toHexChainId(activeChainId),
  rpcUrl: env.VITE_CELO_RPC_URL || defaultCeloNetwork.rpcUrl,
  explorerUrl: env.VITE_BLOCK_EXPLORER_URL || defaultCeloNetwork.explorerUrl,
  explorerTxUrl: env.VITE_BLOCK_EXPLORER_TX_URL || defaultCeloNetwork.explorerTxUrl,
};
export const BLOCKSCOUT_TX_BASE_URL = ACTIVE_CELO_NETWORK.explorerTxUrl;
export const API_BASE_URL = env.VITE_API_BASE_URL || "http://127.0.0.1:8787";
export const INITIAL_SCREEN = ["splash", "pitch", "plan"].includes(env.VITE_INITIAL_SCREEN) ? env.VITE_INITIAL_SCREEN : "pitch";
export const LIVE_DEMO_URL = env.VITE_LIVE_DEMO_URL || "https://choco-azure.vercel.app/";
export const QR_CODE_BASE_URL = env.VITE_QR_CODE_BASE_URL || "https://api.qrserver.com/v1/create-qr-code/";
export const KES_PER_USDC = Number(env.VITE_KES_PER_USDC || DEFAULT_KES_PER_USDC);
export const SHOW_DEMO_PROMPT = env.VITE_SHOW_DEMO_PROMPT === "true";

export function getVerifyTransactionUrl(hash) {
  return `${BLOCKSCOUT_TX_BASE_URL}/${encodeURIComponent(hash)}`;
}

export function getQrCodeUrl(data, size = 132) {
  return `${QR_CODE_BASE_URL}?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`;
}
