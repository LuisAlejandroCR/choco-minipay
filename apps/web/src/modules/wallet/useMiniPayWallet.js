import { useCallback, useEffect, useMemo, useState } from "react";

export const TESTNET_WALLET_NETWORK = {
  badge: "TESTNET",
  label: "TESTNET - Celo Sepolia",
  name: "Celo Sepolia",
  chainId: 11142220,
  chainIdHex: "0xaa044c",
  rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
  explorerUrl: "https://celo-sepolia.blockscout.com",
  nativeCurrency: {
    name: "CELO",
    symbol: "CELO",
    decimals: 18,
  },
};

export function normalizeChainId(chainId) {
  if (typeof chainId === "number") return chainId;
  if (typeof chainId !== "string" || chainId.trim() === "") return 0;
  const normalizedChainId = chainId.trim().toLowerCase();
  return normalizedChainId.startsWith("0x") ? Number.parseInt(normalizedChainId, 16) : Number(normalizedChainId);
}

export function isCeloSepoliaTestnet(chainId) {
  return normalizeChainId(chainId) === TESTNET_WALLET_NETWORK.chainId;
}

export function formatWalletAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function hasPositiveWeiBalance(balanceWei) {
  if (!balanceWei) return false;
  try {
    return BigInt(balanceWei) > 0n;
  } catch {
    return false;
  }
}

export function formatCeloBalance(balanceWei) {
  if (!hasPositiveWeiBalance(balanceWei)) return "0 CELO";
  const wei = BigInt(balanceWei);
  const base = 10n ** 18n;
  const whole = wei / base;
  const fraction = ((wei % base) / (10n ** 14n)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} CELO`;
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

async function readNativeBalance(provider, address) {
  try {
    return await provider.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
  } catch {
    return "0x0";
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
  if (String(error?.code) === "-32601") return "Switch to Celo Sepolia testnet in your wallet.";
  return error instanceof Error ? error.message : "Wallet unavailable";
}

export function useMiniPayWallet() {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState("");
  const [nativeBalanceWei, setNativeBalanceWei] = useState("");
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [isMiniPay, setIsMiniPay] = useState(false);

  const readWallet = useCallback(async ({ requestAccounts = false, ensureNetwork = false } = {}) => {
    const provider = getProvider();

    if (!provider) {
      setAddress("");
      setChainId("");
      setNativeBalanceWei("");
      setIsMiniPay(false);
      setStatus("unavailable");
      setError("Open in MiniPay or connect a Celo Sepolia testnet wallet.");
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
        setNativeBalanceWei("");
        setStatus("empty");
        setError("Choose a wallet account to continue on testnet.");
        return false;
      }

      if (!isTestnet) {
        setNativeBalanceWei("");
        setStatus("wrong-network");
        setError("Switch to Celo Sepolia testnet before verifying Choco.");
        return false;
      }

      const nextBalanceWei = await readNativeBalance(provider, nextAddress);
      setNativeBalanceWei(nextBalanceWei || "0x0");
      setStatus("ready");
      return true;
    } catch (nextError) {
      const nextChainId = await readChainId(provider);
      setChainId(nextChainId || "");
      setNativeBalanceWei("");
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
  const hasTestnetGasFunds = hasPositiveWeiBalance(nativeBalanceWei);
  const nativeBalanceLabel = formatCeloBalance(nativeBalanceWei);
  const statusLabel = useMemo(() => {
    if (status === "ready") return `${formatWalletAddress(address)} - ${nativeBalanceLabel}`;
    if (status === "loading") return `Opening ${TESTNET_WALLET_NETWORK.name} wallet`;
    if (status === "checking") return `Checking ${TESTNET_WALLET_NETWORK.name}`;
    if (status === "wrong-network") return "Switch wallet to Celo Sepolia testnet";
    if (status === "empty") return "Choose a wallet account";
    if (status === "unavailable") return "Open in MiniPay or connect a testnet wallet";
    if (status === "error") return error || "Wallet unavailable";
    return `Verify on ${TESTNET_WALLET_NETWORK.name}`;
  }, [address, error, nativeBalanceLabel, status]);

  return {
    address,
    chainId,
    error,
    hasTestnetGasFunds,
    isMiniPay,
    isReady: status === "ready" && isTestnet,
    isTestnet,
    loadWallet: readWallet,
    nativeBalanceLabel,
    nativeBalanceWei,
    network: TESTNET_WALLET_NETWORK,
    status,
    statusLabel,
    verifyWallet,
  };
}
