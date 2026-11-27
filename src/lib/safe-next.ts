// The `?next=` value on the login page, accepted only if it is a path on this site.
// Rejects `//host`, `/\host` (browsers read a backslash as a slash), control characters and
// anything that resolves to another origin. Returns the cleaned path, or null.
const BASE = "http://local.invalid";

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
