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
  } = useVoiceRecorder({ onTranscript: setCommand });

  const hasText = command.trim().length > 0;
  const title = mode === "update"
    ? "Update plan"
    : deliveryMode === "now"
      ? "Send money"
      : "Schedule transfer";

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
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasText) void onBuild();
              }}
              placeholder="Type a message"
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

      {voiceError && <p className="wallet-error">{voiceError}</p>}

      {mode === "update" ? (
        <button className="secondary-dark editor-home-button" type="button" onClick={onBack}>Back to plan</button>
      ) : (
        <button className="secondary-dark editor-home-button" type="button" onClick={onHome}>Back home</button>
      )}
    </div>
  );
}
