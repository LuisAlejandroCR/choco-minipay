import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CalendarDays, CircleDollarSign, Mic, Trash2, X } from "lucide-react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { useVoiceRecorder } from "../modules/voice/useVoiceRecorder.js";
import { deliveryModes, formatDemoTime } from "../utils/planUtils.js";
import { planCreationReminder } from "../lib/scheduleNotices.js";

const FUNDING_REMINDER = planCreationReminder();

function ordinalDay(value) {
  const day = Number(value) || 1;
  if (day === 1) return "1st";
  if (day === 2) return "2nd";
  if (day === 3) return "3rd";
  return `${day}th`;
}

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
}) {
  const {
    isRecording,
    isPaused,
    recordingSeconds,
    voiceError,
    hasSpeechSupport,
    isVoiceBlocked,
    startRecording,
    cancelRecording,
    stopRecording,
    togglePause,
    clearVoiceError,
  } = useVoiceRecorder({ onTranscript: setCommand });

  const { t } = useTranslation();
  const [voiceWarn, setVoiceWarn] = useState(false);
  const warnTimer = useRef(null);
  const hasText = command.trim().length > 0;
  const title = mode === "update"
    ? t("editor.edit_plan")
    : deliveryMode === "now"
      ? t("editor.send_money")
      : t("editor.schedule_transfer");
  const agentDetection = agentIntent?.agent || agentIntent || {};
  const missing = agentIntent?.missing || agentDetection.missing || [];
  const confidence = Math.round((agentIntent?.confidence || agentDetection.confidence || 0) * 100);
  const isAgentReady = Boolean(agentIntent?.isReady);
  const recipientLabel = agentIntent?.recipientAlias || agentDetection.recipient?.label || "";
  const amountValue = agentIntent?.amountKes || agentDetection.amount?.value || 0;
  const currencyCode = agentIntent?.transferAsset || agentIntent?.destinationAsset || agentDetection.currency?.code || "";
  const timingMode = agentIntent?.deliveryMode || agentDetection.timing?.deliveryMode || deliveryMode;
  const timingDay = agentIntent?.dayOfMonth || agentDetection.timing?.dayOfMonth || 1;
  const timingSummary = timingMode === "now" ? "now" : `every ${ordinalDay(timingDay)}`;
  const readySummary = `${recipientLabel || "Recipient"} - ${Number(amountValue || 0).toLocaleString("en-US")} ${currencyCode || "asset"} - ${timingSummary}`;
  const composerPlaceholder = deliveryMode === "schedule"
    ? t("editor.placeholder_schedule")
    : t("editor.placeholder_now");

  // Auto-advance to review when Agent Choco has everything and is confident (>80%), so the user
  // doesn't have to tap again. Debounced, fires once per instruction, and never while recording.
  const onBuildRef = useRef(onBuild);
  onBuildRef.current = onBuild;
  const autoAdvancedRef = useRef("");
  useEffect(() => {
    const trimmed = command.trim();
    if (!isAgentReady || confidence <= 80 || !trimmed || isRecording) return undefined;
    if (autoAdvancedRef.current === trimmed) return undefined;
    const timer = setTimeout(() => {
      autoAdvancedRef.current = trimmed;
      void onBuildRef.current?.();
    }, 700);
    return () => clearTimeout(timer);
  }, [command, isAgentReady, confidence, isRecording]);

  function submitRecording() {
    stopRecording();
    if (command.trim()) void onBuild();
  }

  function submitComposer() {
    if (hasText) {
      void onBuild();
      return;
    }
    if (isVoiceBlocked) {
      setVoiceWarn(true);
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setVoiceWarn(false), 4000);
      return;
    }
    startRecording();
  }

  useEffect(() => () => clearTimeout(warnTimer.current), []);

  return (
    <div className="screen editor-screen">
      <section className="editor-card">
        <ChocoMark size="small" />
        <div>
          <span>{mode === "update" ? t("editor.edit_plan") : t("editor.new_transfer")}</span>
          <h2>{title}</h2>
          <p>{t("editor.tell_choco")}</p>
        </div>
      </section>

      <section className="timing-choice" aria-label="Transfer timing">
        <span className="timing-label">{t("editor.when")}</span>
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
            <button className="recorder-delete" type="button" aria-label={t("editor.discard")} onClick={cancelRecording}>
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
              aria-label={isPaused ? t("editor.resume") : t("editor.pause")}
              onClick={togglePause}
            >
              <i /><i />
            </button>
            <button className="recorder-send" type="button" aria-label={t("editor.use_voice")} onClick={submitRecording}>
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
              placeholder={composerPlaceholder}
              aria-label="Transfer instruction"
            />
            {hasText && (
              <button
                className="composer-clear"
                type="button"
                aria-label="Clear instruction"
                onClick={() => setCommand("")}
              >
                <X size={16} strokeWidth={2.8} />
              </button>
            )}
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

      {deliveryMode === "schedule" && (
        <section className="schedule-reminder" role="note" aria-label="How scheduled plans stay funded">
          <strong>{FUNDING_REMINDER.title}</strong>
          <span>{FUNDING_REMINDER.body}</span>
        </section>
      )}

      {statusMessage && (
        <div className="voice-error-banner" role="alert">
          <span>{statusMessage}</span>
        </div>
      )}

      {voiceWarn && (
        <div className="voice-error-banner voice-warn-banner" role="alert">
          <span>Voice is not available in this browser — type your instruction instead.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setVoiceWarn(false)}>✕</button>
        </div>
      )}

      {voiceError && (
        <div className="voice-error-banner" role="alert">
          <span>{voiceError}</span>
          <button type="button" aria-label="Dismiss" onClick={clearVoiceError}>✕</button>
        </div>
      )}
    </div>
  );
}
