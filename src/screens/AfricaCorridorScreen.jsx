import { AFRICA_CORRIDORS } from "../lib/kotani.js";

// Sub-picker under "Send money to Africa". Kenya routes to the existing plan
// screen (the live ChocoGateway → KESm corridor); the Kotani-backed countries
// show as "Soon" until VITE_KOTANI_ENABLED flips on. Reuses the wtb-* styles
// so the look stays identical to the bank-withdrawal picker.
export function AfricaCorridorScreen({ onKenya, onCorridor = null, onBack }) {
  return (
    <div className="screen wtb-screen">
      <div className="wtb-inner">
        <div className="wtb-header">
          <span className="wtb-kicker">Send money to Africa</span>
          <h2>Where is your recipient?</h2>
          <p className="wtb-sub">
            Money arrives in local currency. You approve every transfer before it moves.
          </p>
        </div>
        <div className="wtb-options">
          {AFRICA_CORRIDORS.map((c) => (
            <button
              key={c.code}
              className="wtb-card"
              type="button"
              disabled={!c.live}
              onClick={c.native ? onKenya : (c.live && onCorridor ? () => onCorridor(c) : undefined)}
            >
              <span className="wtb-flag">{c.flag}</span>
              <div className="wtb-card-body">
                <strong>{c.label}</strong>
                <span>{c.currency} · {c.rail}</span>
              </div>
              {c.live
                ? <span className="wtb-arrow">→</span>
                : <span className="wtb-badge-beta">Soon</span>
              }
            </button>
          ))}
        </div>
        <button className="wtb-back-link" type="button" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  );
}
