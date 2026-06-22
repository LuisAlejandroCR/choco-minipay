import { Bell, Check, Copy, ExternalLink, ListChecks, MessageCircleQuestionMark, ReceiptText, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import {
  infoPanels,
  publicReviewLinks,
  supportAboutContent,
} from "../content/reviewLinks.js";
import { LIVE_DEMO_URL } from "../config/runtime.js";
import { getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";

function ReportIssueAction({ reportHash }) {
  const [copied, setCopied] = useState(false);
  if (!isTransactionHash(reportHash)) return null;

  const details = `Choco transfer issue\nTransaction: ${reportHash}\nExplorer: ${getTransactionExplorerUrl(reportHash)}`;
  async function copyDetails() {
    try {
      await navigator.clipboard?.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="quick-info-report-actions">
      <button type="button" className="quick-info-copy" onClick={copyDetails}>
        <Copy size={15} /> {copied ? "Copied - open support" : "Copy issue details (with tx hash)"}
      </button>
      <a className="quick-info-support-link" href="/support.html">
        <MessageCircleQuestionMark size={15} /> Open support
      </a>
    </div>
  );
}

const infoPanelIcons = {
  future: Bell,
  support: MessageCircleQuestionMark,
};

const publicReviewIcons = {
  external: ExternalLink,
  privacy: ShieldCheck,
  stats: ListChecks,
  support: MessageCircleQuestionMark,
  terms: ReceiptText,
};

function getPublicReviewHref(link) {
  return link.href === "live-demo" ? LIVE_DEMO_URL : link.href;
}

function SupportAboutContent() {
  return (
    <div className="support-about">
      <section className="about-card" aria-label={supportAboutContent.label}>
        <div className="agent-badge">{supportAboutContent.badge}</div>
        <h3>{supportAboutContent.title}</h3>
        <p>{supportAboutContent.copy}</p>
      </section>

      <div className="support-link-grid" aria-label="Public review links">
        {publicReviewLinks.map((link) => {
          const Icon = publicReviewIcons[link.icon] || ExternalLink;
          const externalProps = link.external ? { target: "_blank", rel: "noreferrer" } : {};

          return (
            <a key={link.id} href={getPublicReviewHref(link)} {...externalProps}>
              <Icon size={17} />
              {link.label}
              <ExternalLink size={13} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function QuickInfoPanel({ type, onClose, reportHash = "", notices = [] }) {
  const panel = infoPanels[type] || infoPanels.support;
  const Icon = infoPanelIcons[panel.icon] || MessageCircleQuestionMark;

  return (
    <div className="quick-info-overlay" role="dialog" aria-label={panel.title}>
      <section className="quick-info-card">
        <div className="quick-info-head">
          <div className="quick-info-icon"><Icon size={22} strokeWidth={2.4} /></div>
          <div>
            <span>{panel.eyebrow}</span>
            <h2>{panel.title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={3} /></button>
        </div>
        <p>{panel.copy}</p>
        {/* Live plan alerts (funded / lock next run / top up) — derived from chain, newest concerns first. */}
        {type === "future" && notices.length > 0 && (
          <div className="bell-notices">
            {notices.map((n) => (
              <div key={n.id} className={`bell-notice tone-${n.tone}`}>
                <strong>{n.title}</strong>
                <span>{n.body}</span>
              </div>
            ))}
          </div>
        )}
        {/* Roadmap is kept visually separate from the live notifications above. */}
        {type === "future" && panel.roadmap && (
          <div className="quick-info-roadmap">
            <span className="quick-info-roadmap-eyebrow">{panel.roadmap.eyebrow}</span>
            <strong>{panel.roadmap.title}</strong>
            <div className="quick-info-list">
              {panel.roadmap.items.map((item) => (
                <div key={item}><Check size={15} /><span>{item}</span></div>
              ))}
            </div>
          </div>
        )}
        {/* On the report panel the copy action is the first, primary instruction. */}
        {type === "report" && <ReportIssueAction reportHash={reportHash} />}
        {panel.items.length > 0 && (
          <div className="quick-info-list">
            {panel.items.map((item) => (
              <div key={item}>
                <Check size={15} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}
        {type === "support" && <SupportAboutContent />}
      </section>
    </div>
  );
}
