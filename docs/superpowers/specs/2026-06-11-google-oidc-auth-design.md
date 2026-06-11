# Google OIDC Authentication, Ownership & Sharing — Design

**Goal:** Require Google sign-in to use the app, restrict access to an allowlist of accounts, make every trip owned by and scoped to a user (closing the current IDOR), and let owners share a trip with others as **viewer** (read-only) or **editor** (full access).

## Decisions

- **Access model:** allowlist + shares. Anyone can attempt Google login; admitted iff `email ∈ ALLOWED_EMAILS` **or** the email has at least one trip share. **If `ALLOWED_EMAILS` is empty/unset, everyone is admitted (open mode)** — the allowlist acts as an optional lock. Allowlisted (or all, in open mode) accounts own/create trips; shared accounts can sign in but see only trips shared with them.
- **Roles:** each trip has one **owner** (creator, full control incl. delete + manage sharing). Owners share with others as **editor** (read+write the trip's content, but cannot delete the trip or manage its sharing) or **viewer** (read-only). Shares are keyed by **email**, so you can invite someone before they've ever signed in.
- **Existing trips:** the two current trips are backfilled to the owner's user on first login.
- **Library:** none for auth — a direct OIDC flow using **`jose`** (JWT sign/verify + remote JWKS). Rationale: Next.js 16 renamed `middleware`→`proxy` and `next-auth@5` is beta built around the old convention; a hand-rolled single-provider flow on stable route-handler + cookie primitives is lower-risk and fully reviewable. `jose` is the only new runtime dependency.

## Data model (prisma/schema.prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())
  trips     Trip[]
}

