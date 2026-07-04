import { useMemo } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { celo } from "viem/chains";
import App from "./App.jsx";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

// Known external wallet types that Privy can also connect — exclude these so we only
// pick the embedded (email-created) wallet, not a MetaMask the user linked via Privy.
const EXTERNAL_WALLET_TYPES = new Set([
  "metamask", "coinbase_wallet", "rainbow", "phantom", "trust",
  "walletconnect", "safe", "ledger", "trezor",
]);

function pickEmbeddedWallet(wallets = []) {
  // First: match known Privy embedded wallet client types (varies by SDK version).
  const byType = wallets.find((w) =>
    w.walletClientType === "privy" ||
    w.walletClientType === "embedded" ||
    w.walletClientType === "privy_embedded" ||
    w.connectorType === "privy" ||
    w.connectorType === "embedded"
  );
  if (byType) return byType;

  // Fallback: any wallet that has a provider AND is not a known external type.
  // Handles future SDK renames and edge cases.
  const byExclusion = wallets.find((w) =>
    typeof w.getEthereumProvider === "function" &&
    !EXTERNAL_WALLET_TYPES.has(w.walletClientType) &&
    !EXTERNAL_WALLET_TYPES.has(w.connectorType)
  );

  if (wallets.length > 0) {
    // Diagnostic log: helps identify wallet types in production without crashing.
    console.debug("[Choco/Privy] wallets:", wallets.map((w) => ({
      addr: w.address?.slice(-4),
      clientType: w.walletClientType,
      connectorType: w.connectorType,
      hasProvider: typeof w.getEthereumProvider === "function",
    })));
  }

  return byExclusion || null;
}

function PrivyBridgedApp() {
  const { ready, authenticated, login, logout, createWallet } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = useMemo(() => pickEmbeddedWallet(wallets), [wallets]);

  return (
    <App
      privyAuth={{
        ready,
        authenticated,
        login,           // Privy's own login() — opens the modal directly
        logout,
        createWallet,    // retry path when the embedded wallet fails to provision after OTP
        embeddedWallet,  // null until OTP completes + wallet is created
      }}
    />
  );
}

export function AppWithPrivy() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: { createOnLogin: "users-without-wallets" },
        defaultChain: celo,
        supportedChains: [celo],
      }}
    >
      <PrivyBridgedApp />
    </PrivyProvider>
  );
}
