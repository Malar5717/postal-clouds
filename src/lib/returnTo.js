/* Remembers the protected page a signed-out visitor was trying to reach, so
   Clerk can send them back there after sign-in/sign-up instead of always
   landing on /home.

   sessionStorage (not local) is intentional: the destination belongs to one
   tab/session. It also survives Clerk's OAuth redirects, which location state
   does not reliably do. */

const STORAGE_KEY = "postal-clouds:returnTo";
const MAX_AGE_MS = 30 * 60 * 1000;

/* Only accept internal paths. Reject protocol-relative paths and backslashes,
   which browsers can normalize into an external URL. */
function isSafePath(value) {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export function rememberReturnTo(path) {
  if (typeof sessionStorage === "undefined" || !isSafePath(path)) return;

  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ path, at: Date.now() }),
    );
  } catch {
    /* Storage can be unavailable (private mode); fall back to /home. */
  }
}

export function readReturnTo() {
  if (typeof sessionStorage === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (
      !saved ||
      !isSafePath(saved.path) ||
      typeof saved.at !== "number" ||
      Date.now() - saved.at > MAX_AGE_MS
    ) {
      return null;
    }

    return saved.path;
  } catch {
    return null;
  }
}

export function clearReturnTo() {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Ignore unavailable storage. */
  }
}
