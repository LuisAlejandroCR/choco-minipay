import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCeloNetworkConfig,
  normalizeChainId,
  toHexChainId,
} from "../../../../../packages/core/src/config/celo.js";

const env = import.meta.env || {};

function buildWalletNetwork() {
  const defaultNetwork = getCeloNetworkConfig("celoSepolia");
  const chainId = normalizeChainId(env.VITE_CELO_CHAIN_ID || defaultNetwork.chainId);
  const chainIdHex = env.VITE_CELO_CHAIN_ID_HEX || toHexChainId(chainId);

  return {
    ...defaultNetwork,
    name: env.VITE_CELO_NETWORK_NAME || defaultNetwork.name,
    badge: env.VITE_CELO_NETWORK_BADGE || defaultNetwork.badge,
    label: env.VITE_CELO_NETWORK_LABEL || defaultNetwork.label,
    chainId,
    chainIdHex,
    rpcUrl: env.VITE_CELO_RPC_URL || defaultNetwork.rpcUrl,
    explorerUrl: env.VITE_BLOCK_EXPLORER_URL || defaultNetwork.explorerUrl,
    explorerTxUrl: env.VITE_BLOCK_EXPLORER_TX_URL || defaultNetwork.explorerTxUrl,
  };
}

export { normalizeChainId } from "../../../../../packages/core/src/config/celo.js";

export const TESTNET_WALLET_NETWORK = buildWalletNetwork();

export function isCeloSepoliaTestnet(chainId) {
  return normalizeChainId(chainId) === TESTNET_WALLET_NETWORK.chainId;
}

export function formatWalletAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

async function readChainId(provider) {
  try {
    return await provider.request({ method: "eth_chainId" });
  } catch {
    return "";
  }
}

async function addCeloSepolia(provider) {
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: TESTNET_WALLET_NETWORK.chainIdHex,
        chainName: TESTNET_WALLET_NETWORK.name,
        nativeCurrency: TESTNET_WALLET_NETWORK.nativeCurrency,
        rpcUrls: [TESTNET_WALLET_NETWORK.rpcUrl],
        blockExplorerUrls: [TESTNET_WALLET_NETWORK.explorerUrl],
      },
    ],
  });
}

async function ensureCeloSepolia(provider) {
  const currentChainId = await readChainId(provider);
  if (isCeloSepoliaTestnet(currentChainId)) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: TESTNET_WALLET_NETWORK.chainIdHex }],
    });
  } catch (error) {
    if (String(error?.code) === "4902") {
      await addCeloSepolia(provider);
      return;
    }
    throw error;
  }
}

function getWalletErrorMessage(error) {
  if (String(error?.code) === "4001") return "Wallet verification was cancelled.";
  if (String(error?.code) === "-32601") return `Switch to ${TESTNET_WALLET_NETWORK.name} testnet in your wallet.`;
  return error instanceof Error ? error.message : "Wallet unavailable";
}

export function useMiniPayWallet() {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [isMiniPay, setIsMiniPay] = useState(false);

  const readWallet = useCallback(async ({ requestAccounts = false, ensureNetwork = false } = {}) => {
    const provider = getProvider();

    if (!provider) {
      setAddress("");
      setChainId("");
      setIsMiniPay(false);
      setStatus("unavailable");
      setError(`Open in MiniPay or connect a ${TESTNET_WALLET_NETWORK.name} testnet wallet.`);
      return false;
    }

    try {
      setError("");
      setStatus(requestAccounts ? "loading" : "checking");
      setIsMiniPay(provider.isMiniPay === true);

      if (ensureNetwork) {
        await ensureCeloSepolia(provider);
      }

      const nextChainId = await readChainId(provider);
      const accounts = await provider.request({
        method: requestAccounts ? "eth_requestAccounts" : "eth_accounts",
      });
      const nextAddress = accounts?.[0] || "";
      const isTestnet = isCeloSepoliaTestnet(nextChainId);

      setAddress(nextAddress);
      setChainId(nextChainId || "");

      if (!nextAddress) {
        setStatus("empty");
        setError("Choose a wallet account to continue on testnet.");
        return false;
      }

      if (!isTestnet) {
        setStatus("wrong-network");
        setError(`Switch to ${TESTNET_WALLET_NETWORK.name} testnet before verifying Choco.`);
        return false;
      }

      setStatus("ready");
      return true;
    } catch (nextError) {
      const nextChainId = await readChainId(provider);
      setChainId(nextChainId || "");
      setStatus("error");
      setError(getWalletErrorMessage(nextError));
      return false;
    }
  }, []);

  useEffect(() => {
    const provider = getProvider();
    void readWallet();

    if (!provider?.on) return undefined;

    const handleWalletChanged = () => {
      void readWallet();
    };

    provider.on("accountsChanged", handleWalletChanged);
    provider.on("chainChanged", handleWalletChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleWalletChanged);
      provider.removeListener?.("chainChanged", handleWalletChanged);
    };
  }, [readWallet]);

  const verifyWallet = useCallback(
    () => readWallet({ requestAccounts: true, ensureNetwork: true }),
    [readWallet],
  );

  const isTestnet = isCeloSepoliaTestnet(chainId);
  const statusLabel = useMemo(() => {
    if (status === "ready") return `${formatWalletAddress(address)} on ${TESTNET_WALLET_NETWORK.name}`;
    if (status === "loading") return `Opening ${TESTNET_WALLET_NETWORK.name} wallet`;
    if (status === "checking") return `Checking ${TESTNET_WALLET_NETWORK.name}`;
    if (status === "wrong-network") return `Switch wallet to ${TESTNET_WALLET_NETWORK.name} testnet`;
    if (status === "empty") return "Choose a wallet account";
    if (status === "unavailable") return "Open in MiniPay or connect a testnet wallet";
    if (status === "error") return error || "Wallet unavailable";
    return `Verify on ${TESTNET_WALLET_NETWORK.name}`;
  }, [address, error, status]);

  return {
    address,
    chainId,
    error,
    isMiniPay,
    isReady: status === "ready" && isTestnet,
    isTestnet,
    loadWallet: readWallet,
    network: TESTNET_WALLET_NETWORK,
    status,
    statusLabel,
    verifyWallet,
  };
}
