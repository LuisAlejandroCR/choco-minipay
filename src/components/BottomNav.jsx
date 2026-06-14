import { History, ListChecks, Wallet } from "lucide-react";

export function BottomNav({ active, onHome, onPlans, onHistory }) {
  return (
    <nav className="bottom-nav" aria-label="Mini App navigation">
      <button className={active === "home" ? "active" : ""} type="button" onClick={onHome}><Wallet size={20} />Home</button>
      <button className={active === "plans" ? "active" : ""} type="button" onClick={onPlans}><ListChecks size={20} />Plans</button>
      <button className={active === "history" ? "active" : ""} type="button" onClick={onHistory}><History size={20} />History</button>
    </nav>
  );
}
