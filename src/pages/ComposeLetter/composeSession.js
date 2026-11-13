/* Per-user, per-draft, per-tab recovery buffer. Supabase is the durable copy
   for title/text/signature URL; the local PNG keeps the signature recoverable
   across a reload before the upload finishes. Saved drafts use it only while
   being edited: reopening always ignores it in favour of the row. `null` is
   the key for a not-yet-created draft, so opening another draft cannot
   overwrite an unsaved new letter. */
function composeBufferKey(userId, draftId) {
  return `postal-clouds:compose:${userId}:${draftId ?? "new"}`;
}

/* Drafts whose first save is queued or in flight. The `new` buffer is only
   cleared when that insert resolves, so a fresh composer opened in the
   meantime would read it and restore a letter that is already becoming a
   draft. Keep this in memory, not storage: a reload clears it, which is what
   lets reload recovery still work. */
let pendingDraftCreations = 0;

/* Call just before an insert is queued. The returned settle function runs at
   most once, when that insert resolves or fails. */
export function markDraftCreation() {
  pendingDraftCreations += 1;
  let settled = false;

  return () => {
    if (settled) return;

    settled = true;
    pendingDraftCreations = Math.max(0, pendingDraftCreations - 1);
  };
}

export function readComposeBuffer(userId, routeDraftId) {
  if (!userId) return null;

  /* A saved draft always opens at its durable version. Edits left in the
     local buffer by an earlier editing session were never written to
     Supabase, so restoring them would resurrect work the user discarded. */
  if (routeDraftId) return null;

  try {
    const raw = window.sessionStorage.getItem(composeBufferKey(userId, null));
    if (!raw) return null;

    const buffer = JSON.parse(raw);
    if (
      !buffer ||
      typeof buffer.title !== "string" ||
      typeof buffer.text !== "string"
    ) {
      return null;
    }

    const bufferDraftId =
      typeof buffer.draftId === "string" ? buffer.draftId : null;
    const normalized = { ...buffer, draftId: bufferDraftId };

    /* A saved draft belongs to its URL, and a letter whose first save is
       still settling already belongs to a draft too, so a fresh compose must
       not restore either. */
    return bufferDraftId || pendingDraftCreations > 0 ? null : normalized;
  } catch {
    return null;
  }
}

export function writeComposeBuffer(userId, draftId, value) {
  if (!userId) return;

  try {
    window.sessionStorage.setItem(
      composeBufferKey(userId, draftId),
      JSON.stringify(value),
    );
  } catch {
    /* Storage can be unavailable or full; server autosave still applies. */
  }
}

export function clearComposeBuffer(userId, draftId) {
  if (!userId) return;

  try {
    window.sessionStorage.removeItem(composeBufferKey(userId, draftId));
  } catch {
    /* Storage can be unavailable; nothing to clean up. */
  }
}

/* The buffer only needs the PNG while it is newer than the durable copies.
   Once an upload has returned a URL and nothing is dirty, Cloudinary and the
   row hold the image, so the buffer keeps just the URL and the reopen path
   fetches the PNG back. A dirty or URL-less signature keeps the drawing,
   because nothing else can recover it yet. */
export function composeBufferPayload({
  draftId,
  title,
  text,
  signatureData,
  signatureUrl,
  signatureDirty,
  fontSize,
  maxFontSize,
}) {
  return {
    draftId,
    title,
    text,
    signatureData: signatureDirty || !signatureUrl ? signatureData : null,
    signatureUrl,
    signatureDirty,
    fontSize,
    maxFontSize,
    savedAt: Date.now(),
  };
}
