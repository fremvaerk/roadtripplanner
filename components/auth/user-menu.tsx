export function UserMenu({
  session,
}: {
  session: { name?: string | null; email: string; image?: string | null };
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      {session.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={session.image} alt="" className="h-7 w-7 rounded-full" />
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
