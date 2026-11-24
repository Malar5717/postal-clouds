/* The write half of draft autosave: one call turns the composer's current
   values into one Supabase insert or update. Scheduling (debounce, queue,
   flushes) lives in useDraftSaver. */

import {
  isCloudinaryConfigured,
  uploadSignature,
} from "../../lib/cloudinary";
import {
  clearComposeBuffer,
  composeBufferPayload,
  writeComposeBuffer,
} from "./composeSession";
import {
  DEFAULT_TITLE,
  MAX_TITLE_LENGTH,
  hasDraftContent,
  writeDraft,
} from "./draftApi";

function patchLatest(ref, patch) {
  ref.current = { ...ref.current, ...patch };
}

/* Decide what goes into letters.signature_path.

   undefined -> leave the stored value alone (upload failed / no Cloudinary)
   null      -> clear it (the pad was cleared)
   string    -> the Cloudinary URL to store

   `uploadedDataUrl` is set only for a fresh upload, so the caller can avoid
   attaching that URL to a drawing which has changed since. */
async function signatureForSave(current, uploadedSignatureRef) {
  const uploaded = uploadedSignatureRef.current;

  /* Same drawing that was uploaded before: reuse the URL, no second upload. */
  if (current.signatureData === uploaded.dataUrl) {
    return { path: uploaded.url };
  }

  if (!current.signatureData) {
    uploadedSignatureRef.current = { dataUrl: null, url: null };
    return { path: null };
  }

  if (!isCloudinaryConfigured()) {
    return { error: new Error("signature storage is not configured") };
  }

  try {
    return {
      path: await uploadSignature(current.signatureData),
      uploadedDataUrl: current.signatureData,
    };
  } catch (error) {
    return { error };
  }
}

/* Saves whatever the composer holds right now. The ref is the source of
   truth, not the render props: a queued save must send the newest keystrokes,
   not the values from when it was scheduled.

   Returns { data, signatureError }, { skipped: true } for a blank letter, or
   { error } when the row could not be written. */
export default async function saveDraftOnce({
  userId,
  supabase,
  navigate,
  latestValuesRef,
  uploadedSignatureRef,
  loadedDraftIdRef,
  setDraftId,
  setSignatureUrl,
  setSignatureDirty,
  explicit = false,
}) {
  try {
    if (!userId || !supabase) {
      return { error: new Error("could not save draft") };
    }

    const current = latestValuesRef.current;

    if (!hasDraftContent(current)) return { skipped: true };

    /* A blank title must never block the save; store a renameable default. */
    const cleanTitle =
      current.title.trim().slice(0, MAX_TITLE_LENGTH) || DEFAULT_TITLE;

    const signature = await signatureForSave(current, uploadedSignatureRef);

    /* The upload can finish after the pad changed. Only remember the URL if
       it still belongs to the drawing that was uploaded. */
    if (
      signature.uploadedDataUrl &&
      latestValuesRef.current.signatureData === signature.uploadedDataUrl
    ) {
      uploadedSignatureRef.current = {
        dataUrl: signature.uploadedDataUrl,
        url: signature.path,
      };
      patchLatest(latestValuesRef, { signatureUrl: signature.path });
      setSignatureUrl(signature.path);
    }

    const values = {
      title: cleanTitle,
      content: current.text,
      font_size: current.fontSize,
    };

    /* undefined means "leave the old signature_path alone". */
    if (signature.path !== undefined) {
      values.signature_path = signature.path;
    }

    /* Only a deliberate click flips this. Autosave omits the column entirely,
       so it neither sets nor clears a previous explicit save. */
    if (explicit) {
      values.is_explicitly_saved = true;
    }

    const { data, error } = await writeDraft(
      supabase,
      userId,
      current.draftId,
      values,
    );

    if (error) return { error };

    /* The row is saved, but the pad may have changed while the request was in
       flight. Only mark the signature clean if it is still the same one. */
    if (latestValuesRef.current.signatureData === current.signatureData) {
      const signatureDirty = Boolean(signature.error);

      patchLatest(latestValuesRef, {
        signatureDirty,
        ...(signature.path !== undefined
          ? { signatureUrl: signature.path }
          : {}),
      });

      if (
        signature.path !== undefined &&
        signature.path !== current.signatureUrl
      ) {
        setSignatureUrl(signature.path);
      }

      if (signatureDirty !== current.signatureDirty) {
        setSignatureDirty(signatureDirty);
      }
    }

    /* First successful insert: adopt the id so every later save updates this
       row instead of inserting a duplicate, and move the recovery buffer from
       the "new letter" key to the draft's key. */
    if (!current.draftId && data?.id) {
      patchLatest(latestValuesRef, { draftId: data.id });
      loadedDraftIdRef.current = data.id;
      writeComposeBuffer(
        userId,
        data.id,
        composeBufferPayload(latestValuesRef.current),
      );
      clearComposeBuffer(userId, null);

      setDraftId(data.id);
      navigate(`/post-office/compose/${data.id}`, { replace: true });
    }

    return { data, signatureError: signature.error ?? null };
  } catch (error) {
    return { error };
  }
}
