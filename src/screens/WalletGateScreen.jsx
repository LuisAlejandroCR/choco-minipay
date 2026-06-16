import { useState } from "react";
import { isAddress } from "viem";
import { ShieldCheck } from "lucide-react";
import { BottomNav } from "../components/BottomNav.jsx";

export function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const [manualAddr, setManualAddr] = useState("");
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;

  const trimmedAddr = manualAddr.trim();
  const isValidAddr = isAddress(trimmedAddr);
  const addrPreview = trimmedAddr.length >= 4 ? `...${trimmedAddr.slice(-4)}` : "";

  return (
    <div className="screen wallet-gate-screen">
      <section className="wallet-gate-card">
        <span className="guard-icon"><ShieldCheck size={24} /></span>
        <div>
          <span>Wallet access</span>
          <div className="wallet-network-label">{wallet.network.label}</div>
          <h2>
            {needsMobileWallet
              ? "Connect from a mobile wallet"
              : needsDesktopWallet
                ? "Connect a browser wallet"
                : "Verify your wallet first"}
          </h2>
          <p>
            {needsMobileWallet
              ? "Open Choco in MiniPay or another injected mobile wallet to sign actions."
              : needsDesktopWallet
                ? "Install or enable a browser wallet, then connect on Celo Mainnet."
                : "Choco reads balances and prepares wallet-signed actions. It never custodies funds."}
          </p>
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>

        {needsMobileWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={wallet.openMetaMaskMobile}>
              {isVerifyingWallet ? "Opening wallet" : "Open in wallet"}
            </button>

            <div className="wallet-manual-input">
              <label className="wallet-manual-label">Or paste your wallet address</label>
              <div className="wallet-manual-row">
                <input
                  type="text"
                  className="wallet-manual-field"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="0x…"
                  value={isValidAddr ? addrPreview : manualAddr}
                  onChange={(e) => setManualAddr(e.target.value)}
                  aria-label="Paste wallet address"
                />
                {isValidAddr && (
                  <button
                    className="secondary-dark"
                    type="button"
                    onClick={() => wallet.connectManual(trimmedAddr)}
                  >
                    Connect
                  </button>
                )}
              </div>
              {isValidAddr && (
                <small className="wallet-addr-preview">Read-only · {addrPreview}</small>
              )}
            </div>
          </div>
        ) : needsDesktopWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" onClick={wallet.openMetaMaskDownload}>
              Get MetaMask
            </button>
            <button className="secondary-dark" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
              {isVerifyingWallet ? "Checking wallet" : "I enabled it, check again"}
            </button>
          </div>
        ) : (
          <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
            {isVerifyingWallet ? "Verifying wallet" : "Verify wallet"}
          </button>
        )}

        <div className="wallet-contact-hint">
          Recipient selection uses the Choco contact/alias flow. Wallet addresses stay out of the main screen.
        </div>

        <button className="secondary-dark" type="button" onClick={onHome}>
          Back home
        </button>
      </section>
      <BottomNav active="home" onHome={onHome} onPlans={onHome} onHistory={onHome} />
    </div>
  );
}
