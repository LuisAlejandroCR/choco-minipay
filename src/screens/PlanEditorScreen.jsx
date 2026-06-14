import { ArrowRight, CalendarDays, CircleDollarSign, Mic, Trash2 } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { useVoiceRecorder } from "../modules/voice/useVoiceRecorder.js";
import { deliveryModes, formatDemoTime } from "../utils/planUtils.js";

export function PlanEditorScreen({
  mode,
  command,
  setCommand,
  deliveryMode,
  setDeliveryMode,
  agentIntent,
  statusMessage = "",
  onBuild,
  onHome,
  onBack = null,
}) {
  const {
    isRecording,
    isPaused,
    recordingSeconds,
    voiceError,
    hasSpeechSupport,
    startRecording,
    cancelRecording,
    stopRecording,
    togglePause,
    clearVoiceError,
  } = useVoiceRecorder({ onTranscript: setCommand });

  const hasText = command.trim().length > 0;
  const title = mode === "update"
    ? "Update plan"
    : deliveryMode === "now"
      ? "Send money"
      : "Schedule transfer";
  const agentDetection = agentIntent?.agent || agentIntent || {};
  const missing = agentIntent?.missing || agentDetection.missing || [];
  const confidence = Math.round((agentIntent?.confidence || agentDetection.confidence || 0) * 100);
  const isAgentReady = Boolean(agentIntent?.isReady);
  const recipientLabel = agentIntent?.recipientAlias || agentDetection.recipient?.label || "";
  const amountValue = agentIntent?.amountKes || agentDetection.amount?.value || 0;
  const currencyCode = agentIntent?.transferAsset || agentIntent?.destinationAsset || agentDetection.currency?.code || "";
  const timingMode = agentIntent?.deliveryMode || agentDetection.timing?.deliveryMode || deliveryMode;
  const timingDay = agentIntent?.dayOfMonth || agentDetection.timing?.dayOfMonth || 1;
  const readySummary = `${recipientLabel || "Recipient"} - ${Number(amountValue || 0).toLocaleString("en-US")} ${currencyCode || "asset"} - ${timingMode === "now" ? "now" : `every ${timingDay}`}`;

  function submitRecording() {
    stopRecording();
    if (command.trim()) void onBuild();
  }

  function submitComposer() {
    if (hasText) {
      void onBuild();
      return;
    }
    startRecording();
  }

  return (
    <div className="screen editor-screen">
      <section className="editor-card">
        <ChocoMark size="small" />
        <div>
          <span>{mode === "update" ? "Edit plan" : "New transfer"}</span>
          <h2>{title}</h2>
          <p>Tell Choco with text or voice.</p>
        </div>
      </section>

      <section className="timing-choice" aria-label="Transfer timing">
        <span className="timing-label">When?</span>
        <div className="timing-toggle">
          {Object.entries(deliveryModes).map(([modeId, item]) => (
            <button
              className={deliveryMode === modeId ? "active" : ""}
              type="button"
              key={modeId}
              onClick={() => setDeliveryMode(modeId)}
            >
              {modeId === "now" ? <CircleDollarSign size={19} /> : <CalendarDays size={19} />}
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="composer" aria-label="Command composer">
        {isRecording ? (
          <div className="voice-recorder" aria-live="polite">
            <button className="recorder-delete" type="button" aria-label="Discard recording" onClick={cancelRecording}>
              <Trash2 size={18} />
            </button>
            <span className={`record-dot ${isPaused ? "paused" : ""}`} />
            <time dateTime={`PT${recordingSeconds}S`}>{formatDemoTime(recordingSeconds)}</time>
            <div className={`recorder-wave ${isPaused ? "paused" : ""}`} aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
            </div>
            <button
              className={`pause-mark ${isPaused ? "paused" : ""}`}
              type="button"
              aria-label={isPaused ? "Resume recording" : "Pause recording"}
              onClick={togglePause}
            >
              <i /><i />
            </button>
            <button className="recorder-send" type="button" aria-label="Use voice note" onClick={submitRecording}>
              <ArrowRight size={24} strokeWidth={3} />
            </button>
          </div>
        ) : (
          <div className="composer-box">
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onFocus={clearVoiceError}
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasText) void onBuild();
              }}
              placeholder="Tell Agent Choco who, how much, and when"
              aria-label="Transfer instruction"
            />
            <button
              className={`composer-action ${hasText ? "send" : "mic"}`}
              type="button"
              aria-label={hasText ? "Review transfer" : "Record voice command"}
              onClick={submitComposer}
            >
              {hasText ? <ArrowRight size={24} strokeWidth={3} /> : <Mic size={20} strokeWidth={2.6} />}
            </button>
          </div>
        )}
      </section>

      <section className={`agent-intent-card ${isAgentReady ? "ready" : ""}`} aria-label="Agent Choco detection">
        <div>
          <span>Agent Choco</span>
          <b>{isAgentReady ? "Ready to review" : "Needs details"}</b>
        </div>
        <p>
          {isAgentReady
            ? readySummary
            : missing.length > 0
              ? `Missing: ${missing.join(", ")}`
              : "Type or speak a complete transfer instruction."}
        </p>
        <small>Confidence {confidence}%</small>
      </section>

      {statusMessage && (
        <div className="voice-error-banner" role="alert">
          <span>{statusMessage}</span>
        </div>
      )}

      {voiceError && (
        <div className="voice-error-banner" role="alert">
          <span>{voiceError}</span>
          <button type="button" aria-label="Dismiss" onClick={clearVoiceError}>✕</button>
        </div>
      )}

      {mode === "update" ? (
        <button className="secondary-dark editor-home-button" type="button" onClick={onBack}>Back to plan</button>
      ) : null}
    </div>
  );
}
