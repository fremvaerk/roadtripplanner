# Google OIDC Auth, Ownership & Sharing — Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. This is Next.js **16** — `middleware` is renamed to `proxy` (we don't use it), read `node_modules/next/dist/docs/01-app/...` before touching framework conventions. Do NOT run `bunx prettier --write` on large files (`components/planner-shell.tsx`, `components/trip-map.tsx`) — no prettier config; it reflows them into huge diffs. When a subagent commits, stage only the files it changed (never `git add -A`). Security-sensitive: get the OIDC/session/guard logic exactly right; favor 404 over 403 for non-members to avoid leaking existence.

**Goal:** Google sign-in (OIDC via `jose`), allowlist admission (empty allowlist = open), per-user trip ownership closing the IDOR, and trip sharing as viewer (read-only) / editor (full) with a read-only UI mode.

**Tech:** Bun, Next.js 16, React 19, Prisma 7 + libSQL, TanStack Query, `jose`. Session = signed JWT in an httpOnly cookie. No `next-auth`.

---

## Owner setup (manual, needed only for the live smoke test — Task 9)

The owner creates a Google OAuth 2.0 Client (Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application):
- Authorized redirect URIs: `http://localhost:5001/api/auth/callback` (and the prod URL later).
- Authorized JavaScript origins: `http://localhost:5001`.
Then set in `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` (`openssl rand -base64 32`), `APP_URL=http://localhost:5001`, `ALLOWED_EMAILS=` (empty = open, or comma-separated). All other tasks build/test without this.

---

### Task 1: deps + schema + env scaffolding

**Files:** `package.json` (add dep), `prisma/schema.prisma`, `.env.example` (create), `lib/env.ts` (create, optional helper).

- [ ] `bun add jose`.
- [ ] Add to `prisma/schema.prisma`: the `User` and `TripShare` models (see spec). On `Trip` add `userId String?`, `user User? @relation(fields: [userId], references: [id], onDelete: Cascade)`, `shares TripShare[]`, and `@@index([userId])`.
- [ ] Push to both DBs + regenerate: `bunx prisma db push` then `DATABASE_URL="file:./test.db" bunx prisma db push --accept-data-loss` then `bunx prisma generate`.
- [ ] Create `.env.example` documenting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `APP_URL`, `ALLOWED_EMAILS` (note: empty = everyone allowed).
- [ ] `bun run build` compiles. Commit (`prisma/schema.prisma .env.example package.json bun.lock`).

---

### Task 2: auth core libs (pure, fully tested)

**Files:** create `lib/auth/allowlist.ts`, `lib/auth/oidc.ts`, `lib/auth/session.ts` + tests under `tests/auth/`.

- [ ] **allowlist.ts** — `export function isAllowedEmail(email: string, raw = process.env.ALLOWED_EMAILS): boolean`: parse `raw` → list of trimmed lowercased non-empty entries; if list is empty return `true`; else return `list.includes(email.trim().toLowerCase())`. Test: empty/undefined/whitespace → any email true; populated → only-members true, others false; case/space-insensitive.
- [ ] **session.ts** — uses `jose`. `const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET)`. `export async function signSession(s: {userId:string;email:string;name?:string|null;image?:string|null}): Promise<string>` → `new SignJWT({email,name,image}).setProtectedHeader({alg:"HS256"}).setSubject(s.userId).setIssuedAt().setExpirationTime("30d").sign(secret())`. `export async function readSessionToken(token: string): Promise<Session|null>` → `jwtVerify`; map to `{userId: payload.sub, email, name, image}`; return null on any error. Test (set `process.env.AUTH_SECRET` in the test): sign→read roundtrip; tampered token → null; expired token → null; wrong secret → null.
- [ ] **oidc.ts** — constants for Google endpoints + issuers + `clientId()/clientSecret()/redirectUri()` from env (`${APP_URL}/api/auth/callback`). `buildAuthUrl({state,nonce})` → authorization URL (`response_type=code`, `scope=openid email profile`, `prompt=select_account`, `access_type=online`). `exchangeCode(code)` → POST form to token endpoint, return JSON (`id_token` etc.); throw on non-200. `validateIdTokenClaims(payload, {clientId, nonce})` (PURE) → assert `aud===clientId`, `iss ∈ {accounts.google.com, https://accounts.google.com}`, `payload.nonce===nonce`, `email_verified===true`, return `{email, name, picture}` else throw. `verifyIdToken(idToken, {nonce})` → `jwtVerify(idToken, createRemoteJWKSet(new URL(JWKS_URI)), {audience: clientId(), issuer: [...]})` then `validateIdTokenClaims`. Test the PURE `validateIdTokenClaims` with crafted payloads (valid; wrong aud; wrong iss; bad nonce; email_verified false) — no network.
- [ ] All `tests/auth/*` pass; build OK. Commit.

