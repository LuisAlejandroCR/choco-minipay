import { ArrowRight, CalendarDays, CircleDollarSign, Mic, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChocoMark } from "../components/ChocoMark.jsx";
import { normalizeVoiceTranscript } from "../modules/voice/voiceNormalize.js";
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
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const speechRef = useRef(null);
  const hasSpeechSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasText = command.trim().length > 0;
  const title = mode === "update"
    ? "Update plan"
    : deliveryMode === "now"
      ? "Send money"
      : "Schedule transfer";

  useEffect(() => {
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isRecording || isPaused) return undefined;

    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPaused, isRecording]);

  function startRecording() {
    setRecordingSeconds(0);
    setIsPaused(false);
    setVoiceError("");

    if (!hasSpeechSupport) {
      setVoiceError("Voice input is not available in this browser. Type your message instead.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setCommand(normalizeVoiceTranscript(transcript.trim()));
    };

    // no-speech fires on silence timeout — not a real failure.
    // Let onend handle the restart rather than surfacing an error.
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      const msg = event.error === "not-allowed"
        ? "Microphone access was denied."
        : event.error === "network"
          ? "Voice requires an internet connection."
          : event.error === "audio-capture"
            ? "No microphone found. Connect a mic or type instead."
            : event.error === "service-not-allowed"
              ? "Voice is blocked in this browser context."
              : "Voice input failed. Type your message instead.";
      setVoiceError(msg);
      const rec = speechRef.current;
      speechRef.current = null;
      rec?.stop();
      setIsRecording(false);
      setIsPaused(false);
      setRecordingSeconds(0);
    };

    // cancelRecording / submitRecording null speechRef before calling stop(),
    // so if this fires and speechRef no longer points to this instance it was an
    // intentional stop — skip the restart. If speechRef still points here the
    // browser auto-stopped (Safari silence timeout) — restart to stay live.
    recognition.onend = () => {
      if (speechRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          speechRef.current = null;
          setIsRecording(false);
          setIsPaused(false);
          setRecordingSeconds(0);
        }
      }
    };

    speechRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function cancelRecording() {
    const rec = speechRef.current;
    speechRef.current = null;
    rec?.stop();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
  }

  function submitRecording() {
    const rec = speechRef.current;
    speechRef.current = null;
    rec?.stop();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
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
              onClick={() => setIsPaused((paused) => !paused)}
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
