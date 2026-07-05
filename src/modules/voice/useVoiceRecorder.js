// useVoiceRecorder — encapsulates the full SpeechRecognition lifecycle.
//
// Responsibilities:
//   - Create and manage a SpeechRecognition instance (auto-restarts on Safari
//     silence timeout using the speechRef identity check).
//   - Run the recording timer (increments each second while recording and unpaused).
//   - Normalize raw transcripts via normalizeVoiceTranscript before passing them
//     to the caller's onTranscript callback.
//   - Surface voice errors inline (permission denied, no mic, network, etc.).
//
// The hook does NOT know about the command string or the buildPlan flow —
// those stay in the screen component. After stopRecording() the caller decides
// whether to proceed (e.g. call onBuild() if the command is non-empty).
import { useEffect, useRef, useState } from "react";
import { isMiniPay } from "../../lib/celo.js";
import { normalizeVoiceTranscript } from "./voiceNormalize.js";

// Use device locale so Spanish-speaking users get es-* speech recognition automatically.
// Constrain to supported languages; fall back to en-US for anything else.
const SUPPORTED_LANGS = /^(en|es|pt)\b/i;
function resolveRecognitionLang() {
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return SUPPORTED_LANGS.test(nav) ? nav : "en-US";
}

export function useVoiceRecorder({ onTranscript, maxSeconds = 6 }) {
  const lang = resolveRecognitionLang();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  // MiniPay WebView blocks the Speech Recognition service at the browser level
  // (fires service-not-allowed). Detect upfront so the mic button starts disabled.
  const [isVoiceBlocked, setIsVoiceBlocked] = useState(() => isMiniPay());
  const speechRef = useRef(null);
  const hasSpeechSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Clean up the recognition instance when the screen unmounts.
  useEffect(() => {
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, []);

  // Auto-clear voice errors after 7 s so they don't linger when the user
  // switches to typing. 7 s is enough time to read the message without it
  // blocking the screen indefinitely on desktop or non-MiniPay browsers.
  useEffect(() => {
    if (!voiceError) return undefined;
    const timer = window.setTimeout(() => setVoiceError(""), 7000);
    return () => window.clearTimeout(timer);
  }, [voiceError]);

  // Recording timer — increments every second while recording and not paused.
  useEffect(() => {
    if (!isRecording || isPaused) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPaused, isRecording]);

  // Hard cap on recording length so Agent Choco receives a concise instruction instead of a
  // rambling transcript that is slow/expensive to parse. Auto-stops at maxSeconds; the captured
  // text stays in the input for the user to review and send.
  useEffect(() => {
    if (!isRecording || isPaused) return;
    if (recordingSeconds >= maxSeconds) stopRecording();
  }, [recordingSeconds, isRecording, isPaused, maxSeconds]);

  function startRecording() {
    setRecordingSeconds(0);
    setIsPaused(false);
    setVoiceError("");

    if (!hasSpeechSupport) {
      setVoiceError("Voice input is not available in this browser. Type your message instead.");
      setIsVoiceBlocked(true);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onTranscript(normalizeVoiceTranscript(transcript.trim(), lang));
    };

    // no-speech fires on silence timeout — not a real failure.
    // Let onend handle the restart rather than surfacing an error.
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      const msg =
        event.error === "not-allowed"
          ? "Microphone access was denied."
          : event.error === "network"
            ? "Voice requires an internet connection."
            : event.error === "audio-capture"
              ? "No microphone found. Connect a mic or type instead."
              : event.error === "service-not-allowed"
                ? "Voice is blocked in this browser context."
                : "Voice input failed. Type your message instead.";
      setVoiceError(msg);
      if (event.error === "service-not-allowed") setIsVoiceBlocked(true);
      const rec = speechRef.current;
      speechRef.current = null;
      rec?.stop();
      setIsRecording(false);
      setIsPaused(false);
      setRecordingSeconds(0);
    };

    // cancelRecording / stopRecording null speechRef before calling stop().
    // If onend fires after that, speechRef no longer points to this instance →
    // intentional stop → skip the restart.
    // If speechRef still points here → browser auto-stopped (Safari silence timeout)
    // → restart to stay live.
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

  // Stop recognition and reset state. The caller decides whether to proceed
  // (e.g. call onBuild() if the accumulated command is non-empty).
  function stopRecording() {
    const rec = speechRef.current;
    speechRef.current = null;
    rec?.stop();
    setIsRecording(false);
    setIsPaused(false);
    setRecordingSeconds(0);
  }

  function togglePause() {
    setIsPaused((paused) => !paused);
  }

  return {
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
    clearVoiceError: () => setVoiceError(""),
  };
}
