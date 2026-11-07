/* Temporary overlay for the stamp box. Not a route - it renders over the desk. */
function StampsOverlay({ onClose }) {
  return (
    <div className="house-desk__stamps-overlay">
      <div
        className="house-desk__stamps-card"
        role="dialog"
        aria-modal="true"
        aria-label="stamp collection"
      >
        <h2 className="house-desk__stamps-title">stamp collection</h2>

        <button
          type="button"
          className="house-desk__stamps-close"
          onClick={onClose} // give react the function, onClose={() => setStampsOpen(false)}, set to false? overlay closes
          aria-label="Close stamp collection"
        >
          x
        </button>
      </div>
    </div>
  );
}

export default StampsOverlay;