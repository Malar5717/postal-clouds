import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ComposeLetter.css";

/* Slider bounds for the letter text size. */
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 40;

/* How long the "max length reached" toast stays up. */
const TOAST_MS = 2000;

/* Placeholder page. The signature canvas and persistence are still to come;
   back/next now navigate. */
function ComposeLetter() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(18);
  const [maxFontSize, setMaxFontSize] = useState(MAX_FONT_SIZE);
  const [showToast, setShowToast] = useState(false);

  const letterRef = useRef(null);
  const rulerRef = useRef(null);
  const toastTimer = useRef(null);
  /* Scroll offset to restore after a rejected input. */
  const keepScrollTop = useRef(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /* Rejected input puts the caret past the visible area, which scrolls the
     textarea and hides the first line even though the text is unchanged.
     Restoring the offset after the DOM settles puts the view back. */
  useLayoutEffect(() => {
    const letter = letterRef.current;
    if (!letter || keepScrollTop.current === null) return;

    letter.scrollTop = keepScrollTop.current;
    keepScrollTop.current = null;
  }, [text, fontSize]);

  /* Mirrors the letter text into an off-screen element that matches the
     textarea's box and type, so its height is what the text would really
     occupy. This measures the true limit instead of guessing a character
     count, and it re-measures on every change. */
  function measure(candidate, size) {
    const letter = letterRef.current;
    const ruler = rulerRef.current;
    if (!letter || !ruler) return true;

    ruler.style.fontSize = `${size}px`;
    ruler.style.width = `${letter.getBoundingClientRect().width}px`;
    ruler.textContent = candidate;

    return ruler.scrollHeight <= letter.clientHeight;
  }

  /* Largest leading slice of `candidate` that still fits the paper. Text
     height only grows with length, so a binary search is safe and keeps the
     number of layouts low even for a large paste. */
  function clampToFit(candidate, size) {
    if (measure(candidate, size)) return candidate;

    let low = 0;
    let high = candidate.length;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);

      if (measure(candidate.slice(0, middle), size)) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return candidate.slice(0, low);
  }

  /* Biggest font size, at or above the current one, that the given content
     still fits in. This is what caps the slider: rather than shrinking the
     letter to make a bigger font fit, the font is not allowed to grow. */
  function largestFittingSize(content, current) {
    if (measure(content, MAX_FONT_SIZE)) return MAX_FONT_SIZE;

    /* `current` is known to fit, so it is the lower bound. */
    let low = current;
    let high = MAX_FONT_SIZE;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);

      if (measure(content, middle)) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low;
  }

  /* Recomputes the ceiling after any change to the text or the font size,
     so the limit tracks what is actually on the paper right now. */
  function applyState(nextText, nextSize) {
    const size = nextSize ?? fontSize;
    const fitted = clampToFit(nextText, size);

    setText(fitted);
    setFontSize(size);
    setMaxFontSize(largestFittingSize(fitted, size));
  }

  function flashToast() {
    setShowToast(true);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), TOAST_MS);
  }

  /* Reject only the excess that was just added. Existing content is always
     a prefix that already fitted, so it is never removed. The toast fires
     only here, on a real attempt to exceed the limit. */
  function handleChange(event) {
    const candidate = event.target.value;

    if (measure(candidate, fontSize)) {
      applyState(candidate, fontSize);
      return;
    }

    /* Remember where the view was before the rejected keystroke moved it. */
    keepScrollTop.current = letterRef.current?.scrollTop ?? null;

    applyState(candidate, fontSize);
    flashToast();
  }

  /* A font size is only accepted if the letter still fits at that size.
     Sliding past the ceiling is simply held back; no text is touched. */
  function handleFontSizeChange(event) {
    const requested = Number(event.target.value);
    applyState(text, Math.min(requested, maxFontSize));
  }

  return (
    <main className="compose">
      <h1 className="compose__title">Compose Letter</h1>

      <div className="compose__frame">
        <div className="compose__paper">
          <button
            type="button"
            className="compose__back"
            onClick={() => navigate("/post-office")}
            aria-label="Back"
          >
            &lt;
          </button>

          <button
            type="button"
            className="compose__next"
            onClick={() => navigate("/post-office/post")}
            aria-label="Next"
          >
            &gt;
          </button>

          <textarea
            ref={letterRef}
            className="compose__letter"
            style={{ fontSize: `${fontSize}px` }}
            value={text}
            onChange={handleChange}
            placeholder="Write your letter…"
            aria-label="Letter"
            spellCheck="true"
          />

          {/* Signature canvas is not implemented yet; this reserves its
              corner. A drawing library will replace this element. */}
          <div className="compose__paper-foot">
            <div className="compose__signature" aria-hidden="true" />
          </div>
        </div>

        <input
          type="range"
          className="compose__size"
          min={MIN_FONT_SIZE}
          max={maxFontSize}
          step="1"
          value={fontSize}
          onChange={handleFontSizeChange}
          aria-label="Letter text size"
        />
      </div>

      {/* Off-screen copy of the letter, used only to measure text height. */}
      <div ref={rulerRef} className="compose__ruler" aria-hidden="true" />

      {showToast && (
        <p className="compose__toast" role="status">
          max length reached
        </p>
      )}
    </main>
  );
}

export default ComposeLetter;