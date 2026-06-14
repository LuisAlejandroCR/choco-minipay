import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DemoVisual } from "../components/DemoVisual.jsx";
import {
  DEMO_STEP_MS,
  DEMO_TOTAL_SECONDS,
  demoSteps,
} from "../content/demoFlow.js";
import { formatDemoTime } from "../utils/planUtils.js";

// DemoTourScreen owns its own step and elapsed-seconds state so the demo timer
// interval does not cause full-tree re-renders from App root every second.
// onSkip / onFinish are the only App-level callbacks needed.
export function DemoTourScreen({ onSkip, onFinish }) {
  const [step, setStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const currentStep = demoSteps[step];
  const isLastStep = step === demoSteps.length - 1;
  const progress = `${((step + 1) / demoSteps.length) * 100}%`;

  // Use a ref so the auto-advance effect always calls the latest onFinish without
  // adding it to the dependency array (which would reset the timeout on every
  // App render since onFinish is a new arrow function each time).
  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; });

  // Elapsed timer — increments every second while the screen is mounted.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-advance: move to the next step after DEMO_STEP_MS, or finish if on the last.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (step === demoSteps.length - 1) {
        onFinishRef.current();
        return;
      }
      setStep((s) => Math.min(s + 1, demoSteps.length - 1));
    }, DEMO_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step]);

  function handlePrevious() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleNext() {
    if (isLastStep) {
      onFinishRef.current();
      return;
    }
    setStep((s) => Math.min(s + 1, demoSteps.length - 1));
  }

  return (
    <div className="screen demo-tour-screen">
      <div className="demo-tour-top">
        <div>
          <span>{DEMO_TOTAL_SECONDS} second tour</span>
          <time dateTime={`PT${elapsedSeconds}S`}>{formatDemoTime(elapsedSeconds)} spent</time>
        </div>
        <button type="button" onClick={onSkip}>Skip</button>
      </div>

      <div className="demo-progress" aria-label="Demo progress">
        <span style={{ width: progress }} />
      </div>

      <div className="demo-step-controls" aria-label="Demo step controls">
        <button
          className="demo-square-button"
          type="button"
          aria-label="Previous demo step"
          disabled={step === 0}
          onClick={handlePrevious}
        >
          <ArrowLeft size={18} />
        </button>
        <span>{step + 1}/{demoSteps.length}</span>
        <button
          className="demo-square-button"
          type="button"
          aria-label={isLastStep ? "Finish demo" : "Next demo step"}
          onClick={handleNext}
        >
          <ArrowRight size={18} />
        </button>
      </div>

      <section className="demo-tour-card">
        <span>Step {step + 1} of {demoSteps.length}</span>
        <h2>{currentStep.title}</h2>
        <p>{currentStep.copy}</p>
        <DemoVisual step={step} />
      </section>

      <div className="demo-tour-actions">
        <button className="secondary-dark" type="button" onClick={onSkip}>Skip demo</button>
        <button className="primary-cta" type="button" onClick={handleNext}>
          {isLastStep ? "Finish demo" : "Next"}
        </button>
      </div>
    </div>
  );
}
