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
  const token = (await cookies()).get("session")?.value;
  return token ? readSessionToken(token) : null;
}
