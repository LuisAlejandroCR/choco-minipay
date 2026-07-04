import { useEffect, useState } from "react";
import { ArrowLeft, Copy, CheckCircle } from "lucide-react";
import { getOrionxQuote, initiateOrionxPayout } from "../lib/orionx.js";

// Orionx Business Payments payout flow for Chile (CLP) and Peru (PEN).
// Steps: "amount" → "bank" → "address"
// corridor — one of ORIONX_CORRIDORS entries from src/lib/orionx.js
export function OrionxPayoutScreen({ corridor, onBack }) {
  const [step, setStep] = useState("amount");

  // amount step
  const [amountUsdc, setAmountUsdc] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);

  // bank step
  const [bankAccount, setBankAccount] = useState("");
  const [idValue, setIdValue] = useState("");

  // address step
  const [depositAddress, setDepositAddress] = useState("");
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const parsed = parseFloat(amountUsdc);
    if (!parsed || parsed <= 0) { setQuote(null); return; }
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await getOrionxQuote(corridor.code, amountUsdc);
        setQuote(q);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [amountUsdc, corridor.code]);

  async function handleSubmitBank() {
    if (!bankAccount.trim()) { setError(`Enter your ${corridor.bankLabel}.`); return; }
    if (!idValue.trim()) { setError(`Enter your ${corridor.idLabel}.`); return; }
    setLoading(true);
    setError("");
    try {
      const recipient = {
        bankAccount: bankAccount.trim(),
        [corridor.idField]: idValue.trim(),
      };
      const { reference: ref, depositAddress: addr } = await initiateOrionxPayout(
        corridor.code, amountUsdc, recipient,
      );
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr || "")) {
        throw new Error("Received an invalid deposit address. Do not send funds — contact support.");
      }
      setReference(ref);
      setDepositAddress(addr);
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

      {/* ── Step 1: amount ── */}
      {step === "amount" && (
        <div className="wtb-inner">
          <button className="wtb-back" type="button" onClick={onBack}>
            <ArrowLeft size={17} /> Back
          </button>
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label}</span>
            <h2>How much to send?</h2>
            <p className="wtb-sub">
              Enter a USDC amount. Orionx converts it and deposits{" "}
              {corridor.currency} via {corridor.rail}.
            </p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="orx-amount">Amount (USDC)</label>
            <input
              id="orx-amount"
              className="wtb-input"
              type="number"
              min="1"
              step="0.01"
              placeholder="10.00"
              value={amountUsdc}
              onChange={(e) => { setAmountUsdc(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && quote && setStep("bank")}
            />
            {quoting && <p className="wtb-hint">Getting rate…</p>}
            {quote && !quoting && (
              <p className="wtb-hint">
                ≈ {Number(quote.localAmount).toLocaleString()} {corridor.code.toUpperCase()}{" "}
                {quote.fee ? `· fee ${quote.fee} USDC` : ""}
              </p>
            )}
            {error && <p className="wtb-error">{error}</p>}
            <button
              className="wtb-cta"
              type="button"
              disabled={!quote || quoting}
              onClick={() => { setError(""); setStep("bank"); }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: bank account + ID ── */}
      {step === "bank" && (
        <div className="wtb-inner">
          <button className="wtb-back" type="button" onClick={() => setStep("amount")}>
            <ArrowLeft size={17} /> Back
          </button>
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label} · {amountUsdc} USDC</span>
            <h2>Recipient bank details</h2>
            <p className="wtb-sub">
              Orionx deposits {corridor.currency} directly to the bank account below.
            </p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="orx-bank">{corridor.bankLabel}</label>
            <input
              id="orx-bank"
              className="wtb-input"
              type="text"
              placeholder={corridor.bankPlaceholder}
              value={bankAccount}
              onChange={(e) => { setBankAccount(e.target.value); setError(""); }}
            />
            <label className="wtb-label" htmlFor="orx-id" style={{ marginTop: 12 }}>
              {corridor.idLabel}
            </label>
            <input
              id="orx-id"
              className="wtb-input"
              type="text"
              placeholder={corridor.idPlaceholder}
              value={idValue}
              onChange={(e) => { setIdValue(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitBank()}
            />
            {error && <p className="wtb-error">{error}</p>}
            <button
              className="wtb-cta"
              type="button"
              disabled={loading || !bankAccount.trim() || !idValue.trim()}
              onClick={handleSubmitBank}
            >
              {loading ? "Getting address…" : "Get deposit address →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: deposit address ── */}
      {step === "address" && depositAddress && (
        <div className="wtb-inner">
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label} · Ready</span>
            <h2>Send USDC to this address</h2>
            <p className="wtb-sub">
              Orionx receives it on Celo and deposits {corridor.currency} via{" "}
              {corridor.rail}. Usually 1–5 minutes.
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

          {reference && (
            <p className="wtb-hint" style={{ textAlign: "center", marginTop: 8 }}>
              Reference: {reference}
            </p>
          )}

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
