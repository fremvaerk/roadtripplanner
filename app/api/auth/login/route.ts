import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthUrl } from "@/lib/auth/oidc";

export async function GET() {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

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

  return NextResponse.redirect(buildAuthUrl({ state, nonce }));
}
