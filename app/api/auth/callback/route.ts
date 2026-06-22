import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, verifyIdToken } from "@/lib/auth/oidc";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { signSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const fail = (error: string) => NextResponse.redirect(new URL(`/signin?error=${error}`, appUrl));
  const c = await cookies();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = c.get("oauth_state")?.value;
  const cookieNonce = c.get("oauth_nonce")?.value;
  if (!code || !state || !cookieState || state !== cookieState || !cookieNonce) return fail("auth");
  try {
    const tok = await exchangeCode(code);
    const claims = await verifyIdToken(tok.id_token, { nonce: cookieNonce });
    const email = claims.email.toLowerCase();
    const allowed = isAllowedEmail(email) || (await prisma.tripShare.count({ where: { email } })) > 0;
    if (!allowed) return fail("forbidden");
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: claims.name, image: claims.picture },
      create: { email, name: claims.name, image: claims.picture },
    });
    const jwt = await signSession({ userId: user.id, email: user.email, name: user.name, image: user.image });
    // Return to where login started (e.g. the OAuth consent screen), local only.
    const ret = c.get("oauth_return")?.value;
    const dest = ret && ret.startsWith("/") ? ret : "/";
    const res = NextResponse.redirect(new URL(dest, appUrl));
    res.cookies.set("session", jwt, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_nonce");
    res.cookies.delete("oauth_return");
    return res;
  } catch {
    return fail("auth");
  }
}
