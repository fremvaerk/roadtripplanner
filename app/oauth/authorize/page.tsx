import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getClient, parseRedirectUris } from "@/lib/oauth/store";
import { isValidChallenge } from "@/lib/oauth/pkce";
import { DEFAULT_SCOPE } from "@/lib/oauth/config";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      </div>
    </main>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const responseType = one(sp.response_type);
  const codeChallenge = one(sp.code_challenge);
  const codeChallengeMethod = one(sp.code_challenge_method);
  const state = one(sp.state);
  const scope = one(sp.scope) || DEFAULT_SCOPE;
  const resource = one(sp.resource);

  // 1. Validate the client + redirect_uri before trusting anything else. On
  // failure we must NOT redirect back (could be an attacker's URI) — show an error.
  if (!clientId || !redirectUri) {
    return <ErrorCard title="Invalid request" detail="Missing client_id or redirect_uri." />;
  }
  const client = await getClient(clientId);
  if (!client) {
    return <ErrorCard title="Unknown client" detail="This application is not registered." />;
  }
  if (!parseRedirectUris(client).includes(redirectUri)) {
    return <ErrorCard title="Redirect mismatch" detail="redirect_uri is not registered for this client." />;
  }

  // 2. Protocol checks (OAuth 2.1: code flow + S256 PKCE only).
  if (responseType !== "code" || codeChallengeMethod !== "S256" || !isValidChallenge(codeChallenge)) {
    return <ErrorCard title="Unsupported request" detail="This server requires response_type=code with S256 PKCE." />;
  }

  // 3. Require a logged-in user; if none, do the Google login and come back here.
  const session = await getSession();
  if (!session) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params.set(k, v);
    redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  // 4. Gate on the allowlist.
  if (!isAllowedEmail(session.email)) {
    return (
      <ErrorCard
        title="Account not allowed"
        detail={`${session.email} isn't permitted to authorize access. Sign in with an allowed account.`}
      />
    );
  }

  const appName = client.name || "An application";

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Authorize access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{appName}</span> wants to access your Road Trip
          Planner trips as <span className="font-medium text-foreground">{session.email}</span>.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          It will be able to read and edit your trips on your behalf.
        </p>

        <form method="POST" action="/oauth/authorize/decision" className="mt-5 flex gap-2">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="code_challenge" value={codeChallenge} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="resource" value={resource} />
          <button
            type="submit"
            name="decision"
            value="deny"
            className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Allow
          </button>
        </form>
      </div>
    </main>
  );
}