---

### Task 3: auth routes + sign-in page + header auth control

**Files:** create `app/api/auth/login/route.ts`, `app/api/auth/callback/route.ts`, `app/api/auth/logout/route.ts`, `app/signin/page.tsx`, `components/auth/user-menu.tsx`. Reads Next 16 route-handler doc first.

- [ ] **getSession helper** in `lib/auth/session.ts`: `export async function getSession(): Promise<Session|null>` — `const c = await cookies(); const t = c.get("session")?.value; return t ? readSessionToken(t) : null;` (import `cookies` from `next/headers`).
- [ ] **login route** (GET): create `state`/`nonce` via `crypto.randomUUID()` (×2 or random bytes); set httpOnly cookies `oauth_state`,`oauth_nonce` (sameSite=lax, 10-min maxAge, secure in prod); `redirect(buildAuthUrl({state,nonce}))` (use `NextResponse.redirect`).
- [ ] **callback route** (GET): read `code`,`state` from `req.nextUrl.searchParams`; read cookies `oauth_state`,`oauth_nonce`; if `!code || state!==cookieState` → redirect `/signin?error=auth`; `const tok = await exchangeCode(code)`; `const claims = await verifyIdToken(tok.id_token, {nonce: cookieNonce})`; admission: `if (!isAllowedEmail(claims.email) && (await prisma.tripShare.count({where:{email: claims.email.toLowerCase()}})) === 0)` → redirect `/signin?error=forbidden`; `const user = await prisma.user.upsert({ where:{email}, update:{name,image:picture}, create:{email,name,image:picture} })`; `const jwt = await signSession({userId:user.id,email:user.email,name,image})`; set `session` cookie (httpOnly, sameSite=lax, secure in prod, 30d); clear oauth cookies; redirect `/`. Wrap in try/catch → `/signin?error=auth`.
- [ ] **logout route** (POST): clear `session` cookie; redirect `/signin`.
- [ ] **signin page** (server component): if `await getSession()` → `redirect("/")`; else render a card with "Continue with Google" linking to `/api/auth/login`, and an error message when `searchParams.error` is `forbidden` ("This Google account isn't allowed.") or `auth` ("Sign-in failed, try again.").
- [ ] **user-menu.tsx** (server or client): shows `session.name`/`image` and a sign-out `<form action="/api/auth/logout" method="post">` button.
- [ ] `bun run build` compiles. Commit. (Live login deferred to Task 9.)

---

### Task 4: access resolution + guards (tested against test.db)

**Files:** create `lib/auth/access.ts`, `lib/auth/guards.ts`, `tests/auth/access.test.ts`.

