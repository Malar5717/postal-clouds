/* Browser-side Cloudinary uploads. The app has no backend, so uploads use an
   unsigned preset scoped to signature images. The returned secure URL is the
   durable copy; the compose editor still keeps the local PNG for recovery. */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() ?? "";
const UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim() ?? "";

export function isCloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export async function uploadSignature(dataUrl) {
  if (!isCloudinaryConfigured()) {
    throw new Error("signature storage is not configured");
  }

  const formData = new FormData();
  formData.append("file", dataUrl);
  formData.append("upload_preset", UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`,
    { method: "POST", body: formData },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || "could not upload signature");
  }

  const body = await response.json();
  const url = body?.secure_url || body?.url;

  if (!url) {
    throw new Error("cloudinary did not return a signature URL");
  }

  return url;
}

/* SignaturePad's canvas API needs a data URL. Fetch the stored image instead
   of handing a cross-origin URL to the canvas, which would taint it and make a
   later toDataURL() fail. */
export async function imageUrlToDataUrl(url) {
  const response = await fetch(url, { mode: "cors" });

  if (!response.ok) {
    throw new Error("could not load signature");
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("could not read signature"));
    reader.readAsDataURL(blob);
  });
}
