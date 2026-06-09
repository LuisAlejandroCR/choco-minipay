import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { BottomNav } from "../components/BottomNav.jsx";

export function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;
  const showManualAddress = !wallet.hasProvider;
  const [manualWalletAddress, setManualWalletAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  // DOM ref — fallback for mobile WebKit where paste can update the visual
  // input without firing React's onChange (long-press → Paste on iOS/Edge).
  const manualAddressInputRef = useRef(null);

  function handleAddressChange(event) {
    setManualWalletAddress(event.target.value);
    if (addressError) setAddressError(""); // clear inline error on any edit
  }

  function submitManualWalletAddress(event) {
    event?.preventDefault();
    // State-first: use React state value. Fall back to the raw DOM value so
    // paste-without-onChange (iOS/Edge WebKit) still works on the first tap.
    const value = manualWalletAddress || manualAddressInputRef.current?.value || "";
    if (wallet.useManualAddress(value.trim())) {
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
          <form className="wallet-address-form" onSubmit={submitManualWalletAddress}>
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
                value={manualWalletAddress}
                placeholder="0x..."
                onChange={handleAddressChange}
                onInput={handleAddressChange}
              />
              <button type="submit">Use</button>
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
