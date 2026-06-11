"use client";

import { useState } from "react";

export function UserMenu({
  session,
}: {
  session: { name?: string | null; email: string; image?: string | null };
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex items-center gap-2 text-sm">
      {session.image && !broken ? (
        // Google avatars 403 when a referrer is sent, so suppress it; hide on any error.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : null}
      <span className="text-muted-foreground">{session.name ?? session.email}</span>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
