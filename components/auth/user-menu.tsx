"use client";

import { useState } from "react";

/** Compact account control: an avatar button that opens a dropdown with the
 *  signed-in name/email and Sign out — keeps the page header uncluttered. */
export function UserMenu({
  session,
}: {
  session: { name?: string | null; email: string; image?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const initial = (session.name?.trim()?.[0] ?? session.email[0] ?? "?").toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[oklch(0.6_0.094_215)] text-sm font-semibold text-white ring-offset-2 ring-offset-background transition hover:ring-2 hover:ring-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {session.image && !broken ? (
          // Google avatars 403 when a referrer is sent, so suppress it; fall back to the initial.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
          >
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium">{session.name ?? "Signed in"}</div>
              <div className="truncate text-xs text-muted-foreground">{session.email}</div>
            </div>
            <div className="my-1 h-px bg-border" />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
