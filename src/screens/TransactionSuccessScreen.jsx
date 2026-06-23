import { useEffect, useRef } from "react";

const CHOCO_COLORS = [
  "#3D1C02", "#5C2D0A", "#7B4A2B", "#9B6B3D",
  "#A0652A", "#C18B5A", "#C4853A", "#D4A04A",
  "#E8B96A", "#F5E6C8", "#EDD9A3",
];

const TOTAL = 2800;
const FADE_AT = 2000;

function runConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const particles = Array.from({ length: 50 }, () => ({
    x: Math.random() * canvas.width,
    y: -Math.random() * 120,
    size: Math.random() * 9 + 4,
    color: CHOCO_COLORS[Math.floor(Math.random() * CHOCO_COLORS.length)],
    speedX: (Math.random() - 0.5) * 2.5,
    speedY: Math.random() * 2.5 + 1.5,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 9,
    isSquare: Math.random() > 0.35,
    wide: Math.random() > 0.6 ? 2 : 1,
  }));

  const t0 = Date.now();
  let raf;

  function frame() {
    const elapsed = Date.now() - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const alpha = elapsed > FADE_AT
      ? Math.max(0, 1 - (elapsed - FADE_AT) / (TOTAL - FADE_AT))
      : 1;

    particles.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.rotSpeed;
      // Fall once, top -> down (no recycle), so it's a single gentle drop rather than a dense shower.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.isSquare) {
        ctx.fillRect((-p.size * p.wide) / 2, -p.size / 2, p.size * p.wide, p.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    if (elapsed < TOTAL) {
      raf = requestAnimationFrame(frame);
    }
  }

  frame();
  return () => cancelAnimationFrame(raf);
}

// Pure celebration: only the confetti effect — same Choco colors + shapes as the wallet's native
// success screen — played over whatever screen is already showing (the receipt the user just landed
// on). No backdrop, no card, no buttons, no text: nothing for the user to read or dismiss. It clears
// itself when the fall ends (onDone), so it never blocks the receipt underneath.
export function TransactionSuccessScreen({ onDone }) {
  const canvasRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stop = canvas ? runConfetti(canvas) : undefined;
    const timer = setTimeout(() => onDoneRef.current?.(), TOTAL + 100);
    return () => {
      stop?.();
      clearTimeout(timer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 250,
      }}
    />
  );
}
