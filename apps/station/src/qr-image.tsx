import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrImage({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(text, { margin: 1, width: 280, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError("This code could not be drawn. Copy the text instead.");
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (error) return <p className="banner warn">{error}</p>;
  if (!src) return <p>Making the code…</p>;
  return <img className="qr" alt="QR code" src={src} width={280} height={280} />;
}
