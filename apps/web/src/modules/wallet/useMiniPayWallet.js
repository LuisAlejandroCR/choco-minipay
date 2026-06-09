import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCeloNetworkConfig,
  MINIPAY_DEEPLINKS,
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
export const METAMASK_DOWNLOAD_URL = "https://metamask.io/download/";

export function isCeloSepoliaTestnet(chainId) {
  return normalizeChainId(chainId) === TESTNET_WALLET_NETWORK.chainId;
}

export function formatWalletAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeWalletAddressInput(address = "") {
  return address.trim();
}

export function isValidWalletAddress(address = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(normalizeWalletAddressInput(address));
}

function getProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

export function isMobileUserAgent(userAgent = "") {
  return /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

export function isMobileRuntime(userAgent = "", maxTouchPoints = 0) {
  const lowerUserAgent = userAgent.toLowerCase();
  const isDesktopModeMobile = Number(maxTouchPoints) > 1 && /macintosh|x11|linux/.test(lowerUserAgent);
  return isMobileUserAgent(userAgent) || isDesktopModeMobile;
}

function getUserAgent() {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

function getMaxTouchPoints() {
  if (typeof navigator === "undefined") return 0;
  return navigator.maxTouchPoints || 0;
}

function getCurrentDappUrl() {
  if (typeof window === "undefined") return "";
  return window.location.href;
}

export function getMetaMaskMobileDappUrl(dappUrl = "") {
  const normalizedUrl = dappUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return normalizedUrl ? `https://metamask.app.link/dapp/${normalizedUrl}` : "https://metamask.app.link";
}

function openExternalUrl(url, { newTab = false } = {}) {
  if (typeof window === "undefined") return;
  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
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
  const [isManualAddress, setIsManualAddress] = useState(false);
  const isMobile = isMobileRuntime(getUserAgent(), getMaxTouchPoints());
  const provider = getProvider();
  const hasProvider = Boolean(provider);
  const mobileWalletLinks = useMemo(() => ({
    metaMask: getMetaMaskMobileDappUrl(getCurrentDappUrl()),
    miniPay: MINIPAY_DEEPLINKS.discover,
    miniPayAndroid: MINIPAY_DEEPLINKS.android,
    miniPayIos: MINIPAY_DEEPLINKS.ios,
  }), []);

  const openMiniPay = useCallback(() => {
    setStatus("opening-wallet");
    setError("Opening MiniPay. Before MiniApp publishing, MetaMask Mobile is the mobile browser test path.");
    openExternalUrl(mobileWalletLinks.miniPay);
  }, [mobileWalletLinks.miniPay]);

  const openMetaMaskMobile = useCallback(() => {
    setStatus("opening-wallet");
    setError("Opening MetaMask Mobile. Approve the wallet connection there.");
    openExternalUrl(mobileWalletLinks.metaMask);
  }, [mobileWalletLinks.metaMask]);

  const openMetaMaskDownload = useCallback(() => {
    setStatus("unavailable");
    setError(`Install or enable a wallet extension, then reload Choco and verify on ${TESTNET_WALLET_NETWORK.name}.`);
    openExternalUrl(METAMASK_DOWNLOAD_URL, { newTab: true });
  }, []);

  const useManualAddress = useCallback((nextAddress) => {
    const normalizedAddress = normalizeWalletAddressInput(nextAddress);

    if (!isValidWalletAddress(normalizedAddress)) {
      setStatus("manual-error");
      setError("Paste a valid 0x wallet address.");
      return false;
    }

    setAddress(normalizedAddress);
    setChainId(TESTNET_WALLET_NETWORK.chainIdHex);
    setIsMiniPay(false);
    setIsManualAddress(true);
    setStatus("manual-ready");
    setError("Address added for testnet checks. Connect a wallet app before signing.");
    return true;
  }, []);

  const readWallet = useCallback(async ({ requestAccounts = false, ensureNetwork = false } = {}) => {
    const provider = getProvider();

    if (!provider) {
      setAddress("");
      setChainId("");
      setIsMiniPay(false);
      setIsManualAddress(false);
      if (requestAccounts && isMobile) {
        openMetaMaskMobile();
        return false;
      }
      setStatus("unavailable");
      setError(isMobile
        ? "This mobile browser can preview Choco. Open MetaMask Mobile to connect now, or MiniPay when Choco is opened there."
        : `Install or enable a browser wallet, then verify on ${TESTNET_WALLET_NETWORK.name} testnet.`);
      return false;
    }

    try {
      setError("");
      setStatus(requestAccounts ? "loading" : "checking");
      setIsMiniPay(provider.isMiniPay === true);
      setIsManualAddress(false);

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
  }, [isMobile, openMetaMaskMobile]);

  useEffect(() => {
    let provider = getProvider();
    void readWallet();

    function attachListeners(p) {
      if (!p?.on) return;
      p.on("accountsChanged", handleWalletChanged);
      p.on("chainChanged", handleWalletChanged);
    }

    function handleWalletChanged() {
      void readWallet();
    }

    if (provider) {
      attachListeners(provider);
      return () => {
        provider.removeListener?.("accountsChanged", handleWalletChanged);
        provider.removeListener?.("chainChanged", handleWalletChanged);
      };
    }

    // MiniPay injects window.ethereum asynchronously; poll once after a short
    // delay so event listeners are attached even when the provider arrives late.
    const pollTimer = window.setTimeout(() => {
      provider = getProvider();
      if (provider) {
        void readWallet();
        attachListeners(provider);
      }
    }, 500);

    return () => {
      window.clearTimeout(pollTimer);
      provider?.removeListener?.("accountsChanged", handleWalletChanged);
      provider?.removeListener?.("chainChanged", handleWalletChanged);
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
    if (status === "opening-wallet") return "Opening wallet app";
    if (status === "checking") return `Checking ${TESTNET_WALLET_NETWORK.name}`;
    if (status === "wrong-network") return `Switch wallet to ${TESTNET_WALLET_NETWORK.name} testnet`;
    if (status === "empty") return "Choose a wallet account";
    if (status === "manual-ready") return `Address review: ${formatWalletAddress(address)} on ${TESTNET_WALLET_NETWORK.name}`;
    if (status === "manual-error") return error || "Paste a valid wallet address";
    if (status === "unavailable") return isMobile ? "Open in MetaMask Mobile" : "Connect a testnet browser wallet";
    if (status === "error") return error || "Wallet unavailable";
    return `Verify on ${TESTNET_WALLET_NETWORK.name}`;
  }, [address, error, isMobile, status]);

  return {
    address,
    chainId,
    error,
    hasProvider,
    isManualAddress,
    isMiniPay,
    isMobile,
    isReadOnly: status === "manual-ready",
    isReady: (status === "ready" && isTestnet) || status === "manual-ready",
    isTestnet,
    loadWallet: readWallet,
    mobileWalletLinks,
    network: TESTNET_WALLET_NETWORK,
    openMetaMaskDownload,
    openMetaMaskMobile,
    openMiniPay,
    useManualAddress,
    needsMobileWallet: isMobile && !hasProvider,
    status,
    statusLabel,
    verifyWallet,
  };
}
