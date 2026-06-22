import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type Session = { userId: string; email: string; name?: string | null; image?: string | null };

const secret = () => {
  // Fail loudly: an empty/short secret would let anyone forge session cookies
  // (HMAC accepts a 0-byte key). Never silently sign/verify with a weak key.
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(raw);
};

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ email: s.email, name: s.name ?? null, image: s.image ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      userId: payload.sub,
      email: payload.email,
      name: (payload.name as string | null) ?? null,
      image: (payload.image as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Read the current request's session cookie (server components / route handlers). */
export async function getSession(): Promise<Session | null> {
  const bypass = await devBypassSession();
  if (bypass) return bypass;
  const token = (await cookies()).get("session")?.value;
  return token ? readSessionToken(token) : null;
}

/**
 * DEV-ONLY auth bypass for local work (design/QA without the Google flow).
 *
 * HARD-GATED so it can never affect production:
 *   - inert unless NODE_ENV !== "production" (the Docker image runs production), AND
 *   - off unless DEV_AUTH_BYPASS === "1" is explicitly set in the local env.
 * When on, it signs in as DEV_AUTH_EMAIL (default: first ALLOWED_EMAILS entry),
 * but only if that user already exists. Never enable these vars in a deployed env.
 */
async function devBypassSession(): Promise<Session | null> {
  if (process.env.NODE_ENV === "production" || process.env.DEV_AUTH_BYPASS !== "1") {
    return null;
  }
  const email = (process.env.DEV_AUTH_EMAIL ?? process.env.ALLOWED_EMAILS ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!email) return null;
  const { prisma } = await import("@/lib/db");
  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, image: true },
  });
  return u ? { userId: u.id, email: u.email, name: u.name, image: u.image } : null;
}
