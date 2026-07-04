import { useEffect, useState } from "react";
import { ArrowLeft, Copy, CheckCircle } from "lucide-react";
import { getKotaniQuote, initiateKotaniPayout } from "../lib/kotani.js";

// Kotani Pay payout flow for Africa expanded corridors (NGN, GHS, ZAR).
// Steps: "amount" → "recipient" → "address"
// corridor — one of AFRICA_CORRIDORS entries (non-native, i.e. not Kenya)
export function KotaniPayoutScreen({ corridor, onBack }) {
  const [step, setStep] = useState("amount");

  // amount step
  const [amountUsdc, setAmountUsdc] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);

  // recipient step
  const [recipient, setRecipient] = useState("");
  const [bankCode, setBankCode] = useState("");

  // address step
  const [depositAddress, setDepositAddress] = useState("");
  const [reference, setReference] = useState("");
  const [copied, setCopied] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Live quote while the user types an amount
  useEffect(() => {
    const parsed = parseFloat(amountUsdc);
    if (!parsed || parsed <= 0) { setQuote(null); return; }
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await getKotaniQuote(corridor.code, amountUsdc);
        setQuote(q);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [amountUsdc, corridor.code]);

  async function handleSubmitRecipient() {
    if (!recipient.trim()) {
      setError(`Enter your ${corridor.recipientLabel}.`);
      return;
    }
    if (corridor.recipientType === "bank" && !bankCode.trim()) {
      setError(`Enter your ${corridor.bankCodeLabel}.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const recipientObj = corridor.recipientType === "bank"
        ? { accountNumber: recipient.trim(), bankCode: bankCode.trim() }
        : { phone: recipient.trim() };
      const { reference: ref, depositAddress: addr } = await initiateKotaniPayout(
        corridor.code, amountUsdc, recipientObj
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
              Enter a USDC amount. Kotani Pay converts it and delivers{" "}
              {corridor.currency} via {corridor.rail}.
            </p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="ktn-amount">Amount (USDC)</label>
            <input
              id="ktn-amount"
              className="wtb-input"
              type="number"
              min="1"
              step="0.01"
              placeholder="10.00"
              value={amountUsdc}
              onChange={(e) => { setAmountUsdc(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && quote && setStep("recipient")}
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
              onClick={() => { setError(""); setStep("recipient"); }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: recipient ── */}
      {step === "recipient" && (
        <div className="wtb-inner">
          <button className="wtb-back" type="button" onClick={() => setStep("amount")}>
            <ArrowLeft size={17} /> Back
          </button>
          <div className="wtb-header">
            <span className="wtb-kicker">{corridor.flag} {corridor.label} · {amountUsdc} USDC</span>
            <h2>Recipient details</h2>
            <p className="wtb-sub">
              {corridor.recipientType === "phone"
                ? "Enter the recipient's mobile money number with country code."
                : "Enter the recipient's bank account details."}
            </p>
          </div>
          <div className="wtb-form">
            <label className="wtb-label" htmlFor="ktn-recipient">{corridor.recipientLabel}</label>
            <input
              id="ktn-recipient"
              className="wtb-input"
              type={corridor.recipientType === "phone" ? "tel" : "text"}
              placeholder={corridor.recipientPlaceholder}
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && corridor.recipientType !== "bank" && handleSubmitRecipient()}
            />
            {corridor.recipientType === "bank" && (
              <>
                <label className="wtb-label" htmlFor="ktn-bankcode" style={{ marginTop: 12 }}>
                  {corridor.bankCodeLabel}
                </label>
                <input
                  id="ktn-bankcode"
                  className="wtb-input"
                  type="text"
                  placeholder={corridor.bankCodePlaceholder}
                  value={bankCode}
                  onChange={(e) => { setBankCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitRecipient()}
                />
              </>
            )}
            {error && <p className="wtb-error">{error}</p>}
            <button
              className="wtb-cta"
              type="button"
              disabled={loading || !recipient.trim()}
              onClick={handleSubmitRecipient}
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
              Kotani Pay receives it on Celo and delivers{" "}
              {corridor.currency} via {corridor.rail}. Usually 1–5 minutes.
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
