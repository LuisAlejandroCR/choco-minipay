import { Bell, Check, ExternalLink, ListChecks, MessageCircleQuestionMark, ReceiptText, ShieldCheck, X } from "lucide-react";
import {
  infoPanels,
  publicReviewLinks,
  supportAboutContent,
} from "../content/reviewLinks.js";
import { LIVE_DEMO_URL } from "../config/runtime.js";

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

export function QuickInfoPanel({ type, onClose }) {
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
        {(type === "support" || type === "report") && <SupportAboutContent />}
      </section>
    </div>
  );
}
