import { useEffect, useRef, useState } from "react";

import "./LampTransition.css";

/* Every lamp animation in the app, keyed by the group that plays it. All
   frame paths live here, so moving or renaming an artwork folder is a
   one-line fix rather than a hunt through call sites. */
const FRAMES = {
  "read-house": [
    "/assets/letters/animation-read-house/desk-1.svg",
    "/assets/letters/animation-read-house/desk-2.svg",
    "/assets/letters/animation-read-house/desk-3.svg",
    "/assets/letters/animation-read-house/desk-4.svg",
  ],
  "write-post-office": [
    "/assets/post-office/animation-write-postoffice/pdesk-1.svg",
    "/assets/post-office/animation-write-postoffice/pdesk-2.svg",
    "/assets/post-office/animation-write-postoffice/pdesk-3.svg",
    "/assets/post-office/animation-write-postoffice/pdesk-1.svg",
  ],
};

/* Stable identity, so an unknown group does not change `list` every render. */
const NO_FRAMES = [];

/* Plays a short flipbook of SVG frames on top of the caller, then reports
   back. Every frame shares the artboard of the artwork it covers, so the
   transition lines up 1:1 with what is underneath.

   group picks one of the entries in FRAMES above; pass `frames` instead to
   play a bespoke set of URLs. frameInterval is the dwell time per frame in
   milliseconds -- lower values flicker faster. onComplete fires once the
   final frame has been on screen for a full interval. */
function LampTransition({
  play = false,
  group,
  frames,
  frameInterval = 140,
  onComplete,
}) {
  /* null means "a run is at its first frame"; numbers are offsets into
     `list`. The run rewinds itself on completion, so the next play always
     starts from the beginning. */
  const [frame, setFrame] = useState(null);

  const list = frames ?? FRAMES[group] ?? NO_FRAMES;

  /* Latest props, read from inside the timer so a fresh inline arrow or
     array on every render cannot restart the sequence. */
  const latest = useRef({ list, onComplete });

  useEffect(() => {
    latest.current = { list, onComplete };
  }, [list, onComplete]);

  /* Warm the image cache so no frame stalls the sequence when it starts. */
  useEffect(() => {
    list.forEach((src) => {
      const image = new Image();
      image.src = src;
    });
  }, [list]);

  /* One timer drives the whole flipbook: advance a frame per tick, and once
     the last frame has had its tick, finish. */
  useEffect(() => {
    if (!play) return undefined;

    const sources = latest.current.list;
    if (sources.length === 0) return undefined;

    let index = 0;

    const timer = setInterval(() => {
      index += 1;

      if (index < sources.length) {
        setFrame(index);
        return;
      }

      clearInterval(timer);
      setFrame(null);
      latest.current.onComplete?.();
    }, frameInterval);

    return () => clearInterval(timer);
  }, [play, frameInterval]);

  if (!play || list.length === 0) return null;

  const index = Math.min(frame ?? 0, list.length - 1);

  return (
    <div
      className="lamp-transition"
      style={{ backgroundImage: `url("${list[index]}")` }}
      aria-hidden="true"
    />
  );
}

export default LampTransition;