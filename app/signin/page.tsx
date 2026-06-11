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
      ? "This Google account isn't allowed. Ask the owner to share a trip with you."
      : error === "auth"
        ? "Sign-in failed. Please try again."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border bg-card p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold">Road Trip Planner</h1>
        {message ? <p className="mb-4 text-center text-sm text-red-600">{message}</p> : null}
        <a
          href="/api/auth/login"
          className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Continue with Google
        </a>
      </div>
    </main>
  );
}
