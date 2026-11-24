import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  fitLoadedLetter,
  fitToPage,
  planEdit,
} from "./fitToPage.js";

/* The fitter reads the textarea's computed type and box, so provide the small
   slice of `window` it needs outside a browser. */
globalThis.window = {
  getComputedStyle() {
    return {
      fontFamily: '"Times New Roman", Times, serif',
      fontWeight: "400",
      fontStyle: "normal",
      lineHeight: "1.5",
      letterSpacing: "normal",
      padding: "0px",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      wordBreak: "normal",
    };
  },
};

const LINE_HEIGHT = 1.5;
const AVERAGE_CHARACTER_WIDTH = 0.5;

/* A deterministic stand-in for `.compose__ruler`: its height follows the width
   and font size that `measure` writes into its style, so the binary search is
   exercised without a real browser. */
function createRuler() {
  const style = {};
  let content = "";
  let measurements = 0;

  return {
    style,
    get textContent() {
      return content;
    },
    set textContent(value) {
      content = value;
    },
    get measurements() {
      return measurements;
    },
    get scrollHeight() {
      measurements += 1;

      const width = Number.parseFloat(style.width) || 1;
      const fontSize = Number.parseFloat(style.fontSize) || 1;
      const charsPerLine = Math.max(
        1,
        Math.floor(width / (fontSize * AVERAGE_CHARACTER_WIDTH)),
      );
      const lines =
        content.length === 0 ? 1 : Math.ceil(content.length / charsPerLine);

      return Math.ceil(lines * fontSize * LINE_HEIGHT);
    },
  };
}

function createLetter({ width = 100, height } = {}) {
  return {
    clientWidth: width,
    clientHeight: height,
    getBoundingClientRect() {
      return { width };
    },
  };
}

test("typing within capacity keeps every character and shrinks the font", () => {
  const ruler = createRuler();
  const letter = createLetter({ height: 200 });
  const current = "a".repeat(90);
  const candidate = "a".repeat(100);
  const edit = planEdit(letter, ruler, current, candidate, 20);

  assert.equal(edit.accepted, true);
  assert.equal(edit.text, candidate);
  assert.equal(edit.text.length, 100);
  assert.ok(edit.fontSize < 20, "font should shrink to fit");
  assert.ok(edit.fontSize >= MIN_FONT_SIZE);
  assert.equal(edit.overflowing, false);
});

test("typing beyond capacity is rejected and the letter is unchanged", () => {
  const ruler = createRuler();
  /* 80 characters is exactly five lines at 12px; one more needs a sixth. */
  const letter = createLetter({ height: 100 });
  const current = "a".repeat(80);
  const candidate = `${current}a`;
  const edit = planEdit(letter, ruler, current, candidate, 12);

  assert.equal(edit.accepted, false);
  assert.equal(edit.text, current);
  assert.equal(edit.text.length, 80);
  assert.equal(edit.overflowing, true);
});

test("typing stops at the limit instead of overflowing the paper", () => {
  const ruler = createRuler();
  const letter = createLetter({ height: 100 });
  let current = "";
  let size = 40;
  let stopped = false;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = `${current}a`;
    const edit = planEdit(letter, ruler, current, candidate, size);

    if (!edit.accepted) {
      assert.equal(edit.text, current, "a rejected edit keeps the old text");
      stopped = true;
      break;
    }

    current = edit.text;
    size = edit.fontSize;
  }

  assert.equal(stopped, true, "typing should eventually be rejected");
  assert.ok(current.length > 0);
  assert.ok(size >= MIN_FONT_SIZE);
});

test("a paste that does not fit is not partially applied", () => {
  const ruler = createRuler();
  const letter = createLetter({ height: 100 });
  const current = "a".repeat(10);
  const pasted = "b".repeat(300);
  const edit = planEdit(letter, ruler, current, pasted, 30);

  assert.equal(edit.accepted, false);
  assert.equal(edit.text, current);
  assert.ok(!edit.text.includes("b"));
});