- [ ] **access.ts** — `export type Session = {userId:string; email:string; name?:string|null; image?:string|null}` (or import). `export type Role = "owner"|"editor"|"viewer"`. `effectiveRole(prisma, session, tripId): Promise<Role|null>`: load `trip = prisma.trip.findUnique({where:{id:tripId}, select:{userId:true}})`; if `!trip` return null; if `trip.userId===session.userId` return "owner"; `const share = await prisma.tripShare.findUnique({where:{tripId_email:{tripId, email: session.email.toLowerCase()}}})`; return share ? share.role as Role : null. `tripIdOf(prisma, kind: "day"|"poi"|"group"|"via", id): Promise<string|null>` via the matching findUnique select tripId (day→`day.tripId`, poi→`poi.tripId`, group→`poiGroup.tripId`, via→`routeVia.tripId`).
- [ ] **guards.ts** — typed errors `class HttpError extends Error { constructor(public status:number, msg:string) }`. `requireSession()` → getSession or throw `new HttpError(401,...)`. `requireRead(prisma, session, tripId)` → role = effectiveRole; if null throw 404; return role. `requireWrite(...)` → role null → 404; role "viewer" → 403; return role. `requireOwner(...)` → role!=="owner" → (null?404:403). Helpers `requireWriteForDay/Poi/Group/Via` = resolve `tripIdOf` (404 if null) then `requireWrite`.
- [ ] Tests: seed two users + a trip owned by A, plus a viewer share for B and an editor share for C; assert effectiveRole returns owner/viewer/editor/null appropriately; requireRead ok for all members, 404 for stranger; requireWrite ok for owner/editor, 403 for viewer, 404 for stranger; requireOwner only for A.
- [ ] Tests pass; build OK. Commit.

---

### Task 5: scope trip service + pages

**Files:** modify `lib/trips/service.ts`, `app/page.tsx`, `app/trips/[tripId]/page.tsx`, `tests/**` that call the service.

- [ ] **service.ts**: `createTrip(prisma, data, userId)` sets `userId`. `getTrip(prisma, id, session)` → compute role via effectiveRole; if null return null; else return the trip (existing include) plus `role`. `listTrips(prisma, session)` → `prisma.trip.findMany({ where: { OR: [{userId: session.userId}, {shares: {some:{email: session.email.toLowerCase()}}}] }, orderBy:{updatedAt:"desc"} })`, then annotate each with role (owner if userId match else its share role). `updateTrip(prisma, id, patch, session)` → `requireWrite` then update. `deleteTrip(prisma, id, session)` → `requireOwner` then delete.
- [ ] **app/page.tsx**: `const session = await getSession(); if (!session) redirect("/signin");` then `listTrips(prisma, session)`; render with a UserMenu and (per trip) a role badge for shared trips.
- [ ] **app/trips/[tripId]/page.tsx**: `const session = await getSession(); if (!session) redirect("/signin");` `const trip = await getTrip(prisma, tripId, session); if (!trip) notFound();` pass `role={trip.role}` to `<PlannerShell>`.
- [ ] Update tests that call `createTrip`/`getTrip` (e.g. `tests/itinerary/days.test.ts`, split/optimize tests, trips service tests): seed a `user` in `beforeEach` and pass `userId`/a session `{userId,email}`. Add cross-user isolation tests (B can't getTrip A's unshared trip; viewer can read not write; editor can write not delete; listTrips returns owned ∪ shared).
- [ ] `bun run test` + `bun run build` pass. Commit.

---

### Task 6: harden all API routes

**Files:** the 15 route files under `app/api/**`. Pattern per handler: `const session = await getSession(); if (!session) return NextResponse.json({error:"Unauthorized"},{status:401});` then the right guard, catching `HttpError` → its status. Map:
- `app/api/trips/route.ts`: GET = listTrips(session); POST(create) = createTrip(…, session.userId).
- `app/api/trips/[tripId]/route.ts`: GET → requireRead; PATCH → requireWrite; DELETE → requireOwner.
- `app/api/trips/[tripId]/route/route.ts` (GET compute route) → requireRead.
- `app/api/trips/[tripId]/{days,pois,groups,vias,split,resplit}/route.ts` (mutations) → requireWrite(tripId).
- `app/api/days/[dayId]/**`, `app/api/pois/[poiId]/**`, `app/api/groups/[groupId]/**`, `app/api/vias/[viaId]/**` (all mutations) → `requireWriteForDay/Poi/Group/Via`.
- [ ] Add a small `lib/auth/route.ts` `withSession`/try-catch helper if it reduces repetition, or inline. Keep each route's existing logic otherwise unchanged.
- [ ] `bun run build` + `bun run test` pass. Commit.

