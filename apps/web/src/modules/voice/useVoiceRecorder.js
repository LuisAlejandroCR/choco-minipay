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
import { normalizeVoiceTranscript } from "./voiceNormalize.js";

export function useVoiceRecorder({ onTranscript }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const speechRef = useRef(null);
  const hasSpeechSupport = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Clean up the recognition instance when the screen unmounts.
  useEffect(() => {
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, []);

  // Recording timer — increments every second while recording and not paused.
  useEffect(() => {
    if (!isRecording || isPaused) return undefined;
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
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
      onTranscript(normalizeVoiceTranscript(transcript.trim()));
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
    startRecording,
    cancelRecording,
    stopRecording,
    togglePause,
  };
}
