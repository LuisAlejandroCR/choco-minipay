import { useEffect, useMemo, useState } from "react";
import { ACTIVE_CELO_NETWORK } from "../../config/runtime.js";
import { connectInjectedWallet, getActiveEthereumProvider, isMiniPay, setActiveEthereumProvider, shortAddress } from "../../lib/celo.js";
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
  const hasProvider = hasEthereumProvider();
  const mobile = isMobileBrowser();
  const miniPay = isMiniPay();
  const canSign = Boolean(address && hasProvider && !isReadOnly);

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

    function handleChainChanged() {
      setAddress("");
      setStatus("idle");
      setError("Reconnect your wallet.");
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
  }), [address, error, hasProvider, isReadOnly, canSign, miniPay, mobile, status]);

  async function verifyWallet() {
    try {
      setStatus("opening-wallet");
      setError("");
      const nextAddress = await connectInjectedWallet();
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

      const chainId = await provider.request({ method: "eth_chainId" }).catch(() => "");
      if (chainId && String(chainId).toLowerCase() !== ACTIVE_CELO_NETWORK.chainIdHex.toLowerCase()) {
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
    connectPrivyProvider,
    connectManual,
    openMiniPay,
    openMetaMaskMobile,
    openMetaMaskDownload,
  };
}
