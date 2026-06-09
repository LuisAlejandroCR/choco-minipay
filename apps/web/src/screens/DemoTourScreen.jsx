import { ArrowLeft, ArrowRight } from "lucide-react";
import { DemoVisual } from "../components/DemoVisual.jsx";
import { DEMO_TOTAL_SECONDS, demoSteps } from "../content/demoFlow.js";
import { formatDemoTime } from "../utils/planUtils.js";

export function DemoTourScreen({ step, elapsedSeconds, onSkip, onPrevious, onNext, onFinish }) {
  const currentStep = demoSteps[step];
  const isLastStep = step === demoSteps.length - 1;
  const progress = `${((step + 1) / demoSteps.length) * 100}%`;

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
          onClick={onPrevious}
        >
          <ArrowLeft size={18} />
        </button>
        <span>{step + 1}/{demoSteps.length}</span>
        <button
          className="demo-square-button"
          type="button"
          aria-label={isLastStep ? "Finish demo" : "Next demo step"}
          onClick={isLastStep ? onFinish : onNext}
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
        <button className="primary-cta" type="button" onClick={isLastStep ? onFinish : onNext}>
          {isLastStep ? "Finish demo" : "Next"}
        </button>
      </div>
    </div>
  );
}
