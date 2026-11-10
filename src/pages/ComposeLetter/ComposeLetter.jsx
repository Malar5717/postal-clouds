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
import {
  imageUrlToDataUrl,
  isCloudinaryConfigured,
  uploadSignature,
} from "../../lib/cloudinary";
import { useSupabase } from "../../lib/SupabaseProvider";
import "./ComposeLetter.css";

/* Slider bounds for the letter text size. */
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 40;

/* How long status toasts stay up. */
const TOAST_MS = 2000;

/* Keep letter titles short enough to scan in the drafts list. */
const MAX_TITLE_LENGTH = 80;

/* Autosave delay after the last title/text edit. */
const AUTOSAVE_MS = 1500;

/* Per-user, per-draft, per-tab recovery buffer. Supabase is the durable copy
   for title/text/signature URL; the local PNG keeps the signature recoverable
   across a reload before the upload finishes. `null` is the key for a
   not-yet-created draft, so opening another draft cannot overwrite an unsaved
   new letter. */
function composeBufferKey(userId, draftId) {
  return `postal-clouds:compose:${userId}:${draftId ?? "new"}`;
}

function readComposeBuffer(userId, routeDraftId) {
  if (!userId) return null;

  try {
    const raw = window.sessionStorage.getItem(
      composeBufferKey(userId, routeDraftId),
    );
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

    if (routeDraftId) {
      return bufferDraftId === routeDraftId ? normalized : null;
    }

    /* A saved draft belongs to its URL, so a fresh compose must not restore it. */
    return bufferDraftId ? null : normalized;
  } catch {
    return null;
  }
}