test("maxFontSize is recalculated from the complete text", () => {
  const ruler = createRuler();
  const letter = createLetter({ height: 200 });
  const short = fitToPage(letter, ruler, "hello", MAX_FONT_SIZE);
  const long = fitToPage(letter, ruler, "a".repeat(100), MAX_FONT_SIZE);

  assert.equal(short.maxFontSize, MAX_FONT_SIZE);
  assert.ok(long.maxFontSize < short.maxFontSize);
  assert.ok(long.maxFontSize >= MIN_FONT_SIZE);
  assert.equal(long.fontSize, long.maxFontSize);
});

test("the minimum font size is respected", () => {
  const text = "a".repeat(300);
  const result = fitToPage(createLetter({ height: 100 }), createRuler(), text, 40);

  assert.equal(result.text, text);
  assert.equal(result.fontSize, MIN_FONT_SIZE);
  assert.equal(result.maxFontSize, MIN_FONT_SIZE);
  assert.equal(result.overflowing, true);
});

test("deleting from an over-capacity letter is accepted so it can be shortened", () => {
  const ruler = createRuler();
  const letter = createLetter({ height: 100 });
  const current = "a".repeat(300);
  const candidate = "a".repeat(299);
  const edit = planEdit(letter, ruler, current, candidate, MIN_FONT_SIZE);

  assert.equal(edit.accepted, true);
  assert.equal(edit.text, candidate);
  assert.equal(edit.text.length, 299);
  assert.equal(edit.overflowing, true);
});

test("a stored size that still fits needs only one measurement", () => {
  const ruler = createRuler();
  const text = "a".repeat(20);
  const result = fitLoadedLetter(
    createLetter({ height: 200 }),
    ruler,
    text,
    18,
  );

  assert.equal(result.text, text);
  assert.equal(result.fontSize, 18);
  assert.equal(result.maxFontSize, 18);
  assert.equal(result.overflowing, false);
  assert.equal(ruler.measurements, 1);
});

test("a stored size that no longer fits is clamped without trimming", () => {
  const text = "a".repeat(100);
  const result = fitLoadedLetter(
    createLetter({ height: 200 }),
    createRuler(),
    text,
    40,
  );

  assert.equal(result.text, text);
  assert.ok(result.fontSize < 40);
  assert.ok(result.fontSize >= MIN_FONT_SIZE);
  assert.ok(result.maxFontSize < 40);
  assert.equal(result.overflowing, false);
});

test("a stored size outside the slider bounds is clamped", () => {
  const result = fitLoadedLetter(
    createLetter({ height: 400 }),
    createRuler(),
    "hello",
    100,
  );

  assert.equal(result.fontSize, MAX_FONT_SIZE);
});

test("loaded letters keep the complete text and prefer the default size", () => {
  const text = "a".repeat(20);
  const result = fitLoadedLetter(
    createLetter({ height: 200 }),
    createRuler(),
    text,
  );

  assert.equal(result.text, text);
  assert.equal(result.fontSize, DEFAULT_FONT_SIZE);
  assert.equal(result.overflowing, false);
});

test("loaded letters fall back to the minimum size without trimming", () => {
  const text = "a".repeat(100);
  const result = fitLoadedLetter(
    createLetter({ height: 200 }),
    createRuler(),
    text,
  );

  assert.equal(result.text, text);
  assert.equal(result.fontSize, MIN_FONT_SIZE);
  assert.equal(result.overflowing, false);
});

test("loaded over-capacity letters keep their text and report overflow", () => {
  const text = "a".repeat(300);
  const result = fitLoadedLetter(
    createLetter({ height: 100 }),
    createRuler(),
    text,
  );

  assert.equal(result.text, text);
  assert.equal(result.text.length, 300);
  assert.equal(result.fontSize, MIN_FONT_SIZE);
  assert.equal(result.overflowing, true);
});
