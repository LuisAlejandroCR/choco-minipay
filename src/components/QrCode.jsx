import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCanvas({ data, size = 132, className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    QRCode.toCanvas(canvas, String(data), {
      width: size,
      margin: 0,
      color: { dark: "#050302", light: "#f6e8d4" },
    }).catch(() => {});
  }, [data, size]);

  return <canvas ref={canvasRef} className={className} aria-label="Receipt verification code" />;
}
