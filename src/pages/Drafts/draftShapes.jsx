/* The four hand-drawn paper outlines from public/assets/draft, inlined so the
   card can stretch them across its full box.

   They must be inline <svg> rather than <img>/background-image: the files have
   no preserveAspectRatio, so their default (xMidYMid meet) letterboxes the
   drawing inside the wider card and it renders as a small shape in the middle.
   preserveAspectRatio is not settable from CSS or from an <img>, so the only way
   to override it without editing the read-only assets is to own the <svg>.

   All four shapes are mapped onto one shared canvas (80 x 97, the size three of
   the four were drawn on). Each artwork is scaled UNIFORMLY to that canvas and
   centred, so the 82 x 99 shape keeps its proportions and every card's outline
   lines up with the others instead of being ~2% smaller and offset. Path data
   is copied verbatim from the asset files; the files are untouched. */

const CANVAS_WIDTH = 80;
const CANVAS_HEIGHT = 97;

const SHAPES = [
  {
    width: 80,
    height: 97,
    path: "M61 96.5L79.5 77V0.5H0.5V96.5H61ZM79.5 77H61V96.5",
  },
  {
    width: 80,
    height: 97,
    path: "M52 96.5L79.5 77V0.5H0.5V96.5H52ZM79.5 77H68.5L52 96.5",
  },
  {
    width: 80,
    height: 97,
    path: "M36.0301 96.5H13.3768C10.667 96.0934 6.36631 88.5948 3.48983 66.1842C1.6003 51.4629 0.325317 30.3071 0.519504 0.5H79.5V96.5H36.0301ZM3.48983 66.1842C9.43856 76.2895 24.2748 96.5 36.0301 96.5",
  },
  {
    width: 82,
    height: 99,
    path: "M64.0565 2.49619L80.2393 16.1397L81.4968 98.1116L0.508437 96.7384L2.14014 0.508423L33.9003 1.04696L64.0565 2.49619ZM80.2393 16.1397C75.9756 17.7786 65.8977 8.40982 64.0565 2.49619",
  },
];

/* Uniform scale only, so a fold never stretches; the leftover space is split
   evenly, which keeps the four outlines aligned to the same frame. */
function fitToCanvas(width, height) {
  const scale = Math.min(CANVAS_WIDTH / width, CANVAS_HEIGHT / height);
  const offsetX = (CANVAS_WIDTH - width * scale) / 2;
  const offsetY = (CANVAS_HEIGHT - height * scale) / 2;

  return `translate(${offsetX.toFixed(4)} ${offsetY.toFixed(4)}) scale(${scale.toFixed(5)})`;
}

/* A fresh shape on every mount: opening the shelf or returning to it rerolls
   each card instead of remembering one per draft. */
function randomShape() {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

/* width/height 100% with preserveAspectRatio="none" makes the shared canvas
   fill the card box exactly, so every card is framed edge to edge. The
   non-uniform box stretch would fatten strokes on one axis, so vector-effect
   keeps the outline at a steady width. */
function DraftShape() {
  const shape = randomShape();

  return (
    <svg
      className="drafts__card-shape"
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={fitToCanvas(shape.width, shape.height)}>
        <path
          d={shape.path}
          fill="none"
          stroke="black"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

export default DraftShape;