---

### Task 7: share management (service + routes + dialog)

**Files:** `lib/trips/shares.ts` (+ test), `app/api/trips/[tripId]/shares/route.ts` (GET list, POST add/update), `app/api/trips/[tripId]/shares/[shareId]/route.ts` (PATCH role, DELETE), `lib/api/trips.ts` (+request fns), `hooks/use-share-mutations.ts`, `components/share-dialog.tsx`, planner header button (owner only).

- [ ] **shares.ts**: `listShares(prisma, tripId)`; `upsertShare(prisma, tripId, email, role)` (validate role ∈ {viewer,editor}, lowercase email, reject the owner's own email); `setShareRole`, `removeShare`. Tests.
- [ ] **routes**: all guarded by `requireOwner`. POST body `{email, role}` (zod). 
- [ ] **share-dialog.tsx** (client, owner only): list shares (email + role select + remove), an add row (email input + role select). Wire via TanStack Query. Trigger from a "Share" button in the planner header shown only when `role==="owner"`.
- [ ] Build + tests pass. Commit.

---

### Task 8: read-only UI mode

**Files:** create `components/planner-role.tsx` (context), modify `components/planner-shell.tsx` and the mutating child components.

- [ ] **planner-role.tsx**: `PlannerRoleProvider` + `usePlannerRole()` exposing `{ role, canEdit: role !== "viewer" }`. `PlannerShell` receives `role` prop and wraps its tree.
- [ ] Gate mutating controls on `canEdit` (hide or `disabled`): in `planner-shell.tsx` (add place, build/split, add/insert/remove day, optimize, color pickers, start/finish editors, share button stays owner-only); `poi-card.tsx`, `catalog-row.tsx` (edit/remove/drag/day-select), `day-night.tsx` (editor/clear), `group-section.tsx`/`master-list.tsx` (group add/rename/delete), `trip-map.tsx` (suppress add-on-click, context menu, marker right-click, place-info Edit/Remove + day-assign, via drag/add, night drag) — pass `canEdit` into `TripMap` and gate handlers there. Keep all read/nav/export working.
- [ ] Show a "Read-only — shared with you" banner at the top of the planner when `!canEdit`.
- [ ] **Client safety nets** in `lib/api/trips.ts` fetch wrapper (or query client): on 401 → `window.location.href="/signin"`; on 403 → throw a typed error the UI can toast "Read-only access".
- [ ] Build + tests pass. Hand-edit `planner-shell.tsx`/`trip-map.tsx` (no prettier). Commit.

---

### Task 9: backfill + live smoke test

- [ ] Ensure owner `.env.local` is set (see Owner setup). Start dev server.
- [ ] Live: visiting any page while signed out → `/signin`; "Continue with Google" → Google → back signed in. A non-allowlisted, non-shared account → `/signin?error=forbidden`.
- [ ] Backfill: after the owner's first login (User row exists), set `userId` on the two null-owner trips to the owner's user id (one-time Prisma script, like prior migrations). Confirm they appear in the owner's list.
- [ ] Share a trip with a second Google account as viewer → that account signs in, sees the trip read-only (no edit controls, writes 403), can use Navigate/exports. Change to editor → can edit. Remove share → 404.
- [ ] No console errors. `bun run build` + `bun run test` green.

---

### Task 10: review + merge

- [ ] Dispatch a security-focused review over `git diff main...HEAD` against the spec — emphasis: every API route enforces session + correct guard; no read/write/owner mismatch; 404-vs-403 leak; id_token verification (aud/iss/exp/nonce/email_verified, signature via JWKS); session cookie flags (httpOnly, sameSite, secure-in-prod); state/CSRF; allowlist empty-mode; share email normalization; no unscoped `findMany`/`findUnique` on trip data left.
- [ ] Apply high-confidence fixes, then `superpowers:finishing-a-development-branch` to merge to `main` (`--no-ff`, delete branch). Add a memory updating [[auth-deferred]] → auth implemented.
