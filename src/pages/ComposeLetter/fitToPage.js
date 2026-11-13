/* Font fitting for the letter paper.
   The letter is a textarea, and an off-screen mirror (`.compose__ruler`) is laid
   out with the same box and type. The mirror's scrollHeight is the height the
   text would really occupy, so the limit is measured instead of guessed from a
   character count. These helpers only read/write the DOM; React state stays in
   ComposeLetter.

   Fitting never removes text. When the content is too long for the current font
   size, the font shrinks. Once it cannot fit even at MIN_FONT_SIZE the page is
   full: `planEdit` drops the new input instead, so the paper never scrolls and
   the visible letter is always the complete letter. */

/* Slider bounds for the letter text size. */
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 40;

/* A saved letter opens at this size when it still fits. */
export const DEFAULT_FONT_SIZE = 18;

/* Would `candidate` fit the visible paper at `size`? Before the refs are
   attached there is nothing to measure, so the text is treated as fitting. */
export function measure(letter, ruler, candidate, size) {
  if (!letter || !ruler) return true;

  /* Mirror the textarea's own box so wrapped lines break at the same place. A
     scrollbar, if the textarea is already scrolling, reduces clientWidth, which
     is the space the text really has. */
  const styles = window.getComputedStyle(letter);

  ruler.style.width = `${letter.clientWidth || letter.getBoundingClientRect().width}px`;
  ruler.style.boxSizing = "border-box";
  ruler.style.fontFamily = styles.fontFamily;
  ruler.style.fontWeight = styles.fontWeight;
  ruler.style.fontStyle = styles.fontStyle;
  ruler.style.fontSize = `${size}px`;
  ruler.style.lineHeight = styles.lineHeight;
  ruler.style.letterSpacing = styles.letterSpacing;
  ruler.style.padding = styles.padding;
  ruler.style.whiteSpace = styles.whiteSpace;
  ruler.style.overflowWrap = styles.overflowWrap;
  ruler.style.wordBreak = styles.wordBreak;
  ruler.textContent = candidate;

  return ruler.scrollHeight <= letter.clientHeight;
}

/* Largest font size the complete content fits in. If even the smallest size
   overflows, the ceiling is MIN_FONT_SIZE and `overflowing` says so. Text height
   only grows as the font grows, so a binary search is safe. */
function fittingCeiling(letter, ruler, content) {
  if (measure(letter, ruler, content, MAX_FONT_SIZE)) {
    return { maxFontSize: MAX_FONT_SIZE, overflowing: false };
  }

  if (!measure(letter, ruler, content, MIN_FONT_SIZE)) {
    return { maxFontSize: MIN_FONT_SIZE, overflowing: true };
  }

  /* MIN_FONT_SIZE fits and MAX_FONT_SIZE does not, so the answer is in between. */
  let low = MIN_FONT_SIZE;
  let high = MAX_FONT_SIZE - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (measure(letter, ruler, content, middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return { maxFontSize: low, overflowing: false };
}

/* Result of an edit: keep the complete text and shrink the font only as much as
   needed to fit, never below MIN_FONT_SIZE. `maxFontSize` is recalculated from
   the complete text so the slider can never offer a size that would overflow. */
export function fitToPage(letter, ruler, candidate, requestedSize) {
  const requested = Math.min(
    Math.max(requestedSize, MIN_FONT_SIZE),
    MAX_FONT_SIZE,
  );
  const ceiling = fittingCeiling(letter, ruler, candidate);

  return {
    text: candidate,
    fontSize: Math.min(requested, ceiling.maxFontSize),
    maxFontSize: ceiling.maxFontSize,
    overflowing: ceiling.overflowing,
  };
}

/* Edit policy: accept a change only while the complete new text still fits at
   MIN_FONT_SIZE. Once the page is full, the change is dropped and the previous
   text is returned unchanged, so typing simply stops instead of overflowing.
   Shorter text is always accepted, which lets an over-capacity saved letter be
   deleted back down onto the page. */
export function planEdit(letter, ruler, currentText, candidate, requestedSize) {
  const fitted = fitToPage(letter, ruler, candidate, requestedSize);

  if (fitted.overflowing && candidate.length >= currentText.length) {
    return {
      accepted: false,
      text: currentText,
      fontSize: fitted.fontSize,
      maxFontSize: fitted.maxFontSize,
      overflowing: true,
    };
  }

  return { accepted: true, ...fitted };
}

/* Loaded letter: always keep the complete saved text and never trim it. Prefer
   the default size when it fits; otherwise fall back to the smallest size and
   report an overflow so the page can warn. */
export function fitLoadedLetter(letter, ruler, content) {
  const ceiling = fittingCeiling(letter, ruler, content);
  const fontSize =
    ceiling.maxFontSize >= DEFAULT_FONT_SIZE
      ? DEFAULT_FONT_SIZE
      : MIN_FONT_SIZE;

  return {
    text: content,
    fontSize,
    maxFontSize: ceiling.maxFontSize,
    overflowing: ceiling.overflowing,
  };
}
