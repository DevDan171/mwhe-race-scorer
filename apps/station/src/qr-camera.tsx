import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

import { ensureCamera } from "./keep-awake";

export function QrCamera({
  onCode,
  onClose,
}: {
  onCode: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    let last = "";

    void (async () => {
      try {
        await ensureCamera();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || stop) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const tick = () => {
          if (stop || !videoRef.current || !context) return;
          const current = videoRef.current;
          if (current.readyState >= 2 && current.videoWidth > 0) {
            canvas.width = current.videoWidth;
            canvas.height = current.videoHeight;
            context.drawImage(current, 0, 0);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data && code.data !== last) {
              last = code.data;
              onCodeRef.current(code.data);
            }
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        if (!stop) {
          setError("The camera did not start. Paste the code instead.");
        }
      }
    })();

    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section className="sheet">
      <header className="sheet-bar">
        <h2>Point at the code</h2>
        <button type="button" className="key ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {error ? <p className="banner warn">{error}</p> : null}
      <video ref={videoRef} className="camera" muted playsInline />
    </section>
  );
}
