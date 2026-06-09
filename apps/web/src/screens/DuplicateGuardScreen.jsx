import { ChocoMark } from "../components/ChocoMark.jsx";
import { getTimingLabel } from "../utils/planUtils.js";

export function DuplicateGuardScreen({ plan, match, onEdit, onProceed }) {
  const isSendNow = plan.deliveryMode === "now";

  return (
    <div className="screen duplicate-guard-screen">
      <section className="agent-guard-card">
        <div className="agent-phone-head">
          <ChocoMark size="small" />
          <div>
            <span>Choco Agent AI</span>
            <b>Repeat check</b>
          </div>
        </div>

        <div className="agent-bubble choco">
          {isSendNow
            ? `Similar transfer found for ${plan.recipient}. You already sent ${match.amount} ${match.asset} on ${match.date}.`
            : `Similar plan already exists for ${plan.recipient}. Open it instead of creating a duplicate.`}
        </div>

        <div className="guard-summary">
          <span>{isSendNow ? "Last send" : "Existing plan"}</span>
          <strong>{match.amount} {match.asset}</strong>
          <small>{getTimingLabel(match)}</small>
        </div>

        <button className="primary-cta" type="button" onClick={onProceed}>
          {isSendNow ? "Send again" : "Open existing plan"}
        </button>
        <button className="secondary-dark" type="button" onClick={onEdit}>Edit instruction</button>
      </section>
    </div>
  );
}
