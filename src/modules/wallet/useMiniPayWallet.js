import { useEffect, useMemo, useState } from "react";
import { ACTIVE_CELO_NETWORK } from "../../config/runtime.js";
import { connectInjectedWallet, isMiniPay, shortAddress } from "../../lib/celo.js";

export function formatWalletAddress(address) {
  return shortAddress(address);
}

function hasEthereumProvider() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

export function useMiniPayWallet() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const hasProvider = hasEthereumProvider();
  const mobile = isMobileBrowser();
  const miniPay = isMiniPay();

  useEffect(() => {
    if (!hasProvider) return undefined;
    let active = true;

    window.ethereum.request({ method: "eth_accounts" })
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
      setError("");
    }

    function handleChainChanged() {
      setAddress("");
      setStatus("idle");
      setError("Reconnect on Celo Mainnet.");
    }

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);
    return () => {
      active = false;
      window.ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [hasProvider]);

  const wallet = useMemo(() => ({
    address,
    error,
    hasProvider,
    isMobile: mobile,
    isMiniPay: miniPay,
    isReadOnly: false,
    isReady: Boolean(address),
    isTestnet: false,
    needsMobileWallet: mobile && !hasProvider,
    network: {
      ...ACTIVE_CELO_NETWORK,
      badge: "Mainnet",
      name: "Celo",
      label: "Celo Mainnet",
    },
    status,
    statusLabel: address
      ? `${shortAddress(address)} - Celo Mainnet`
      : status === "loading" || status === "opening-wallet"
        ? "Opening wallet"
        : error || "Connect wallet on Celo Mainnet",
  }), [address, error, hasProvider, miniPay, mobile, status]);

  async function verifyWallet() {
    try {
      setStatus("opening-wallet");
      setError("");
      const nextAddress = await connectInjectedWallet();
      setAddress(nextAddress);
      setStatus("ready");
      return nextAddress;
    } catch (nextError) {
      setStatus("error");
      setError(nextError.message);
      throw nextError;
    }
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
    openMiniPay,
    openMetaMaskMobile,
    openMetaMaskDownload,
  };
}
