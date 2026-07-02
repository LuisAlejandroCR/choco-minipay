import { useCallback, useEffect, useMemo, useState } from "react";
import { PrivyProvider, useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { celo } from "viem/chains";
import App from "./App.jsx";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

function pickEmbeddedWallet(wallets = []) {
  return wallets.find((wallet) => (
    wallet.walletClientType === "privy"
    || wallet.walletClientType === "embedded"
    || wallet.connectorType === "privy"
    || wallet.connectorType === "embedded"
  )) || wallets.find((wallet) => wallet.address && wallet.getEthereumProvider) || null;
}

function PrivyBridgedApp() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isPreparingEmailWallet, setIsPreparingEmailWallet] = useState(false);
  const [emailWalletError, setEmailWalletError] = useState("");
  const [walletCreateAttempted, setWalletCreateAttempted] = useState(false);

  const embeddedWallet = useMemo(() => pickEmbeddedWallet(wallets), [wallets]);

  const prepareEmailWallet = useCallback(async ({ automatic = false } = {}) => {
    setEmailWalletError("");

    if (!authenticated) {
      login();
      return;
    }

    if (embeddedWallet?.getEthereumProvider) return;
    if (automatic && walletCreateAttempted) return;

    setWalletCreateAttempted(true);
    setIsPreparingEmailWallet(true);
    try {
      await createWallet();
    } catch (error) {
      const message = String(error?.message || error || "");
      setEmailWalletError(
        /already.*wallet|embedded wallet/i.test(message)
          ? "Email confirmed. Tap Sign in with email once more to finish opening Choco."
          : message || "Email wallet could not be prepared. Try again.",
      );
    } finally {
      setIsPreparingEmailWallet(false);
    }
  }, [authenticated, createWallet, embeddedWallet, login, walletCreateAttempted]);

  useEffect(() => {
    if (!ready || !authenticated || embeddedWallet?.getEthereumProvider || walletCreateAttempted) return undefined;
    const timer = window.setTimeout(() => {
      void prepareEmailWallet({ automatic: true });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [ready, authenticated, embeddedWallet, prepareEmailWallet, walletCreateAttempted]);

  return (
    <App
      privyAuth={{
        ready,
        authenticated,
        login: prepareEmailWallet,
        logout,
        embeddedWallet,
        isPreparingEmailWallet,
        emailWalletError,
      }}
    />
  );
}

export function AppWithPrivy() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email"],
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        defaultChain: celo,
        supportedChains: [celo],
      }}
    >
      <PrivyBridgedApp />
    </PrivyProvider>
  );
}