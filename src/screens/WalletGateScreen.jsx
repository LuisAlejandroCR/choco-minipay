import { useState } from "react";
import { isAddress } from "viem";
import { ShieldCheck, X } from "lucide-react";
import { shortAddress } from "../lib/celo.js";

export function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const [manualAddr, setManualAddr] = useState("");
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;

  const trimmedAddr = manualAddr.trim();
  const isValidAddr = isAddress(trimmedAddr);

  function handleConnect() {
    wallet.connectManual(trimmedAddr);
    onHome();
  }

  return (
    <div className="screen wallet-gate-screen">
      <section className="wallet-gate-card">
        <span className="guard-icon"><ShieldCheck size={24} /></span>
        <div>
          <span>Wallet access</span>
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
                ? "Install or enable a browser wallet, then connect."
                : "Choco reads balances and prepares wallet-signed actions. It never custodies funds."}
          </p>
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>

        {needsMobileWallet ? (
          <div className="wallet-mobile-actions">
            <button
              className="primary-cta"
              type="button"
              disabled={isVerifyingWallet}
              onClick={wallet.openMetaMaskMobile}
            >
              {isVerifyingWallet ? "Opening wallet…" : "Open in wallet"}
            </button>

            {/* Manual address entry — read-only after validation so state never gets corrupted */}
            <div className="wallet-manual-input">
              <label className="wallet-manual-label">Or paste your address</label>
              <div className={`wallet-manual-row${isValidAddr ? " row-validated" : ""}`}>
                <input
                  type="text"
                  className="wallet-manual-field"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="0x…"
                  value={manualAddr}
                  readOnly={isValidAddr}
                  onChange={(e) => setManualAddr(e.target.value)}
                  aria-label="Paste wallet address"
                />
                {isValidAddr && (
                  <button
                    className="wallet-clear-btn"
                    type="button"
                    aria-label="Clear address"
                    onClick={() => setManualAddr("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isValidAddr && (
                <>
                  <small className="wallet-addr-preview">Read-only · {shortAddress(trimmedAddr)}</small>
                  <button
                    className="primary-cta"
                    type="button"
                    onClick={handleConnect}
                  >
                    Connect {shortAddress(trimmedAddr)}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : needsDesktopWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" onClick={wallet.openMetaMaskDownload}>
              Get MetaMask
            </button>
            <button className="secondary-dark" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
              {isVerifyingWallet ? "Checking wallet…" : "I enabled it, check again"}
            </button>

            <div className="wallet-manual-input">
              <label className="wallet-manual-label">Or paste your address</label>
              <div className={`wallet-manual-row${isValidAddr ? " row-validated" : ""}`}>
                <input
                  type="text"
                  className="wallet-manual-field"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="0x…"
                  value={manualAddr}
                  readOnly={isValidAddr}
                  onChange={(e) => setManualAddr(e.target.value)}
                  aria-label="Paste wallet address"
                />
                {isValidAddr && (
                  <button
                    className="wallet-clear-btn"
                    type="button"
                    aria-label="Clear address"
                    onClick={() => setManualAddr("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {isValidAddr && (
                <>
                  <small className="wallet-addr-preview">Read-only · {shortAddress(trimmedAddr)}</small>
                  <button
                    className="primary-cta"
                    type="button"
                    onClick={handleConnect}
                  >
                    Connect {shortAddress(trimmedAddr)}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={onVerifyWallet}>
            {isVerifyingWallet ? "Verifying wallet…" : "Verify wallet"}
          </button>
        )}

        <div className="wallet-contact-hint">
          Recipient selection uses the Choco contact/alias flow. Wallet addresses stay out of the main screen.
        </div>
      </section>
    </div>
  );
}
