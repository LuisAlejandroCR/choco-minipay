import {
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  Share2,
} from "lucide-react";
import { defaultPlan } from "../data/testnetScenario.js";
import { ChocoMark } from "./ChocoMark.jsx";

function shortSchedule(schedule) {
  return String(schedule || "").replace(/\s-\s\d{1,2}:\d{2}\s[AP]M$/i, "");
}

function PreviewDetailLine({ label, value }) {
  return (
    <div className="detail-line">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function DemoVisual({ step }) {
  if (step === 0) {
    return (
      <div className="demo-visual home-preview">
        <button type="button"><CircleDollarSign size={17} />New transfer<span>Voice or text</span></button>
        <div className="mini-plan-row">
          <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
          <div><b>{defaultPlan.recipient} </b><span>{defaultPlan.amount} {defaultPlan.asset} - {shortSchedule(defaultPlan.schedule)}</span></div>
          <small>{defaultPlan.status}</small>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="demo-visual timing-preview">
        <button className="active" type="button"><CircleDollarSign size={18} />Send now<span>One-time</span></button>
        <button type="button"><CalendarDays size={18} />Schedule<span>Repeat</span></button>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="demo-visual duplicate-preview">
        <div className="agent-toast show">
          <ChocoMark size="tiny" />
          <span>Choco Agent AI</span>
        </div>
        <p>Similar plan already exists for {defaultPlan.recipient}. Open it instead of creating a duplicate.</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="demo-visual details-preview">
        <div className="mini-plan-row">
          <div className="plan-row-icon"><ChocoMark size="tiny" /></div>
          <div><b>{defaultPlan.recipient} </b><span>{defaultPlan.amount} {defaultPlan.asset}</span></div>
          <small>{defaultPlan.status}</small>
        </div>
        <PreviewDetailLine label="Timing" value={shortSchedule(defaultPlan.schedule)} />
        <PreviewDetailLine label="Route" value={`${defaultPlan.payAsset} to ${defaultPlan.asset}`} />
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="demo-visual verify-preview">
        <div className="mini-qr" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div>
          <b>Verify receipt</b>
          <span>QR + explorer link</span>
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="demo-visual share-preview">
        <label><Share2 size={16} />Share receipt</label>
        <label><ExternalLink size={16} />Open explorer</label>
      </div>
    );
  }

  return (
    <div className="demo-visual saved-plan" />
  );
}
