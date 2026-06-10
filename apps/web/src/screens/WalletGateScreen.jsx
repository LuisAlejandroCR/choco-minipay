import { ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { BottomNav } from "../components/BottomNav.jsx";

export function WalletGateScreen({ wallet, onHome, onVerifyWallet }) {
  const isVerifyingWallet = wallet.status === "loading" || wallet.status === "opening-wallet";
  const needsMobileWallet = wallet.needsMobileWallet;
  const needsDesktopWallet = !wallet.isMobile && !wallet.hasProvider;
  const showManualAddress = !wallet.hasProvider;

  // Two-layer value tracking so mobile paste always reaches the submit handler:
  // 1. pastedAddress state — updated by onInput + onPaste (fires even when
  //    onChange is skipped by the browser).
  // 2. manualAddressInputRef — uncontrolled DOM ref, read at submit time.
  // The input has no `value=` prop so React never overwrites what the browser shows.
  const [pastedAddress, setPastedAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const manualAddressInputRef = useRef(null);

  function handleAddressInput(e) {
    setPastedAddress(e.target.value || "");
    if (addressError) setAddressError("");
  }

  function handlePaste(e) {
    // onPaste fires before the browser applies the paste to the input,
    // so read the clipboard directly and also schedule a re-read for after.
    const clipText = e.clipboardData?.getData("text") || "";
    if (clipText) setPastedAddress(clipText);
    setTimeout(() => {
      const domVal = manualAddressInputRef.current?.value || "";
      if (domVal) setPastedAddress(domVal);
      if (addressError) setAddressError("");
    }, 0);
  }

  function handleUseAddress() {
    // Primary: state mirror (set by onInput / onPaste).
    // Fallback: uncontrolled DOM value (ref — browser owns it, React never clears it).
    const value = (pastedAddress || manualAddressInputRef.current?.value || "").trim();
    if (wallet.useManualAddress(value)) {
      setPastedAddress("");
      setAddressError("");
      onHome();
    } else {
      setAddressError(
        value.length === 0
          ? "Paste a wallet address (0x…) into the field first."
          : "Invalid address — must start with 0x and be 42 characters.",
      );
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
          <div className="wallet-address-form">
            <label htmlFor="manual-wallet-address">Paste wallet address</label>
            <div className="wallet-address-row">
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
                onChange={handleAddressInput}
                onInput={handleAddressInput}
                onPaste={handlePaste}
              />
              <button
                type="button"
                className="wallet-use-btn"
                onClick={handleUseAddress}
              >
                Use
              </button>
            </div>
            {addressError ? (
              <p className="address-form-error">{addressError}</p>
            ) : pastedAddress.length > 4 ? (
              <small className="address-form-hint">{pastedAddress.length} chars — tap Use</small>
            ) : (
              <small>For testnet checks only</small>
            )}
          </div>
        )}

        <button className="secondary-dark" type="button" onClick={onHome}>
          Back home
        </button>
      </section>
      <BottomNav active="home" onHome={onHome} onPlans={onHome} onHistory={onHome} />
    </div>
  );
}
