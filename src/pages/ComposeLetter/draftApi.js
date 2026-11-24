/* Draft row rules and the composer's only Supabase access. A draft is a
   `public.letters` row with status DRAFT and no recipient. Every query is
   scoped to the signed-in sender and to DRAFT, so a stale id can never touch
   another user's letter or a posted one. */

/* Keep letter titles short enough to scan in the drafts list. */
export const MAX_TITLE_LENGTH = 80;

/* A missing title must never cost someone their letter. Drafts are stored
   with this name when the title is blank, and can be renamed later. */
export const DEFAULT_TITLE = "Untitled";

/* A draft is worth writing once there is something in it. A blank composer
   must not create an empty row just because autosave is running. */
export function hasDraftContent({ title, text, signatureData }) {
  return Boolean(title.trim() || text.trim() || signatureData);
}

/* Cloudinary can return verbose provider messages; the toast gets a short
   version, while the full error is still available on the save result. */
export function signatureErrorMessage(error) {
  if (error?.message === "signature storage is not configured") {
    return "signature storage is not configured";
  }

  return "signature not stored";
}

/* Cold load for a URL draft. `maybeSingle` distinguishes a missing/foreign id
   from a query error so the route can be repaired. */
export async function loadDraft(supabase, userId, draftId) {
  return supabase
    .from("letters")
    .select("id, title, content, signature_path, font_size")
    .eq("id", draftId)
    .eq("sender_id", userId)
    .eq("status", "DRAFT")
    .maybeSingle();
}

/* First save inserts the draft; later saves update the same row. Returns the
   row id so the caller can adopt it and replace the URL. */
export async function writeDraft(supabase, userId, draftId, values) {
  if (draftId) {
    return supabase
      .from("letters")
      .update(values)
      .eq("id", draftId)
      .eq("sender_id", userId)
      .eq("status", "DRAFT")
      .select("id")
      .single();
  }

  return supabase
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
}
