import { prisma } from "@/lib/db";
import type { Session } from "@/lib/auth/session";

let cached: Promise<Session> | null = null;

/** The single owner this MCP server acts as. Memoized per process. */
export function resolveOwnerSession(): Promise<Session> {
  return (cached ??= resolve());
}

async function resolve(): Promise<Session> {
  const ownerEmail = (process.env.MCP_OWNER_EMAIL ?? process.env.ALLOWED_EMAILS ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!ownerEmail) throw new Error("Set MCP_OWNER_EMAIL or ALLOWED_EMAILS");
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail, name: "MCP Owner" },
  });
  return { userId: user.id, email: user.email };
}