function writeComposeBuffer(userId, draftId, value) {
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

function clearComposeBuffer(userId, draftId) {
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
function composeBufferPayload({
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

/* Cloudinary can return verbose provider messages; the toast gets a short
   version, while the full error is still available on the save result. */
function signatureErrorMessage(error) {
  if (error?.message === "signature storage is not configured") {
    return "signature storage is not configured";
  }

  return "signature not stored";
}

/* Letter composer. Drafts persist to public.letters; recipient selection,
   delivery options, and posting are still to come. */
function ComposeLetter() {
  const { userId } = useAuth();
  const supabase = useSupabase();
  const navigate = useNavigate();
  const { draftId: routeDraftId = null } = useParams();

  const [initialBuffer] = useState(() =>
    readComposeBuffer(userId, routeDraftId),
  );
  const restoredFontSize = Number.isFinite(initialBuffer?.fontSize)
    ? Math.min(Math.max(initialBuffer.fontSize, MIN_FONT_SIZE), MAX_FONT_SIZE)
    : 18;
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
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const letterRef = useRef(null);
  const rulerRef = useRef(null);
  const toastTimer = useRef(null);
  /* Scroll offset to restore after a rejected input. */
  const keepScrollTop = useRef(null);
  const autosaveTimer = useRef(null);
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
  const saveChainRef = useRef(Promise.resolve());
  const lastAutosaveErrorRef = useRef("");
  const lastSignatureErrorRef = useRef("");
  const signatureTouchedRef = useRef(false);
  const restoreStateRef = useRef(null);
  const installedRef = useRef(true);
  const loadedDraftIdRef = useRef(null);
  const recoveredDraftRef = useRef(
    Boolean(
      initialBuffer?.draftId &&
        routeDraftId &&
        initialBuffer.draftId === routeDraftId,
    ),
  );

  useEffect(() => {
    installedRef.current = true;

    return () => {
      installedRef.current = false;
    };
  }, []);

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

  /* A letter saved on a larger screen can be longer than the paper at the
     current size. Loading must never trim it, so prefer 18px when it fits and
     otherwise fall back to the smallest size. */
  function restoreState(content) {
    const size = measure(content, 18) ? 18 : MIN_FONT_SIZE;

    setText(content);
    setFontSize(size);
    setMaxFontSize(largestFittingSize(content, size));
  }

  const flashToast = useCallback((message) => {
    setToastMessage(message);
    setShowToast(true);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setShowToast(false), TOAST_MS);
  }, []);

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

  /* Saves the latest title/text/signature. Calls are serialized so an older
     request can never overwrite a newer one, and the first insert upgrades
     every queued save to an update of that same draft. */
  const enqueueSave = useCallback(() => {
    const run = async () => {
      try {
        if (!userId || !supabase) {
          return { error: new Error("could not save draft") };
        }

        const current = latestValuesRef.current;
        const cleanTitle = current.title.trim().slice(0, MAX_TITLE_LENGTH);

        if (!cleanTitle) return { skipped: true };

        /* `undefined` means leave signature_path alone (upload failed or the
           preset is missing). This keeps an older stored signature instead of
           clearing it when a new local drawing cannot be uploaded. */
        let signaturePath;
        let signatureError = null;
        const uploaded = uploadedSignatureRef.current;

        if (current.signatureData === uploaded.dataUrl) {
          signaturePath = uploaded.url;
        } else if (!current.signatureData) {
          signaturePath = null;
          uploadedSignatureRef.current = { dataUrl: null, url: null };
        } else if (!isCloudinaryConfigured()) {
          signatureError = new Error("signature storage is not configured");
        } else {
          const signatureSnapshot = current.signatureData;

          try {
            const uploadedUrl = await uploadSignature(signatureSnapshot);
            signaturePath = uploadedUrl;

            /* The pad may have moved on while the image was uploading. Do not
               attach this URL to a newer local signature. */
            if (latestValuesRef.current.signatureData === signatureSnapshot) {
              uploadedSignatureRef.current = {
                dataUrl: signatureSnapshot,
                url: uploadedUrl,
              };
              latestValuesRef.current = {
                ...latestValuesRef.current,
                signatureUrl: uploadedUrl,
              };

              if (installedRef.current) {
                setSignatureUrl(uploadedUrl);
              }
            }
          } catch (uploadError) {
            signatureError = uploadError;
          }
        }

        const values = {
          title: cleanTitle,
          content: current.text,
        };

        if (signaturePath !== undefined) {
          values.signature_path = signaturePath;
        }

        const { data, error } = current.draftId
          ? await supabase
              .from("letters")
              .update(values)
              .eq("id", current.draftId)
              .eq("sender_id", userId)
              .eq("status", "DRAFT")
              .select("id")
              .single()
          : await supabase
              .from("letters")
              .insert({
                ...values,
                sender_id: userId,
                recipient_id: null,
                delivery_type: null,
                status: "DRAFT",
              })
              .select("id")
              .single();

        if (error) return { error };

        const signatureStillCurrent =
          latestValuesRef.current.signatureData === current.signatureData;
        const nextSignatureDirty = Boolean(signatureError);

        if (signatureStillCurrent) {
          latestValuesRef.current = {
            ...latestValuesRef.current,
            signatureDirty: nextSignatureDirty,
          };

          if (signaturePath !== undefined) {
            latestValuesRef.current = {
              ...latestValuesRef.current,
              signatureUrl: signaturePath,
            };
          }

          if (installedRef.current) {
            if (
              signaturePath !== undefined &&
              signaturePath !== current.signatureUrl
            ) {
              setSignatureUrl(signaturePath);
            }
            if (nextSignatureDirty !== current.signatureDirty) {
              setSignatureDirty(nextSignatureDirty);
            }
          }
        }

        if (!current.draftId && data?.id) {
          latestValuesRef.current = {
            ...latestValuesRef.current,
            draftId: data.id,
          };
          loadedDraftIdRef.current = data.id;
          writeComposeBuffer(
            userId,
            data.id,
            composeBufferPayload({ ...latestValuesRef.current, draftId: data.id }),
          );
          clearComposeBuffer(userId, null);

          if (installedRef.current) {
            setDraftId(data.id);
            navigate(`/post-office/compose/${data.id}`, { replace: true });
          }
        }

        return { data, signatureError };
      } catch (error) {
        return { error };
      }
    };

    const next = saveChainRef.current.then(run, run);
    saveChainRef.current = next.catch(() => {});
    return next;
  }, [userId, supabase, navigate]);

  const flushAutosave = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }

    if (!latestValuesRef.current.title.trim()) return;

    enqueueSave().catch(() => {});
  }, [enqueueSave]);

  /* In-app navigation unmounts the composer without firing `pagehide`, so a
     debounce that is still waiting would never reach the server; the row would
     stay stale until the draft is reopened, even though this tab still has the
     text. Flushing on unmount sends those last keystrokes. The save reads
     `latestValuesRef`, and `enqueueSave` is idempotent, so an exit right after
     a completed save just repeats the same values. */
  const flushRef = useRef(flushAutosave);

  useEffect(() => {
    flushRef.current = flushAutosave;
  }, [flushAutosave]);

  useEffect(() => () => flushRef.current(), []);

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
     cannot lose the keystrokes that have not reached the server yet. */
  useLayoutEffect(() => {
    if (!userId) return;
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
  ]);

  /* A URL draft id is authoritative on a cold load. A recovery buffer for the
     same draft wins for title/text because it may hold newer keystrokes; its
     signature wins only when it has unsaved local changes. */
  useEffect(() => {
    if (!routeDraftId || !userId || !supabase) return;
    if (loadedDraftIdRef.current === routeDraftId) return;

    let cancelled = false;

    async function loadDraft() {
      const { data, error } = await supabase
        .from("letters")
        .select("id, title, content, signature_path")
        .eq("id", routeDraftId)
        .eq("sender_id", userId)
        .eq("status", "DRAFT")
        .maybeSingle();

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

      if (!recoveredDraftRef.current) {
        setTitle(data.title ?? "");

        if (restoreStateRef.current) {
          restoreStateRef.current(data.content ?? "");
        } else {
          setText(data.content ?? "");
          setFontSize(MIN_FONT_SIZE);
        }
      }

      /* The pad may have been used while the row was loading. That new local
         signature is newer than anything on the row, so never replace it. */
      if (signatureTouchedRef.current) return;

      const bufferedSignatureDirty = Boolean(initialBuffer?.signatureDirty);
      const bufferedSignatureData =
        typeof initialBuffer?.signatureData === "string"
          ? initialBuffer.signatureData
          : null;
      const bufferedSignatureUrl =
        typeof initialBuffer?.signatureUrl === "string"
          ? initialBuffer.signatureUrl
          : null;

      /* A dirty buffer, or one with a local drawing, is already authoritative.
         A clean buffer without a drawing still needs the saved URL, which is
         the common reopen path. */
      if (bufferedSignatureDirty || bufferedSignatureData) return;

      const storedSignatureUrl =
        (typeof data.signature_path === "string" && data.signature_path) ||
        bufferedSignatureUrl ||
        null;

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
        setSignatureData(dataUrl);
        setSignatureLoadVersion((version) => version + 1);
      } catch {
        if (!cancelled) flashToast("could not load signature");
      }
    }

    loadDraft();

    return () => {
      cancelled = true;
    };
  }, [
    routeDraftId,
    userId,
    supabase,
    initialBuffer,
    flashToast,
    navigate,
  ]);

  useEffect(() => {
    if (!userId || !supabase || !title.trim()) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;

      enqueueSave()
        .then((result) => {
          if (result?.error) {
            const message = result.error?.message || "could not autosave";
            if (lastAutosaveErrorRef.current !== message) {
              lastAutosaveErrorRef.current = message;
              flashToast(message);
            }
            return;
          }

          lastAutosaveErrorRef.current = "";

          if (result?.signatureError) {
            const message = signatureErrorMessage(result.signatureError);
            if (lastSignatureErrorRef.current !== message) {
              lastSignatureErrorRef.current = message;
              flashToast(message);
            }
          } else {
            lastSignatureErrorRef.current = "";
          }
        })
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
    userId,
    supabase,
    enqueueSave,
    flashToast,
  ]);

  /* Best-effort flush when the tab is hidden or unloaded. The sessionStorage
     buffer is the guaranteed reload recovery path. */
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
    flashToast("max length reached");
  }

  /* A font size is only accepted if the letter still fits at that size.
     Sliding past the ceiling is simply held back; no text is touched. */
  function handleFontSizeChange(event) {
    const requested = Number(event.target.value);
    applyState(text, Math.min(requested, maxFontSize));
  }

  /* Manual save shares the autosave queue, so the two can never race. */
  async function saveDraft() {
    if (savingDraft) return;

    const cleanTitle = title.trim().slice(0, MAX_TITLE_LENGTH);

    if (!cleanTitle) {
      flashToast("title required");
      return;
    }

    if (!userId || !supabase) {
      flashToast("could not save draft");
      return;
    }

    setSavingDraft(true);

    try {
      const result = await enqueueSave();

      if (result?.error) {
        flashToast(result.error?.message || "could not save draft");
        return;
      }

      if (result?.skipped) {
        flashToast("title required");
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
    <main className="compose">
      <h1 className="compose__title">Compose Letter</h1>

      <div className="compose__frame">
        <div className="compose__heading">
          <input
            id="letter-title"
            className="compose__title-input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Letter Title"
            aria-label="Letter Title"
            aria-required="true"
            autoComplete="off"
            maxLength={MAX_TITLE_LENGTH}
          />
        </div>

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

          <button
            type="button"
            className="compose__draft"
            onClick={saveDraft}
            disabled={savingDraft}
          >
            {savingDraft ? "saving..." : "draft"}
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

          <div className="compose__paper-foot">
            <SignaturePad
              key={signatureLoadVersion}
              className="compose__signature"
              initialData={signatureData}
              onChange={handleSignatureChange}
            />
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
          {toastMessage}
        </p>
      )}
    </main>
  );
}

export default ComposeLetter;