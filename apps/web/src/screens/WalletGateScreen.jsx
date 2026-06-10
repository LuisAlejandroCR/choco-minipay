import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { BottomNav } from "../components/BottomNav.jsx";

export function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;
  const showManualAddress = !wallet.hasProvider;
  const [addressError, setAddressError] = useState("");
  // Uncontrolled ref — the browser owns this input value so that mobile
  // long-press → Paste (iOS / Edge / Samsung) always sticks. A controlled
  // input (value={state}) would have React overwrite the DOM value back to
  // the stale state on the next render, wiping the pasted text before submit.
  const manualAddressInputRef = useRef(null);

  function handleUseAddress() {
    const value = (manualAddressInputRef.current?.value || "").trim();
    if (wallet.useManualAddress(value)) {
      setAddressError("");
      onHome();
    } else {
      setAddressError("Paste a valid 0x wallet address (42 characters).");
    }
  }

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
                : "Verify testnet wallet first"}
          </h2>
          <p>
            {needsMobileWallet
              ? "This mobile browser can preview Choco. Wallet actions open in MetaMask Mobile now, or MiniPay when Choco is opened there."
              : needsDesktopWallet
                ? `Install MetaMask, or enable it for this browser/incognito window, then verify on ${wallet.network.name}.`
                : `Choco hides plans, movements, and receipts until the wallet is verified on ${wallet.network.name} testnet.`}
          </p>
          {wallet.error && <p className="wallet-error">{wallet.error}</p>}
        </div>
        {needsMobileWallet ? (
          <div className="wallet-mobile-actions">
            <button className="primary-cta" type="button" disabled={isVerifyingWallet} onClick={wallet.openMetaMaskMobile}>
              {isVerifyingWallet ? "Opening wallet" : "Open in MetaMask Mobile"}
            </button>
            <button className="secondary-dark" type="button" onClick={wallet.openMiniPay}>
              Open in MiniPay
            </button>
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
            {isVerifyingWallet ? "Verifying wallet" : "Verify testnet wallet"}
          </button>
        )}
        {showManualAddress && (
          <form
            className="wallet-address-form"
            onSubmit={(e) => { e.preventDefault(); handleUseAddress(); }}
          >
            <label htmlFor="manual-wallet-address">Paste wallet address</label>
            <div>
              <input
                ref={manualAddressInputRef}
                id="manual-wallet-address"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                defaultValue=""
                placeholder="0x..."
                onChange={() => { if (addressError) setAddressError(""); }}
              />
              <button type="button" onClick={handleUseAddress}>Use</button>
            </div>
            {addressError
              ? <small className="address-form-error">{addressError}</small>
              : <small>For testnet checks only</small>
            }
          </form>
        )}
        <button className="secondary-dark" type="button" onClick={onHome}>
          Back home
        </button>
      </section>
      <BottomNav active="home" onHome={onHome} onPlans={onHome} onHistory={onHome} />
    </div>
  );
}
