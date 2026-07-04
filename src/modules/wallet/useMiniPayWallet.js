import { useEffect, useMemo, useState } from "react";
import { ACTIVE_CELO_NETWORK } from "../../config/runtime.js";
import { connectInjectedWallet, getActiveEthereumProvider, isMiniPay, setActiveEthereumProvider, shortAddress } from "../../lib/celo.js";
import { switchToCeloChain } from "../../chain/client.js";
import { humaniseConnectError } from "../../utils/appHelpers.js";

export function formatWalletAddress(address) {
  return shortAddress(address);
}

function hasEthereumProvider() {
  return Boolean(getActiveEthereumProvider());
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

export function useMiniPayWallet() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [chainId, setChainId] = useState(0);
  const hasProvider = hasEthereumProvider();
  const mobile = isMobileBrowser();
  const miniPay = isMiniPay();
  const canSign = Boolean(address && hasProvider && !isReadOnly);
  const onCelo = miniPay || chainId === 0 || chainId === ACTIVE_CELO_NETWORK.chainId;

  useEffect(() => {
    if (!hasProvider) return undefined;
    let active = true;

    getActiveEthereumProvider().request({ method: "eth_accounts" })
      .then(([existingAddress]) => {
        if (!active || !existingAddress) return;
        setAddress(existingAddress);
        setStatus("ready");
      })
      .catch(() => {});

    function handleAccountsChanged(accounts = []) {
      const [nextAddress] = accounts;
      setAddress(nextAddress || "");
      setStatus(nextAddress ? "ready" : "idle");
      setIsReadOnly(false);
      setError("");
    }

    function handleChainChanged(newChainId) {
      setChainId(newChainId ? Number(newChainId) : 0);
      setAddress("");
      setStatus("idle");
      setError("");
    }

    const provider = getActiveEthereumProvider();
    provider?.on?.("accountsChanged", handleAccountsChanged);
    provider?.on?.("chainChanged", handleChainChanged);
    return () => {
      active = false;
      provider?.removeListener?.("accountsChanged", handleAccountsChanged);
      provider?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [hasProvider]);

  const wallet = useMemo(() => ({
    address,
    error,
    hasProvider,
    isMobile: mobile,
    isMiniPay: miniPay,
    isReadOnly,
    canSign,
    isReady: Boolean(address),
    isTestnet: false,
    needsMobileWallet: mobile && !hasProvider,
    chainId,
    onCelo,
    network: {
      ...ACTIVE_CELO_NETWORK,
      badge: "Mainnet",
      name: "Celo",
      label: "Celo Mainnet",
    },
    status,
    statusLabel: address
      ? `${shortAddress(address)}`
      : status === "loading" || status === "opening-wallet"
        ? "Opening wallet"
        : error || "Connect wallet",
  }), [address, error, hasProvider, isReadOnly, canSign, miniPay, mobile, chainId, onCelo, status]);

  async function verifyWallet() {
    try {
      setStatus("opening-wallet");
      setError("");
      const nextAddress = await connectInjectedWallet();
      // Read chain after connect so onCelo reflects current state before App routes.
      const provider = getActiveEthereumProvider();
      if (provider) {
        const raw = await provider.request({ method: "eth_chainId" }).catch(() => "");
        if (raw) setChainId(Number(raw));
      }
      setAddress(nextAddress);
      setIsReadOnly(false);
      setStatus("ready");
      return nextAddress;
    } catch (nextError) {
      setStatus("error");
      // Rendered on WalletGateScreen and in the connect-button label — keep it friendly.
      setError(humaniseConnectError(nextError));
      throw nextError;
    }
  }

  async function switchToCelo() {
    const provider = getActiveEthereumProvider();
    if (!provider) return;
    try {
      setStatus("opening-wallet");
      setError("");
      await switchToCeloChain(provider);
      const raw = await provider.request({ method: "eth_chainId" }).catch(() => "");
      if (raw) setChainId(Number(raw));
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setError(humaniseConnectError(e));
    }
  }

  // Convenience wrapper: accepts the Privy embedded wallet object directly (handles
  // getEthereumProvider internally so any error is captured in wallet.error).
  async function connectPrivyWallet(embeddedWallet) {
    if (!embeddedWallet?.getEthereumProvider) throw new Error("Email wallet is not ready yet.");
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      return connectPrivyProvider(provider, embeddedWallet.address);
    } catch (nextError) {
      if (nextError?.message?.includes("Email wallet")) throw nextError;
      setStatus("error");
      setError(humaniseConnectError(nextError));
      throw nextError;
    }
  }

  async function connectPrivyProvider(provider, preferredAddress = "") {
    try {
      setStatus("opening-wallet");
      setError("");
      if (!provider?.request) throw new Error("Email wallet is not ready yet.");

      setActiveEthereumProvider(provider);

      let nextAddress = preferredAddress;
      if (!nextAddress) {
        const accounts = await provider.request({ method: "eth_accounts" }).catch(() => []);
        nextAddress = accounts?.[0] || "";
      }
      if (!nextAddress) {
        const accounts = await provider.request({ method: "eth_requestAccounts" }).catch(() => []);
        nextAddress = accounts?.[0] || "";
      }
      if (!nextAddress) throw new Error("Email wallet did not return an address.");

      const rawChainId = await provider.request({ method: "eth_chainId" }).catch(() => "");
      // Privy embedded wallets may return decimal (42220) instead of hex ("0xa4ec").
      const chainIdNum = rawChainId ? Number(rawChainId) : 0;
      if (chainIdNum && chainIdNum !== ACTIVE_CELO_NETWORK.chainId) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ACTIVE_CELO_NETWORK.chainIdHex }],
          });
        } catch {
          throw new Error("Switch your email wallet to Celo Mainnet before continuing.");
        }
      }

      setAddress(nextAddress);
      setIsReadOnly(false);
      setStatus("ready");
      return nextAddress;
    } catch (nextError) {
      setStatus("error");
      setError(humaniseConnectError(nextError));
      throw nextError;
    }
  }

  function connectManual(addr) {
    setAddress(addr);
    setStatus("ready");
    setIsReadOnly(true);
    setError("");
  }

  function openMiniPay() {
    window.location.href = "https://minipay.opera.com/";
  }

  function openMetaMaskMobile() {
    window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
  }

  function openMetaMaskDownload() {
    window.open("https://metamask.io/download/", "_blank", "noreferrer");
  }

  return {
    ...wallet,
    verifyWallet,
    switchToCelo,
    connectPrivyWallet,
    connectPrivyProvider,
    connectManual,
    openMiniPay,
    openMetaMaskMobile,
    openMetaMaskDownload,
  };
}
