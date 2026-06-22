import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthUrl } from "@/lib/auth/oidc";
import { safeLocalPath } from "@/lib/url";

export async function GET(req: Request) {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  // Only honour local paths as a post-login destination (no open redirects).
  const safeReturn = safeLocalPath(new URL(req.url).searchParams.get("returnTo"));

  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  };

  const c = await cookies();
  c.set("oauth_state", state, opts);
  c.set("oauth_nonce", nonce, opts);
  if (safeReturn) c.set("oauth_return", safeReturn, opts);

  return NextResponse.redirect(buildAuthUrl({ state, nonce }));
}
