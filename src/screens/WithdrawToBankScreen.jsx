import { useState } from "react";
import { ArrowLeft, Copy, CheckCircle } from "lucide-react";
import {
  LATAM_CORRIDORS,
  getStoredCustomerId,
  createKycLink,
  getKycStatus,
  getOrCreateLiquidationAddress,
} from "../lib/bridge.js";

// step: "pick" → "kyc" → "bank" → "address"
export function WithdrawToBankScreen({ walletAddress, onBack }) {
  const [step, setStep] = useState("pick");
  const [corridor, setCorridor] = useState(null);
  const [email, setEmail] = useState("");
  const [kycUrl, setKycUrl] = useState("");
  const [customerId, setCustomerId] = useState(() => getStoredCustomerId(walletAddress));
  const [bankValue, setBankValue] = useState("");
  const [depositAddress, setDepositAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function pick(c) {
    setCorridor(c);
    setBankValue("");
    setError("");
    setStep(customerId ? "bank" : "kyc");
  }

  async function handleStartKyc() {
    if (!email.trim()) { setError("Enter your email to start verification."); return; }
    setLoading(true);
    setError("");
    try {
      const { kycUrl: url, customerId: cid } = await createKycLink(email.trim(), walletAddress);
      setKycUrl(url);
      if (cid) setCustomerId(cid);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Verify the KYC actually cleared before letting the user enter bank details —
  // Bridge rejects liquidation-address creation for unapproved customers with a
  // confusing API error, so surface a plain-language status here instead.
  async function handleKycDone() {
    if (!customerId) { setError("Start the verification first."); return; }
    setLoading(true);
    setError("");
    try {
      const status = await getKycStatus(customerId);
      if (status === "approved" || status === "active") {
        setStep("bank");
      } else if (status === "rejected") {
        setError("Verification was not approved. Contact support@bridge.xyz for details.");
      } else {
        setError("Verification is still processing — this can take a few minutes. Try again shortly.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGetAddress() {
    if (!bankValue.trim()) { setError(`Enter your ${corridor.bankLabel}.`); return; }
    if (!customerId) { setError("Complete identity verification first."); return; }
    setLoading(true);
    setError("");
    try {
      const address = await getOrCreateLiquidationAddress({
        customerId,
        rail: corridor.rail,
        currency: corridor.code,
        bankAccount: { [corridor.bankField]: bankValue.trim() },
      });
      setDepositAddress(address);
      setStep("address");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyAddress() {
    navigator.clipboard.writeText(depositAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  return (
    <div className="screen wtb-screen">

      {/* ── Step 1: pick currency ── */}
      {step === "pick" && (
        <div className="wtb-inner">
          <div className="wtb-header">
            <span className="wtb-kicker">Withdraw to bank</span>
            <h2>Where should we send it?</h2>
            <p className="wtb-sub">
              Bridge converts your USDC and deposits local currency to your bank account.
            </p>
          </div>
          <div className="wtb-options">
            {LATAM_CORRIDORS.map((c) => (
              <button key={c.code} className="wtb-card" type="button" onClick={() => pick(c)}>
                <span className="wtb-flag">{c.flag}</span>
                <div className="wtb-card-body">
                  <strong>{c.label}</strong>
                  <span>{c.currency} · {c.bankLabel}</span>
                </div>
                {c.status === "beta"
                  ? <span className="wtb-badge-beta">Beta</span>
                  : <span className="wtb-arrow">→</span>
                }
              </button>
            ))}
          </div>
          <button className="wtb-back-link" type="button" onClick={onBack}>
            ← Back
          </button>
        </div>
      )}

      {/* ── Step 2: KYC (first time only) ── */}
      {step === "kyc" && corridor && (
        <div className="wtb-inner">
          <button className="wtb-back" type="button" onClick={() => setStep("pick")}>
            <ArrowLeft size={17} /> Back
          </button>
          <div className="wtb-header">
            <span className="wtb-kicker">Identity check</span>
            <h2>Verify once, withdraw anytime</h2>
            <p className="wtb-sub">Bridge handles verification securely. This is a one-time step — all future withdrawals skip it.</p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="wtb-email">Email</label>
            <input
              id="wtb-email"
              className="wtb-input"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartKyc()}
            />
            {error && <p className="wtb-error">{error}</p>}
            <button
              className="wtb-cta"
              type="button"
              onClick={handleStartKyc}
              disabled={loading || !email.trim()}
            >
              {loading ? "Starting…" : "Start verification ↗"}
            </button>
            {kycUrl && (
              <div className="wtb-kyc-done">
                <p className="wtb-hint">
                  Complete the verification in the new tab, then return here.
                </p>
                <button className="wtb-cta-sec" type="button" disabled={loading} onClick={handleKycDone}>
                  {loading ? "Checking…" : "I've completed verification →"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 3: bank account details ── */}
      {step === "bank" && corridor && (
        <div className="wtb-inner">
          <button className="wtb-back" type="button" onClick={() => setStep("pick")}>
            <ArrowLeft size={17} /> Back
          </button>
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label}</span>
            <h2>Your {corridor.bankLabel}</h2>
            <p className="wtb-sub">
              Bridge will send {corridor.currency} here after converting your USDC.
            </p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="wtb-bank">{corridor.bankLabel}</label>
            <input
              id="wtb-bank"
              className="wtb-input"
              type="text"
              placeholder={corridor.bankPlaceholder}
              value={bankValue}
              onChange={(e) => setBankValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGetAddress()}
            />
            {error && <p className="wtb-error">{error}</p>}
            <button
              className="wtb-cta"
              type="button"
              onClick={handleGetAddress}
              disabled={loading || !bankValue.trim()}
            >
              {loading ? "Getting address…" : "Get deposit address →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: deposit address ── */}
      {step === "address" && corridor && depositAddress && (
        <div className="wtb-inner">
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label} · Ready</span>
            <h2>Send USDC to this address</h2>
            <p className="wtb-sub">
              Bridge receives it on Celo and deposits {corridor.currency} to your{" "}
              {corridor.rail.toUpperCase().replace("_", "-")} account. Usually 1–3 minutes.
            </p>
          </div>

          <div className="wtb-address-card">
            <span className="wtb-address-label">Celo deposit address</span>
            <span className="wtb-address-val">{depositAddress}</span>
            <button className="wtb-copy-btn" type="button" onClick={copyAddress}>
              {copied
                ? <><CheckCircle size={15} /> Copied!</>
                : <><Copy size={15} /> Copy address</>
              }
            </button>
          </div>

          <div className="wtb-warning">
            Send <strong>USDC</strong> on <strong>Celo</strong> only.
            Other tokens or networks will be lost.
          </div>

          <button className="wtb-cta-sec" type="button" onClick={onBack}>
            Done
          </button>
        </div>
      )}

    </div>
  );
}
