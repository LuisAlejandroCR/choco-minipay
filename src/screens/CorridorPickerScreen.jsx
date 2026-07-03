import { Globe, Landmark, Wallet } from "lucide-react";

export function CorridorPickerScreen({ onSendToAfrica, onWithdrawToBank = null, onKeepAsUsdc }) {
  return (
    <div className="screen corridor-picker-screen">
      <div className="corridor-picker-inner">
        <div className="corridor-picker-header">
          <span className="corridor-kicker">What would you like to do?</span>
          <h2>Choose your destination</h2>
        </div>

        <div className="corridor-options">
          <button className="corridor-card primary" type="button" onClick={onSendToAfrica}>
            <div className="corridor-card-icon"><Globe size={24} /></div>
            <div className="corridor-card-body">
              <strong>Send money to Africa</strong>
              <span>Kenya · Nigeria · Ghana · South Africa</span>
            </div>
            <span className="corridor-card-arrow">→</span>
          </button>

          <button
            className={`corridor-card${!onWithdrawToBank ? " corridor-card-soon" : ""}`}
            type="button"
            onClick={onWithdrawToBank ?? undefined}
            disabled={!onWithdrawToBank}
          >
            <div className="corridor-card-icon"><Landmark size={24} /></div>
            <div className="corridor-card-body">
              <strong>Withdraw to my bank</strong>
              <span>Colombia · Brazil · Mexico</span>
            </div>
            {!onWithdrawToBank
              ? <span className="corridor-soon-badge">Soon</span>
              : <span className="corridor-card-arrow">→</span>
            }
          </button>

          <button className="corridor-card" type="button" onClick={onKeepAsUsdc}>
            <div className="corridor-card-icon"><Wallet size={24} /></div>
            <div className="corridor-card-body">
              <strong>Keep as USDC</strong>
              <span>Hold your balance in digital dollars</span>
            </div>
            <span className="corridor-card-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
