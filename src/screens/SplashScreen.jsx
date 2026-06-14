import { ChocoMark } from "../components/ChocoMark.jsx";

export function SplashScreen({ onStart }) {
  return (
    <button className="screen splash-screen" type="button" onClick={onStart} aria-label="Open Choco">
      <ChocoMark />
      <div className="splash-footer">
        <b>Built by Choco</b>
        <span>Remittance concierge for MiniPay</span>
      </div>
    </button>
  );
}
