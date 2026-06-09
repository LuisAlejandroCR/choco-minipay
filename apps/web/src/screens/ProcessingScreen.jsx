import { Check, ReceiptText, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { getTimingLabel } from "../utils/planUtils.js";

// ProcessingScreen owns its animation-step timer so it does not cause full-tree
// re-renders from App root while the steps advance.
// onComplete is called after the final step delay — App uses it to navigate to
// "duplicateGuard" or "review" depending on duplicateAttempt.
export function ProcessingScreen({ plan, command, duplicateAttempt, onComplete }) {
  const [step, setStep] = useState(0);
  const isSendNow = plan.deliveryMode === "now";

  // Use a ref so the final timeout always calls the latest onComplete without
  // re-running the effect when onComplete changes reference between renders.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  // Run the step sequence once on mount; clean up if the screen unmounts early.
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(1), 320),
      window.setTimeout(() => setStep(2), 860),
      window.setTimeout(() => setStep(3), 1400),
      window.setTimeout(() => onCompleteRef.current(), 2450),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: run once on mount

  const feed = [
    {
      icon: <Check size={15} />,
      title: "Intent detected",
      copy: isSendNow ? "Text or voice becomes a one-time transfer." : "Text or voice becomes a scheduled transfer plan.",
    },
    {
      icon: <RefreshCw size={15} />,
      title: "Route prepared",
      copy: "USDC is quoted into KESm on Celo.",
    },
    {
      icon: <ReceiptText size={15} />,
      title: "Guardrails checked",
      copy: duplicateAttempt ? "Choco found a similar movement to review." : "No similar movement was found.",
    },
  ];

  return (
    <div className="screen processing-screen">
      <div className="agent-phone-card" aria-live="polite">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco Agent AI run</span>
            <b>Mini App</b>
          </div>
        </div>

        <div className="agent-bubble user">{command}</div>

        <div className={`agent-toast ${step >= 1 ? "show" : ""}`}>
          <ChocoMark size="tiny" />
          <span>{isSendNow ? "Send-now intent" : "Schedule detected"}</span>
        </div>

        <div className={`agent-plan ${step >= 1 ? "lift" : ""}`}>
          <span>{isSendNow ? "Send once now" : "Scheduled transfer"}</span>
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

        <div className="agent-next">{duplicateAttempt ? "Opening Choco guardrail" : "Opening quote review"}</div>
      </div>
    </div>
  );
}
