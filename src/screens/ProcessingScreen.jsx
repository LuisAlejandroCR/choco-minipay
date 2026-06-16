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
      window.setTimeout(() => setStep(1), 180),
      window.setTimeout(() => setStep(2), 520),
      window.setTimeout(() => setStep(3), 860),
      window.setTimeout(() => onCompleteRef.current(), 1280),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: run once on mount

  const feed = [
    {
      icon: <Check size={15} />,
      title: "Intent detected",
      copy: isSendNow ? "Recipient, amount, and asset are ready." : "Recipient, amount, asset, and date are ready.",
    },
    {
      icon: <RefreshCw size={15} />,
      title: "Route previewed",
      copy: "USDC stays in your wallet until you approve.",
    },
    {
      icon: <ReceiptText size={15} />,
      title: "Ready for signature",
      copy: duplicateAttempt ? "A similar movement needs one more look." : "Confirmation is ready for your wallet.",
    },
  ];

  return (
    <div className="screen processing-screen">
      <div className="agent-phone-card" aria-live="polite">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Agent Choco</span>
            <b>Checking details</b>
          </div>
        </div>

        <div className="agent-bubble user">{command}</div>

        <div className={`agent-toast ${step >= 1 ? "show" : ""}`}>
          <ChocoMark size="tiny" />
          <span>{isSendNow ? "Send now" : "Schedule"}</span>
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

        <div className="agent-next">{duplicateAttempt ? "Opening safety review" : "Opening confirmation"}</div>
      </div>
    </div>
  );
}
