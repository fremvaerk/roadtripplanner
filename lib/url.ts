/**
 * Return `raw` only if it's a safe http(s) URL, else null. Use before rendering
 * any user-entered URL as an href to block javascript:/data:/vbscript: XSS.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Return `p` only if it's a safe same-origin local path to redirect to, else
 * null. Rejects protocol-relative (`//host`) and backslash (`/\host`) forms,
 * which browsers resolve to an external origin (open-redirect).
 */
export function safeLocalPath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return null;
  return p;
}
