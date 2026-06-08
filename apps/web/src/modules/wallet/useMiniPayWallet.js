import { useCallback, useEffect, useMemo, useState } from "react";

export function useMiniPayWallet() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");

  const isMiniPay = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.ethereum?.isMiniPay === true;
  }, []);

  const loadWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      setStatus("unavailable");
      return;
    }

    try {
      setError("");
      setStatus("loading");
      const method = isMiniPay ? "eth_accounts" : "eth_requestAccounts";
      let accounts = await window.ethereum.request({ method });

      if (isMiniPay && (!accounts || accounts.length === 0)) {
        accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      }

      setAddress(accounts?.[0] || "");
      setStatus(accounts?.[0] ? "ready" : "empty");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Wallet unavailable");
      setStatus("error");
    }
  }, [isMiniPay]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  return {
    address,
    error,
    isMiniPay,
    isReady: status === "ready",
    loadWallet,
    status,
  };
}
