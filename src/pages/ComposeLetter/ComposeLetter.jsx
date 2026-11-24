import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import SignaturePad from "../../components/SignaturePad/SignaturePad";
import { imageUrlToDataUrl } from "../../lib/cloudinary";
import { useSupabase } from "../../lib/SupabaseProvider";
import {
  clearComposeBuffer,
  composeBufferPayload,
  readComposeBuffer,
  writeComposeBuffer,
} from "./composeSession";
import {
  DEFAULT_TITLE,
  MAX_TITLE_LENGTH,
  loadDraft,
  signatureErrorMessage,
} from "./draftApi";
import {
  DEFAULT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  fitLoadedLetter,
  fittingCeiling,
  planEdit,
} from "./fitToPage";
import useDraftSaver from "./useDraftSaver";
import useLeaveGuard from "./useLeaveGuard";
import "./ComposeLetter.css";

/* How long status toasts stay up. */
const TOAST_MS = 2000;

/* Letter composer. Drafts persist to public.letters; recipient selection,
   delivery options, and posting are still to come. */
function ComposeLetter() {
  const { userId } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();
  const { draftId: routeDraftId = null } = useParams();

  /* A draft opened by URL is durable: it starts read-only, and edits stay
     local until the user explicitly saves. A brand-new letter keeps the
     existing always-editable, autosaving composer. */
  const [isSavedDraft] = useState(Boolean(routeDraftId));
  const [isEditing, setIsEditing] = useState(!isSavedDraft);
  const [draftLoaded, setDraftLoaded] = useState(!isSavedDraft);
  const [initialRouteDraftId] = useState(routeDraftId);

  const [initialBuffer] = useState(() =>
    readComposeBuffer(userId, routeDraftId),
  );
  const restoredFontSize = Number.isFinite(initialBuffer?.fontSize)
    ? Math.min(Math.max(initialBuffer.fontSize, MIN_FONT_SIZE), MAX_FONT_SIZE)
    : DEFAULT_FONT_SIZE;
  const restoredMaxFontSize = Number.isFinite(initialBuffer?.maxFontSize)
    ? Math.min(
        Math.max(initialBuffer.maxFontSize, restoredFontSize),
        MAX_FONT_SIZE,
      )
    : MAX_FONT_SIZE;
  const initialSignatureData =
    typeof initialBuffer?.signatureData === "string"
      ? initialBuffer.signatureData
      : null;
  const initialSignatureUrl =
    typeof initialBuffer?.signatureUrl === "string"
      ? initialBuffer.signatureUrl
      : null;

  const [title, setTitle] = useState(initialBuffer?.title ?? "");
  const [text, setText] = useState(initialBuffer?.text ?? "");
  const [signatureData, setSignatureData] = useState(initialSignatureData);
  const [signatureUrl, setSignatureUrl] = useState(initialSignatureUrl);
  const [signatureDirty, setSignatureDirty] = useState(
    Boolean(initialBuffer?.signatureDirty),
  );
  const [signatureLoadVersion, setSignatureLoadVersion] = useState(0);
  const [fontSize, setFontSize] = useState(restoredFontSize);
  const [maxFontSize, setMaxFontSize] = useState(restoredMaxFontSize);
  const [draftId, setDraftId] = useState(
    routeDraftId ?? initialBuffer?.draftId ?? null,
  );
  const [savingDraft, setSavingDraft] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const letterRef = useRef(null);
  const rulerRef = useRef(null);
  const toastTimer = useRef(null);
  const latestValuesRef = useRef({
    title,
    text,
    signatureData,
    signatureUrl,
    signatureDirty,
    draftId,
    fontSize,
    maxFontSize,
  });
  /* The data URL currently stored at `url`, so typing after a signature does
     not upload the same PNG again. A pair is only valid when the URL exists. */
  const uploadedSignatureRef = useRef({
    dataUrl:
      initialSignatureData && initialSignatureUrl
        ? initialSignatureData
        : null,
    url: initialSignatureUrl,
  });
  const signatureTouchedRef = useRef(false);
  const restoreStateRef = useRef(null);
  const loadedDraftIdRef = useRef(null);
  const lastSignatureErrorRef = useRef("");
  /* The version that is currently durable in Supabase, used by [No] to put
     the letter back before leaving. */
  const savedSnapshotRef = useRef(null);

  const {
    leaveRequest,
    setLeaveRequest,
    armHistorySentinel,
    dropHistorySentinel,
    finishLeave,
    cancelLeave,
  } = useLeaveGuard({ active: isSavedDraft && isEditing });

  /* Edits from a previous editing session are discarded on reopen, so the
     stale local copy is dropped as soon as the URL draft is opened. */
  useEffect(() => {
    if (!userId || !initialRouteDraftId) return;

    clearComposeBuffer(userId, initialRouteDraftId);
  }, [userId, initialRouteDraftId]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /* Applies an edit only while it still fits the paper at the smallest size.
     When the page is full the edit is dropped and the letter stays as it was,
     so typing stops instead of overflowing or losing text. */
  function applyState(nextText, nextSize) {
    const size = nextSize ?? fontSize;

    const edit = planEdit(
      letterRef.current,
      rulerRef.current,
      text,
      nextText,
      size,
    );

    setIsOverflowing(edit.overflowing);

    if (!edit.accepted) return;

    setText(edit.text);
    setFontSize(edit.fontSize);
    setMaxFontSize(edit.maxFontSize);
  }

  /* Loads the stored size when it still fits the current paper (one
     measurement), otherwise searches for one that does. Loading keeps every
     character and warns when even the smallest size overflows. Returns the
     result so the durable snapshot can remember the loaded size. */
  function restoreState(content, storedFontSize) {
    const restored = fitLoadedLetter(
      letterRef.current,
      rulerRef.current,
      content,
      storedFontSize,
    );

    setText(restored.text);
    setFontSize(restored.fontSize);
    setMaxFontSize(restored.maxFontSize);
    setIsOverflowing(restored.overflowing);

    return restored;
  }

  const flashToast = useCallback((message) => {
    setToastMessage(message);
    setShowToast(true);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), TOAST_MS);
  }, []);

  const { enqueueSave } = useDraftSaver({
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
  });

  /* SignaturePad reports on mouse/touch up. A local drawing or clear has no
     valid uploaded URL yet, so drop the old pair immediately; the autosave
     queue will upload or clear the stored URL after its debounce. */
  const handleSignatureChange = useCallback((nextSignature) => {
    signatureTouchedRef.current = true;
    lastSignatureErrorRef.current = "";
    uploadedSignatureRef.current = { dataUrl: null, url: null };

    latestValuesRef.current = {
      ...latestValuesRef.current,
      signatureData: nextSignature,
      signatureUrl: null,
      signatureDirty: true,
    };

    setSignatureData(nextSignature);
    setSignatureUrl(null);
    setSignatureDirty(true);
  }, []);

  useEffect(() => {
    latestValuesRef.current = {
      title,
      text,
      signatureData,
      signatureUrl,
      signatureDirty,
      draftId,
      fontSize,
      maxFontSize,
    };
  }, [
    title,
    text,
    signatureData,
    signatureUrl,
    signatureDirty,
    draftId,
    fontSize,
    maxFontSize,
  ]);

  useEffect(() => {
    restoreStateRef.current = restoreState;
  });

  /* sessionStorage is written synchronously after each render so a reload
     cannot lose the keystrokes that have not reached the server yet. Only an
     editable letter has anything to recover; read-only drafts must not write
     buffers at all. */
  useLayoutEffect(() => {
    if (!userId || !isEditing) return;
    if (routeDraftId && !title.trim() && !text) return;

    writeComposeBuffer(
      userId,
      draftId,
      composeBufferPayload({
        draftId,
        title,
        text,
        signatureData,
        signatureUrl,
        signatureDirty,
        fontSize,
        maxFontSize,
      }),
    );
  }, [
    userId,
    routeDraftId,
    draftId,
    title,
    text,
    signatureData,
    signatureUrl,
    signatureDirty,
    fontSize,
    maxFontSize,
    isEditing,
  ]);

  /* A URL draft id is authoritative on a cold load. Local edits from an
     earlier editing session are deliberately ignored: a reopened draft always
     shows the durable Supabase version. */
  useEffect(() => {
    if (!routeDraftId || !userId || !supabase) return;
    if (loadedDraftIdRef.current === routeDraftId) return;

    let cancelled = false;

    async function loadSavedDraft() {
      const { data, error } = await loadDraft(supabase, userId, routeDraftId);

      if (cancelled) return;

      if (error) {
        flashToast(error.message || "could not load draft");
        return;
      }

      if (!data) {
        /* The id is gone or not ours. Drop it from the URL so a later save
           creates a new draft instead of trying to update this id forever. */
        latestValuesRef.current = {
          ...latestValuesRef.current,
          draftId: null,
        };
        setDraftId(null);
        flashToast("could not load draft");
        navigate("/post-office/compose", { replace: true });
        return;
      }

      loadedDraftIdRef.current = data.id;
      setDraftId(data.id);
      setDraftLoaded(true);

      setTitle(data.title ?? "");

      let restored = null;

      if (restoreStateRef.current) {
        restored = restoreStateRef.current(
          data.content ?? "",
          data.font_size,
        );
      } else {
        setText(data.content ?? "");
        setFontSize(MIN_FONT_SIZE);
      }

      /* The pad may have been used while the row was loading. That new local
         signature is newer than anything on the row, so never replace it. */
      if (signatureTouchedRef.current) return;

      const storedSignatureUrl =
        (typeof data.signature_path === "string" && data.signature_path) ||
        null;

      savedSnapshotRef.current = {
        title: data.title ?? "",
        text: data.content ?? "",
        fontSize: restored?.fontSize ?? MIN_FONT_SIZE,
        signatureData: null,
        signatureUrl: storedSignatureUrl,
        signatureDirty: false,
      };

      latestValuesRef.current = {
        ...latestValuesRef.current,
        signatureUrl: storedSignatureUrl,
        signatureDirty: false,
      };
      uploadedSignatureRef.current = {
        dataUrl: null,
        url: storedSignatureUrl,
      };
      setSignatureUrl(storedSignatureUrl);
      setSignatureDirty(false);

      if (!storedSignatureUrl) return;

      try {
        const dataUrl = await imageUrlToDataUrl(storedSignatureUrl);

        if (cancelled || signatureTouchedRef.current) return;

        latestValuesRef.current = {
          ...latestValuesRef.current,
          signatureData: dataUrl,
          signatureUrl: storedSignatureUrl,
          signatureDirty: false,
        };
        uploadedSignatureRef.current = {
          dataUrl,
          url: storedSignatureUrl,
        };
        savedSnapshotRef.current = {
          ...savedSnapshotRef.current,
          signatureData: dataUrl,
          signatureUrl: storedSignatureUrl,
          signatureDirty: false,
        };
        setSignatureData(dataUrl);
        setSignatureLoadVersion((version) => version + 1);
      } catch {
        if (!cancelled) flashToast("could not load signature");
      }
    }

    loadSavedDraft();

    return () => {
      cancelled = true;
    };
  }, [
    routeDraftId,
    userId,
    supabase,
    flashToast,
    navigate,
  ]);

  /* The font shrinks automatically as the letter grows. Once the page is full
     at the smallest size, further input is dropped (the value stays as it was)
     and the warning explains why; nothing already written is ever lost. */
  function handleChange(event) {
    applyState(event.target.value, fontSize);
  }

  /* The slider only offers sizes that still fit, but applyState clamps the
     request anyway so a stale maximum can never force text off the page. */
  function handleFontSizeChange(event) {
    applyState(text, Number(event.target.value));
  }

  /* A letter loaded at its stored size only knows that *that* size fits, not
     the true ceiling. Editing offers the slider, so compute the ceiling once
     here rather than on every render. */
  function enterEditMode() {
    const ceiling = fittingCeiling(
      letterRef.current,
      rulerRef.current,
      text,
    );

    setMaxFontSize(ceiling.maxFontSize);
    setIsOverflowing(ceiling.overflowing);
    setIsEditing(true);
  }

  /* Writes the latest local values to the existing draft row. Returns true
     only when the row is durable, so callers can choose to close the editor or
     keep it open with the changes intact. `explicit` is true only when the
     click that led here was [save] or [>] (a deliberate save), never for
     autosave. */
  async function commitEditedDraft(explicit = false) {
    if (savingDraft) return false;

    if (!userId || !supabase) {
      flashToast("could not save draft");
      return false;
    }

    setSavingDraft(true);

    try {
      const result = await enqueueSave({ explicit });

      if (result?.error) {
        flashToast(result.error?.message || "could not save draft");
        return false;
      }

      if (result?.skipped) {
        flashToast("nothing to save");
        return false;
      }

      clearComposeBuffer(userId, draftId);

      savedSnapshotRef.current = {
        title: latestValuesRef.current.title,
        text: latestValuesRef.current.text,
        fontSize: latestValuesRef.current.fontSize,
        signatureData: latestValuesRef.current.signatureData,
        signatureUrl: latestValuesRef.current.signatureUrl,
        signatureDirty: false,
      };

      flashToast(
        result?.signatureError
          ? `draft saved; ${signatureErrorMessage(result.signatureError)}`
          : "draft saved",
      );

      return true;
    } catch {
      flashToast("could not save draft");
      return false;
    } finally {
      setSavingDraft(false);
    }
  }

  /* [save] keeps the letter open, now in read-only mode. This is a deliberate
     save, so it also clears the Drafts "auto-saved" tag. */
  async function saveEditedDraft() {
    const saved = await commitEditedDraft(true);

    if (!saved) return;

    dropHistorySentinel();
    setIsEditing(false);
  }

  /* [No] puts the durable version back in place before leaving, so discarded
     edits never survive the navigation. */
  function restoreSavedDraft() {
    const snapshot = savedSnapshotRef.current;
    if (!snapshot) return;

    setTitle(snapshot.title);

    if (restoreStateRef.current) {
      restoreStateRef.current(snapshot.text, snapshot.fontSize);
    } else {
      setText(snapshot.text);
    }

    setSignatureData(snapshot.signatureData);
    setSignatureUrl(snapshot.signatureUrl);
    setSignatureDirty(false);
    setSignatureLoadVersion((version) => version + 1);

    uploadedSignatureRef.current = {
      dataUrl: snapshot.signatureData,
      url: snapshot.signatureUrl,
    };

    latestValuesRef.current = {
      ...latestValuesRef.current,
      title: snapshot.title,
      text: snapshot.text,
      fontSize: snapshot.fontSize,
      signatureData: snapshot.signatureData,
      signatureUrl: snapshot.signatureUrl,
      signatureDirty: false,
    };

    clearComposeBuffer(userId, draftId);
  }

  /* `[>]` is also a save button, so an explicit leave saves before navigating.
     Other exits stay background saves: only a deliberate [draft] or [>] click
     may set is_explicitly_saved. */
  function requestLeave(to, explicit = false) {
    if (isSavedDraft && isEditing) {
      setLeaveRequest({ kind: "route", to, explicit });
      return;
    }

    if (explicit) enqueueSave({ explicit: true }).catch(() => {});
    navigate(to);
  }

  async function confirmLeave() {
    const request = leaveRequest;
    if (!request) return;

    const saved = await commitEditedDraft(request.explicit);

    if (!saved) {
      /* Stay in edit mode with the changes, and put the history trap back if
         this prompt came from Browser Back. */
      setLeaveRequest(null);
      armHistorySentinel();
      return;
    }

    setLeaveRequest(null);
    finishLeave(request);
  }

  function discardLeave() {
    const request = leaveRequest;
    if (!request) return;

    restoreSavedDraft();
    setLeaveRequest(null);
    setIsEditing(false);
    finishLeave(request);
  }

  /* Manual save for a new letter shares the autosave queue, so the two can
     never race. The explicit flag is what clears the Drafts "auto-saved" tag. */
  async function saveDraft() {
    if (savingDraft) return;

    if (!userId || !supabase) {
      flashToast("could not save draft");
      return;
    }

    setSavingDraft(true);

    try {
      const result = await enqueueSave({ explicit: true });

      if (result?.error) {
        flashToast(result.error?.message || "could not save draft");
        return;
      }

      if (result?.skipped) {
        flashToast("nothing to save");
        return;
      }

      if (result?.signatureError) {
        flashToast(`draft saved; ${signatureErrorMessage(result.signatureError)}`);
        return;
      }

      flashToast("draft saved");
    } catch {
      flashToast("could not save draft");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <main className={`compose${isSavedDraft ? " compose--saved" : ""}`}>
      <h1 className="compose__title">Compose Letter</h1>

      <div className="compose__frame">
        <div className="compose__heading">
          {isEditing ? (
            <input
              id="letter-title"
              className="compose__title-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={DEFAULT_TITLE}
              aria-label="Letter Title"
              autoComplete="off"
              maxLength={MAX_TITLE_LENGTH}
            />
          ) : (
            <p className="compose__title-static">
              {title.trim() || DEFAULT_TITLE}
            </p>
          )}
        </div>

        <div className="compose__paper">
          <button
            type="button"
            className="compose__back"
            onClick={() => requestLeave("/post-office")}
            aria-label="Back"
          >
            &lt;
          </button>

          <button
            type="button"
            className="compose__next"
            onClick={() => requestLeave("/post-office/post", true)}
            aria-label="Next"
          >
            &gt;
          </button>

          {!isSavedDraft && (
            <button
              type="button"
              className="compose__draft"
              onClick={saveDraft}
              disabled={savingDraft}
            >
              {savingDraft ? "saving..." : "draft"}
            </button>
          )}

          {/* Kept as a textarea even when read-only so the off-screen ruler can
              still measure the saved letter and choose a size that fits. */}
          <textarea
            ref={letterRef}
            className={`compose__letter${
              isEditing ? "" : " compose__letter--readonly"
            }`}
            style={{ fontSize: `${fontSize}px` }}
            value={text}
            onChange={handleChange}
            readOnly={!isEditing}
            placeholder={isEditing ? "Write your letter…" : ""}
            aria-label="Letter"
            spellCheck="true"
          />

          <div className="compose__paper-foot">
            {isEditing ? (
              <SignaturePad
                key={signatureLoadVersion}
                className="compose__signature"
                initialData={signatureData}
                onChange={handleSignatureChange}
              />
            ) : (
              (signatureUrl || signatureData) && (
                <img
                  className="compose__signature compose__signature-image"
                  src={signatureUrl || signatureData}
                  alt="Signature"
                />
              )
            )}
          </div>
        </div>

        {isEditing && (
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
        )}

        {isOverflowing && (
          <p className="compose__overflow" role="status">
            This letter is too long to fit on one page at the smallest font size.
          </p>
        )}
      </div>

      {isSavedDraft && (
        <button
          type="button"
          className="compose__mode"
          onClick={isEditing ? saveEditedDraft : enterEditMode}
          disabled={!draftLoaded || savingDraft}
        >
          {savingDraft ? "saving..." : isEditing ? "save" : "edit"}
        </button>
      )}

      {/* Off-screen copy of the letter, used only to measure text height. */}
      <div ref={rulerRef} className="compose__ruler" aria-hidden="true" />

      {leaveRequest && (
        <div
          className="compose__dialog-backdrop"
          onClick={cancelLeave}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancelLeave();
          }}
        >
          <div
            className="compose__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-leave-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="compose__dialog-text" id="compose-leave-title">
              Save changes before leaving?
            </p>

            <div className="compose__dialog-actions">
              <button
                type="button"
                className="compose__dialog-button"
                onClick={confirmLeave}
                disabled={savingDraft}
                autoFocus
              >
                Yes
              </button>

              <button
                type="button"
                className="compose__dialog-button"
                onClick={discardLeave}
                disabled={savingDraft}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <p className="compose__toast" role="status">
          {toastMessage}
        </p>
      )}
    </main>
  );
}

export default ComposeLetter;