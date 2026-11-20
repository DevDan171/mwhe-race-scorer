import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrImage({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(text, {
      margin: 1,
      width: 280,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (!src) return <p className="hint">Preparing the code…</p>;
  return <img src={src} alt={label} width={280} height={280} />;
}
