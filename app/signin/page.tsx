import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");

  const { error } = await searchParams;
  const message =
    error === "forbidden"
      ? "This Google account isn't allowed yet. Ask the owner to share a trip with you."
      : error === "auth"
        ? "Sign-in failed. Please try again."
        : null;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      {/* Ambient map-like backdrop: a faint dot grid + a soft accent glow up top. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 [background-image:radial-gradient(oklch(0.6_0.094_215/0.07)_1px,transparent_1.4px)] [background-size:22px_22px]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_-5%,oklch(0.6_0.094_215/0.10),transparent_70%)]" />
      </div>

      <div className="w-full max-w-sm">
        <div className="rounded-2xl border bg-card/90 p-8 shadow-[0_1px_2px_oklch(0.21_0.012_75/0.06),0_12px_32px_-12px_oklch(0.21_0.012_75/0.18)] backdrop-blur-sm">
          <div className="mb-7 flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <RouteMark />
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Road Trip Planner</h1>
            <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
              Map your route, stops, and overnight stays — day by day.
            </p>
          </div>

          {message ? (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {message}
            </div>
          ) : null}

          <a
            href="/api/auth/login"
            className="flex w-full items-center justify-center gap-3 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-accent hover:shadow active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <GoogleG />
            Continue with Google
          </a>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Access is invite-only — sign in with the Google account you were invited with.
          </p>
        </div>
      </div>
    </main>
  );
}

/** A winding-route + endpoints brand mark. */
function RouteMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 4.5h6a3.5 3.5 0 0 1 0 7h-1a3.5 3.5 0 0 0 0 7h6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 2.6"
      />
      <circle cx="6.5" cy="4.5" r="2.4" fill="currentColor" />
      <circle cx="17.5" cy="18.5" r="2.4" fill="currentColor" />
    </svg>
  );
}

/** Official multi-colour Google "G". */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
