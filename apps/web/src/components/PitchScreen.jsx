import { Mic, X } from "lucide-react";
import { WORLD_MAP_URL } from "../config/runtime.js";
import { pitchContent } from "../content/demoFlow.js";
import { ChocoMark } from "./ChocoMark.jsx";

export function PitchScreen({ onClose }) {
  return (
    <div className="screen pitch-screen">
      <button className="pitch-close" type="button" aria-label="Close intro" onClick={onClose}>
        <X size={18} strokeWidth={3} />
      </button>

      <section className="pitch-visual" aria-label={pitchContent.visualLabel}>
        <div className="mobile-world">
          <div className="globe-core" aria-hidden="true">
            <svg className="world-map" viewBox="0 0 360 180" role="img" aria-label={pitchContent.mapLabel}>
              <image
                className="map-base"
                href={WORLD_MAP_URL}
                x="0"
                y="0"
                width="360"
                height="180"
                preserveAspectRatio="xMidYMid meet"
              />
              <g className="map-country-label usa-map-label">
                <circle cx="82" cy="51" r="2.6" />
                <text x="86" y="49">{pitchContent.originLabel}</text>
              </g>
              <g className="map-country-label kenya-map-label">
                <circle cx="218" cy="90" r="2.6" />
                <text x="222" y="88">{pitchContent.destinationLabel}</text>
              </g>
            </svg>
          </div>

          <div className="route-person sender-person" aria-hidden="true">
            <svg className="person-svg sender-silhouette" viewBox="0 0 56 56" role="img">
              <g className="afro-hair">
                <circle cx="17" cy="20" r="9" />
                <circle cx="24" cy="13" r="10" />
                <circle cx="35" cy="13" r="10" />
                <circle cx="42" cy="22" r="9" />
                <circle cx="29" cy="23" r="13" />
              </g>
              <circle className="person-fill" cx="29" cy="27" r="9" />
              <g className="talk-mouth">
                <ellipse className="talk-mouth-open" cx="29" cy="31" rx="3.3" ry="2.2" />
                <path className="talk-mouth-line" d="M25 30 C28 32 32 32 35 30" />
              </g>
              <path className="person-fill" d="M13 54 C15 42 21 36 29 36 C37 36 43 42 45 54 Z" />
              <path className="voice-mark" d="M45 22 C49 26 50 31 49 36" />
            </svg>
          </div>

          <div className="route-person recipient-person" aria-hidden="true">
            <svg className="person-svg recipient-silhouette" viewBox="0 0 64 64" role="img">
              <circle className="recipient-badge" cx="32" cy="32" r="25" />
              <path
                className="recipient-hair-fill"
                d="M32 8 C44 8 52 17 52 30 C52 38 57 45 54 56 C49 58 44 57 40 53 C42 46 42 39 40 33 C37 37 34 39 32 39 C29 39 26 37 24 33 C22 39 22 46 24 53 C20 57 15 58 10 56 C7 45 12 38 12 30 C12 17 20 8 32 8 Z"
              />
              <ellipse className="recipient-face-fill" cx="32" cy="28" rx="9" ry="10" />
              <path className="recipient-body-fill" d="M18 57 C20 47 26 42 32 42 C38 42 44 47 46 57 Z" />
              <path className="recipient-hair-line" d="M23 28 C27 32 35 32 39 28" />
              <path className="recipient-part-line" d="M32 12 C29 18 27 22 24 25" />
            </svg>
          </div>

          <div className="transfer-bundle" aria-hidden="true">
            <span className="choco-dollar-token">
              <ChocoMark size="tiny" />
              <span>$</span>
            </span>
            <span className="voice-note travel-chat">
              <span className="voice-note-mic"><Mic size={11} strokeWidth={3} /></span>
              <span className="voice-wave">
                <span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="pitch-copy">
        <span className="pitch-kicker">{pitchContent.kicker}</span>
        <h1>
          {pitchContent.headlinePrefix}{" "}
          <span className="voice-highlight">
            <span>{pitchContent.headlineEmphasis}</span>
            <span className="headline-wave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </span>
          .
        </h1>
        <p className="pitch-memory">{pitchContent.memory}</p>
        <p className="pitch-support">{pitchContent.support}</p>
      </section>

      <button className="primary-cta" type="button" onClick={onClose}>{pitchContent.cta}</button>
    </div>
  );
}
