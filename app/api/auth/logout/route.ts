import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/signin", appUrl));
  res.cookies.delete("session");
  return res;
}
