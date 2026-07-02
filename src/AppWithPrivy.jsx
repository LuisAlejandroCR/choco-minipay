import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { celo } from "viem/chains";
import App from "./App.jsx";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

function PrivyBridgedApp() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((wallet) => (
    wallet.walletClientType === "privy"
    || wallet.walletClientType === "embedded"
    || wallet.connectorType === "privy"
    || wallet.connectorType === "embedded"
  )) || wallets.find((wallet) => wallet.address && wallet.getEthereumProvider);

  return (
    <App privyAuth={{ ready, authenticated, login, logout, embeddedWallet }} />
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
