import { useCallback, useEffect, useRef } from "react";

import { markDraftCreation } from "./composeSession";
import { hasDraftContent, signatureErrorMessage } from "./draftApi";
import saveDraftOnce from "./saveDraftOnce";

/* Autosave delay after the last title/text/signature change. */
const AUTOSAVE_MS = 1500;

/* Show a toast once. Repeating the same error on every keystroke would spam
   the screen; an empty message clears the memory so the next error shows. */
function toastOnce(ref, message, flashToast) {
  if (!message) {
    ref.current = "";
    return;
  }

  if (ref.current === message) return;

  ref.current = message;
  flashToast(message);
}

/* A save error wins over a signature error, and each message is only shown
   when it changes. */
function reportAutosave(result, refs, flashToast) {
  if (result?.error) {
    toastOnce(
      refs.lastAutosaveErrorRef,
      result.error.message || "could not autosave",
      flashToast,
    );
    return;
  }

  refs.lastAutosaveErrorRef.current = "";

  toastOnce(
    refs.lastSignatureErrorRef,
    result?.signatureError
      ? signatureErrorMessage(result.signatureError)
      : "",
    flashToast,
  );
}

/* The scheduling half of draft autosave. saveDraftOnce does the actual write;
   this hook decides *when* to write:

   1. 1.5 s after the last edit (new letters only),
   2. immediately when leaving the page, hiding the tab, or unmounting,
   3. one save at a time, so an older request can never overwrite a newer one.

   Opened drafts never autosave: their edits stay local until [save]. */
export default function useDraftSaver({
  userId,
  supabase,
  navigate,
  isSavedDraft,
  title,
  text,
  signatureData,
  draftId,
  fontSize,
  latestValuesRef,
  uploadedSignatureRef,
  loadedDraftIdRef,
  lastSignatureErrorRef,
  flashToast,
  setDraftId,
  setSignatureUrl,
  setSignatureDirty,
}) {
  const autosaveTimer = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const lastAutosaveErrorRef = useRef("");
  const flushRef = useRef(null);

  /* Puts the current values in front of saveDraftOnce. `explicit` is only
     true for a deliberate [draft] / [save] / [>] click; autosave never passes
     it. */
  const saveOnce = useCallback(
    (options) =>
      saveDraftOnce({
        userId,
        supabase,
        navigate,
        latestValuesRef,
        uploadedSignatureRef,
        loadedDraftIdRef,
        setDraftId,
        setSignatureUrl,
        setSignatureDirty,
        explicit: options?.explicit === true,
      }),
    [
      userId,
      supabase,
      navigate,
      latestValuesRef,
      uploadedSignatureRef,
      loadedDraftIdRef,
      setDraftId,
      setSignatureUrl,
      setSignatureDirty,
    ],
  );

  /* Queue every save behind the previous one. `then(run, run)` keeps the chain
     alive after a failure, so one bad save cannot block every later one.
     `enqueueSave({ explicit: true })` marks the row as deliberately saved;
     calling it with no options is a background autosave. */
  const enqueueSave = useCallback((options) => {
    /* Until this insert resolves, a fresh composer must ignore the "new"
       buffer instead of restoring a letter that is already becoming a draft. */
    const settleDraftCreation = latestValuesRef.current.draftId
      ? null
      : markDraftCreation();

    const task = saveChainRef.current.then(
      () => saveOnce(options),
      () => saveOnce(options),
    );
    saveChainRef.current = task.catch(() => {});

    if (settleDraftCreation) {
      task.then(settleDraftCreation, settleDraftCreation);
    }

    return task;
  }, [saveOnce, latestValuesRef]);

  /* Save now and cancel the pending debounce. Waiting 1.5 s while the page is
     closing would lose the last edit. */
  const flushAutosave = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    if (isSavedDraft) return;
    if (!hasDraftContent(latestValuesRef.current)) return;

    enqueueSave().catch(() => {});
  }, [enqueueSave, isSavedDraft, latestValuesRef]);

  /* The unmount effect below must not re-run whenever flushAutosave changes,
     so it calls the newest version through a ref. */
  useEffect(() => {
    flushRef.current = flushAutosave;
  }, [flushAutosave]);

  useEffect(() => () => flushRef.current?.(), []);

  /* Debounced autosave for a new letter. */
  useEffect(() => {
    if (isSavedDraft) return;
    if (!userId || !supabase) return;
    if (!hasDraftContent({ title, text, signatureData })) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;

      enqueueSave()
        .then((result) =>
          reportAutosave(
            result,
            { lastAutosaveErrorRef, lastSignatureErrorRef },
            flashToast,
          ),
        )
        .catch(() => {});
    }, AUTOSAVE_MS);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [
    title,
    text,
    signatureData,
    draftId,
    fontSize,
    userId,
    supabase,
    enqueueSave,
    flashToast,
    lastSignatureErrorRef,
    isSavedDraft,
  ]);

  /* Best-effort flush when the tab is hidden or unloaded. sessionStorage
     remains the guaranteed reload-recovery path. */
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flushAutosave();
    }

    window.addEventListener("pagehide", flushAutosave);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushAutosave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushAutosave]);

  return { enqueueSave };
}
