import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getTransactionExplorerUrl, isTransactionHash } from "../lib/transactions.js";

const CHOCO_COLORS = [
  "#3D1C02", "#5C2D0A", "#7B4A2B", "#9B6B3D",
  "#A0652A", "#C18B5A", "#C4853A", "#D4A04A",
  "#E8B96A", "#F5E6C8", "#EDD9A3",
];

function runConfetti(canvas, onDone) {
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const particles = Array.from({ length: 90 }, () => ({
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

  const TOTAL = 2800;
  const FADE_AT = 2000;
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
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
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
    } else {
      onDone?.();
    }
  }

  frame();
  return () => cancelAnimationFrame(raf);
}

export function TransactionSuccessScreen({ transaction, onViewDetails, onDismiss }) {
  const [shareState, setShareState] = useState("");
  const canvasRef = useRef(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const isSendNow = transaction.deliveryMode === "now";
  const amountLabel = `${transaction.amount} ${transaction.asset}`;
  const toLabel = transaction.recipient || "Recipient";
  const hasHash = isTransactionHash(transaction.hash);
  const receiptUrl = hasHash ? getTransactionExplorerUrl(transaction.hash) : "";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return runConfetti(canvas, () => onDismissRef.current?.());
  }, []);

  async function share() {
    const lines = [
      isSendNow ? `Choco sent ${amountLabel} to ${toLabel}` : `Choco saved a monthly ${amountLabel} plan to ${toLabel}`,
      `Status: ${transaction.status}`,
      `Date: ${transaction.date}`,
      hasHash ? `${isSendNow ? "Receipt" : "Plan transaction"}: ${receiptUrl}` : "",
    ].filter(Boolean);
    try {
      if (navigator.share) {
        await navigator.share({ title: isSendNow ? "Choco receipt" : "Choco plan", text: lines.join("\n") });
      } else {
        await navigator.clipboard?.writeText(lines.join("\n"));
      }
      setShareState("Shared");
    } catch {
      setShareState("Ready");
    }
  }

  return (
    <div
      className="success-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 201,
        }}
      />

      <div
        className="success-modal-card"
        style={{ position: "relative", zIndex: 202, width: "100%", maxWidth: 360 }}
      >
        <div className="success-badge">
          <Check size={40} strokeWidth={2.5} />
        </div>
        <h2 className="success-title">{isSendNow ? "Money sent" : "Plan saved"}</h2>
        <p className="success-amount">{isSendNow ? amountLabel : `Monthly ${amountLabel}`}</p>
        <p className="success-recipient">to {toLabel}</p>

        <div className="success-actions">
          <button className="primary-cta" type="button" onClick={onViewDetails}>
            <Check size={18} />
            {isSendNow ? "View movement details" : "Back to plans"}
          </button>
          <button className="secondary-dark" type="button" onClick={share}>
            <Share2 size={18} />
            {shareState ? `${shareState} ${isSendNow ? "receipt" : "plan"}` : isSendNow ? "Share receipt" : "Share plan"}
          </button>
          <button className="secondary-cta" type="button" onClick={onDismiss}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
