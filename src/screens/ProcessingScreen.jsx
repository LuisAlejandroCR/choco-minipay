import { CalendarDays, Check, CircleDollarSign, ReceiptText, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { getTimingLabel } from "../utils/planUtils.js";

// ProcessingScreen owns its animation-step timer so it does not cause full-tree
// re-renders from App root while the steps advance.
// When duplicateAttempt is set, onComplete fires after the final step to navigate
// to duplicateGuard. Otherwise the screen transitions inline into a checkpoint so
// the user confirms the parsed intent without a page jump.
export function ProcessingScreen({ plan, command, duplicateAttempt, onComplete, onApprove, onEdit }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const isSendNow = plan.deliveryMode === "now";

  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 220),
      window.setTimeout(() => setStep(2), 720),
      window.setTimeout(() => setStep(3), 1220),
      window.setTimeout(() => {
        if (duplicateAttempt) {
          onCompleteRef.current?.();
        } else {
          setDone(true);
        }
      }, 1900),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: run once on mount

  const confidence = plan?.intent?.confidence;
  const confidencePct = confidence != null ? Math.round(confidence * 100) : null;
  const chipTone = confidencePct != null && confidencePct >= 80 ? "success" : "neutral";

  const feed = [
    {
      icon: <Check size={15} />,
      title: "Intent detected",
      copy: isSendNow ? "Text or voice becomes a one-time transfer." : "Recipient, amount, asset, and date are ready.",
    },
    {
      icon: <RefreshCw size={15} />,
      title: "Route prepared",
      copy: "USDC is routed into KESm on Celo.",
    },
    {
      icon: <ReceiptText size={15} />,
      title: "Guardrails checked",
      copy: duplicateAttempt ? "A similar movement needs one more look." : "No similar movement was found.",
    },
  ];

  return (
    <div className="screen processing-screen">
      <div className="agent-phone-card" aria-live="polite">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco Agent AI Run</span>
            <b>Mini App</b>
          </div>
        </div>

        <div className="agent-bubble user">{command}</div>

        <div className={`agent-toast ${step >= 1 ? "show" : ""}`}>
          <ChocoMark size="tiny" />
          <span>{isSendNow ? "Send-now intent" : "Schedule intent"}</span>
        </div>

        <div className={`agent-plan ${step >= 1 ? "lift" : ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{isSendNow ? "One-time send" : "Scheduled payment"}</span>
            {done && confidencePct != null && (
              <span className={`sheet-chip ${chipTone}`}>{confidencePct}%</span>
            )}
          </div>
          <strong>{plan.amount} {plan.asset}</strong>
          <small>To {plan.recipient} - {getTimingLabel(plan)}</small>
        </div>

        <div className="agent-feed">
          {feed.map((item, index) => (
            <div className={`agent-line ${step > index ? "show" : ""}`} key={item.title}>
              <div className="agent-line-icon">{item.icon}</div>
              <div>
                <b>{item.title}</b>
                <span>{item.copy}</span>
              </div>
            </div>
          ))}
        </div>

        {done ? (
          <div className="agent-cta">
            <button className="primary-cta" type="button" onClick={onApprove}>
              {isSendNow ? <CircleDollarSign size={18} /> : <CalendarDays size={18} />}
              Looks right
            </button>
            <button className="secondary-dark" type="button" onClick={onEdit}>
              Edit instruction
            </button>
          </div>
        ) : (
          <div className="agent-next">{duplicateAttempt ? "Opening safety review" : "Reviewing your instruction…"}</div>
        )}
      </div>
    </div>
  );
}
