import { useCallback, useEffect, useRef, useState } from "react";
import ReactSignatureCanvas from "react-signature-canvas";

import "./SignaturePad.css";

/* react-signature-canvas ships a UMD build whose CJS export is
   { default: Component }; normalize it for Vite's interop. */
const SignatureCanvas =
  ReactSignatureCanvas?.default?.default ??
  ReactSignatureCanvas?.default ??
  ReactSignatureCanvas;

/* signature_pad defaults to 0.5-2.5px. A lower ceiling keeps the pen line
   delicate at normal drawing speed. */
const SIGNATURE_MIN_WIDTH = 0.4;
const SIGNATURE_MAX_WIDTH = 1.4;

/* A small transparent drawing pad. The parent owns the PNG data URL so the
   compose recovery buffer can restore it after a reload and the autosave queue
   can upload it. */
function SignaturePad({ initialData = null, onChange, className = "" }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const restoredRef = useRef(false);
  const dataUrlRef = useRef(initialData);
  const onChangeRef = useRef(onChange);
  const [hasSignature, setHasSignature] = useState(Boolean(initialData));

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  /* Restore once after the canvas has mounted and been sized by the library. */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (!initialData || !canvasRef.current) return;

    canvasRef.current.fromDataURL(initialData);
  }, [initialData]);

  /* react-signature-canvas clears on window resize by default. Instead, keep
     the bitmap matched to the CSS box and redraw the existing image scaled to
     the new size. */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;

    let frame = null;

    function resize() {
      const canvas = canvasRef.current;
      const element = canvas?.getCanvas();
      if (!canvas || !element) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = element.offsetWidth;
      const height = element.offsetHeight;

      if (!width || !height) return;

      const nextWidth = Math.round(width * ratio);
      const nextHeight = Math.round(height * ratio);

      if (element.width === nextWidth && element.height === nextHeight) {
        return;
      }

      const dataUrl = dataUrlRef.current;

      element.width = nextWidth;
      element.height = nextHeight;

      const context = element.getContext("2d");
      if (context) context.scale(ratio, ratio);

      canvas.clear();

      if (dataUrl) {
        canvas.fromDataURL(dataUrl, { width, height });
      }

      setHasSignature(Boolean(dataUrl));
    }

    const observer = new ResizeObserver(() => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });

    observer.observe(box);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const handleBegin = useCallback(() => {
    setHasSignature(true);
  }, []);

  const handleEnd = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const empty = canvas.isEmpty();
    const dataUrl = empty ? null : canvas.toDataURL("image/png");

    dataUrlRef.current = dataUrl;
    setHasSignature(!empty);
    onChangeRef.current?.(dataUrl);
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.clear();
    dataUrlRef.current = null;
    setHasSignature(false);
    onChangeRef.current?.(null);
  }

  return (
    <div
      className={`signature-pad ${className}`.trim()}
      data-signed={hasSignature}
    >
      {hasSignature && (
        <button
          type="button"
          className="signature-pad__clear"
          aria-label="Clear signature"
          onClick={clear}
        >
          clear
        </button>
      )}

      <div className="signature-pad__box" ref={boxRef}>
        <SignatureCanvas
          ref={canvasRef}
          penColor="#000"
          backgroundColor="rgba(0,0,0,0)"
          minWidth={SIGNATURE_MIN_WIDTH}
          maxWidth={SIGNATURE_MAX_WIDTH}
          clearOnResize={false}
          canvasProps={{
            className: "signature-pad__canvas",
            "aria-label": "Signature drawing area",
          }}
          onBegin={handleBegin}
          onEnd={handleEnd}
        />

        {!hasSignature && (
          <span className="signature-pad__placeholder" aria-hidden="true">
            sign here
          </span>
        )}
      </div>
    </div>
  );
}

export default SignaturePad;
