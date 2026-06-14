import { APP_CONFIG } from "../lib/app-config.js";
import { getTransactionExplorerUrl } from "../lib/transactions.js";

export const WORLD_MAP_URL = APP_CONFIG.ui.worldMapUrl;
export const API_BASE_URL = "";
export const INITIAL_SCREEN = APP_CONFIG.ui.initialScreen;
export const LIVE_DEMO_URL = APP_CONFIG.ui.liveDemoUrl;
export const KES_PER_USDC = APP_CONFIG.transfer.kesPerUsdc;

export const ACTIVE_CELO_NETWORK = {
  ...APP_CONFIG.network,
};

export const BLOCKSCOUT_TX_BASE_URL = ACTIVE_CELO_NETWORK.explorerTxUrl;

export function getVerifyTransactionUrl(hash) {
  return getTransactionExplorerUrl(hash);
}
