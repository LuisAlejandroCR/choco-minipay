import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCanvas({ data, size = 132, className }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 0,
      color: { dark: "#050302", light: "#f6e8d4" },
    });
  }, [data, size]);

  return <canvas ref={canvasRef} className={className} aria-label="QR code" />;
}
