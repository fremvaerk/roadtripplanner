/** Parse ALLOWED_EMAILS (comma-separated). Empty/unset list ⇒ open mode (everyone allowed). */
export function isAllowedEmail(email: string, raw: string | undefined = process.env.ALLOWED_EMAILS): boolean {
  const list = (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true; // open mode
  return list.includes(email.trim().toLowerCase());
}