model TripShare {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  email     String   // lowercased; the invited person (may not have a User row yet)
  role      String   // "viewer" | "editor"
  createdAt DateTime @default(now())
  @@unique([tripId, email])
  @@index([email])
}
```
`Trip` gains `userId String?` + `user User? @relation(fields: [userId], references: [id], onDelete: Cascade)` + `@@index([userId])` + `shares TripShare[]`. `userId` is nullable so existing rows survive `db push`; always set on create; reads filter by ownership-or-share, so null-owner unshared rows are invisible until backfilled.

No Account/Session tables — the session is a self-contained signed JWT cookie; the `User` row is upserted by email on each login. Shares key on email (not userId) so an invite works before the invitee's first login.

## Sharing & roles

- **Effective role** of a session on a trip: `owner` if `trip.userId === userId`; else the `TripShare.role` for `(trip.id, session.email)`; else `none`. `owner`/`editor` ⇒ write; any of the three (owner/editor/viewer) ⇒ read.
- **Admission at login:** `isAllowedEmail(email) || (tripShare.count({ where: { email } }) > 0)`. Verified-but-unadmitted users land on `/signin?error=forbidden`.
- **Trip list:** owned trips ∪ trips shared with the session email, each annotated with the viewer's role (so the UI can label "shared" and pick read-only mode).
- **Share management** (owner only): list shares, add `(email, role)`, change role, remove. Endpoints under `/api/trips/[tripId]/shares`. Inviting the owner's own email or an existing share updates rather than duplicates (the unique key enforces one row per email per trip).

## Auth flow (`lib/auth/*` + `app/api/auth/*`)

**Env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` (≥32 bytes, signs the session JWT), `ALLOWED_EMAILS` (comma-separated), `APP_URL` (e.g. `http://localhost:5001`). Documented in `.env.example`.

**`lib/auth/oidc.ts`** — Google endpoints (authorization `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`, JWKS `https://www.googleapis.com/oauth2/v3/certs`, issuers `accounts.google.com` / `https://accounts.google.com`). Functions: `buildAuthUrl({state, nonce})`; `exchangeCode(code)` → token response; `verifyIdToken(idToken, {nonce})` → verified claims via `jwtVerify` against a cached `createRemoteJWKSet`, asserting `aud === GOOGLE_CLIENT_ID`, `iss ∈ issuers`, `exp` valid, `nonce` matches, and `email_verified === true`; throws on any failure.

**`lib/auth/session.ts`** — `signSession({userId,email,name,image})` → JWT (HS256, `AUTH_SECRET`, 30-day exp); `readSessionToken(token)` → claims or null; `getSession()` reads the `session` cookie (via `next/headers cookies()`) and returns `{userId,email,name,image} | null`.

**`lib/auth/allowlist.ts`** — `isAllowedEmail(email)` parses `ALLOWED_EMAILS` (trim, lowercase, comma-split). **If the parsed list is empty (unset or blank), it returns `true` for any email (open mode).** Otherwise it tests membership. Admission also passes if the email has a share (checked in the callback against the DB).

**Routes:**
- `GET /api/auth/login` — make random `state` + `nonce`, set them as short-lived httpOnly cookies, redirect to `buildAuthUrl` (`scope=openid email profile`, `prompt=select_account`).
- `GET /api/auth/callback` — verify `state` vs cookie; `exchangeCode`; `verifyIdToken`; if not (`isAllowedEmail` or has-share) → redirect `/signin?error=forbidden`; upsert `User` by email (update name/image); `signSession`; set httpOnly `secure`(prod) `sameSite=lax` `session` cookie; clear state/nonce; redirect `/`. Any verification failure → `/signin?error=auth`.
- `POST /api/auth/logout` — clear `session` cookie, redirect `/signin`.

## Enforcement (role-aware)

- **`lib/auth/access.ts`** — `effectiveRole(prisma, {userId, email}, tripId): "owner"|"editor"|"viewer"|null` (owner by `trip.userId`, else share by email). `tripIdOf(prisma, kind, id)` resolves a day/poi/group/via to its trip id.
- **`lib/auth/guards.ts`** — `requireSession()` (getSession or throw `Unauthorized`→401); `requireRead(session, tripId)` (role ∈ all ⇒ ok, else `NotFound`→404, so non-members can't probe existence); `requireWrite(session, tripId)` (role ∈ {owner,editor} ⇒ ok; viewer ⇒ `Forbidden`→403; non-member ⇒ 404); `requireOwner(session, tripId)` for delete + share management. For indirect resources, resolve to tripId first via `tripIdOf`.
- **Service (`lib/trips/service.ts`)** — `getTrip(prisma, id, session)` returns the trip only if the session can read it, and includes the caller's `role` in the payload; `listTrips(prisma, session)` = owned ∪ shared, annotated with role; `createTrip` sets `userId`; `updateTrip`/`deleteTrip` enforce write/owner.
- **Pages** — `app/page.tsx` and `app/trips/[tripId]/page.tsx` call `getSession()`; redirect to `/signin` when absent; the trip page loads via the read-scoped `getTrip` (`notFound()` on null) and passes the caller's `role` into the planner.
- **API routes (all 15 + new shares routes)** — each handler: `requireSession()` → 401; then `requireRead` (the two GET trip/route reads) or `requireWrite` (every mutation) or `requireOwner` (DELETE trip, `/shares/*`) on the resolved trip id.
- **Client** — cookies sent automatically; a 401 from any query/mutation redirects to `/signin` (expiry safety net); a 403 surfaces a "read-only" toast.

## UI

- **`app/signin/page.tsx`** — "Continue with Google" → `/api/auth/login`; messages for `?error=forbidden` ("This account isn't allowed") and `?error=auth`; redirects to `/` if already signed in.
- **Header** (home + planner) — user name/avatar + sign-out form (POST `/api/auth/logout`).
- **Read-only mode** — the planner receives the caller's `role`; a `PlannerRole` context exposes `canEdit = role !== "viewer"`. Every mutating control (add/edit/remove/drag handles, day add/insert/remove, optimize, night editor, group + via editing, color pickers, map add/preview-add/context-menu, place-info edit/remove, day-assign selects) is hidden or disabled when `!canEdit`; a "Read-only — shared with you" banner shows at top. Navigation/export (Google Maps links, KML/GPX) and map viewing remain available. The API 403 is the hard boundary behind this.
- **Share dialog** (owner only) — from the planner header: list current shares (email + role), add by email with a role select, change role, remove. Backed by `/api/trips/[tripId]/shares` (GET/POST/PATCH/DELETE, owner-guarded).

No `proxy.ts`: enforcement lives in server components + route handlers (airtight and Next-16-safe); proxy is deferred.

## Testing

Unit: `isAllowedEmail`; session JWT sign→read roundtrip and tamper/expiry rejection; `verifyIdToken` claim validation via a pure `validateIdTokenClaims(payload,{clientId,nonce})` (crafted payloads — aud/iss/exp/nonce/email_verified pass+fail) separate from the network; `effectiveRole`/access resolution (owner, editor, viewer, non-member → owner/editor/viewer/null) and the read/write/owner guards (read ok for viewer; write 403 for viewer; non-member 404; owner-only for delete/shares); service scoping incl. cross-user isolation (user B can't read/list/update/delete user A's unshared trip; a viewer share grants read but not write; an editor share grants write but not delete/share); `listTrips` returns owned ∪ shared with correct roles. Existing service-dependent tests updated to seed a user and pass a session. The live OAuth round-trip, allowlist + share admission, read-only UI, share dialog, and backfill are verified by a manual smoke test (real Google login, two accounts).

## Backfill

After the owner signs in once (creating their `User`), set `userId` on the two null-owner trips to that user (one-time script, like prior data migrations).

## Out of scope

Open multi-user signup (allowlist + shares only), token refresh / long-lived offline access, multi-provider, account settings UI, `proxy.ts` edge gating, email notifications on share, transfer-ownership, per-resource (sub-trip) permissions.
