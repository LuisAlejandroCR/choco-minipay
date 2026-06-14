export function ChocoMark({ size = "large" }) {
  return (
    <div className={`choco-mark ${size}`} aria-label="Choco logo">
      <span className="cacao-shadow" />
      <span className="cacao-pod" />
      <span className="cacao-ridge ridge-a" />
      <span className="cacao-ridge ridge-b" />
      <span className="cacao-ridge ridge-c" />
      <span className="cacao-nib nib-a" />
      <span className="cacao-nib nib-b" />
    </div>
  );
}
