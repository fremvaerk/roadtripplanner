# Deploy

The app ships as a single Docker image (Bun + Next.js 16 + Prisma 7/libSQL, SQLite
on a mounted volume). The release workflow builds and publishes it to GHCR.

## Cutting a release

Releases are tag-driven. From a green `main`:

```sh
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` then:

1. Builds the production image from `Dockerfile` (linux/amd64).
2. Pushes it to **`ghcr.io/fremvaerk/roadtripplanner`** tagged `1.0.0`, `1.0`, `1`, and `latest`
   (via `docker/metadata-action` semver patterns).
3. Creates a GitHub Release with auto-generated notes and the pull command.

> Tags must be semver-ish (`vMAJOR.MINOR.PATCH`). The leading `v` is stripped for
> the image tag. Re-running for an existing tag overwrites the moving tags
> (`latest`, `1`, `1.0`) but you should bump the patch for a real change.

## Required GitHub settings

**None for the build.** The image bakes in no Maps keys — the browser key and map
id are runtime env (read server-side, passed to the client), so CI needs no Maps
secrets and the build is fully reproducible from public source.

`GITHUB_TOKEN` (automatic) pushes to GHCR — the workflow has `packages: write`. The
first push creates the package as **private**; link it to the repo and set its
visibility under the org's *Packages* settings if you want it pullable.

## Runtime env (set on your host / orchestrator, NOT baked into the image)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path on the volume, e.g. `file:/data/app.db` (the image defaults to this). |
| `GOOGLE_MAPS_BROWSER_KEY` | Browser Maps-JS key (public; restrict by HTTP referrer). Served to the client at request time. See [google-maps.md](./google-maps.md) for required APIs. |
| `GOOGLE_MAPS_MAP_ID` | Map ID for Advanced Markers (optional; defaults to `DEMO_MAP_ID`). |
| `AUTH_SECRET` | Signs the session JWT. `openssl rand -base64 32`. |
| `APP_URL` | Public base URL; builds the OAuth redirect URI. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OIDC web client. Authorized redirect: `${APP_URL}/api/auth/callback`. |
| `GOOGLE_MAPS_SERVER_KEY` | Geocoding/Places/Routes (server-side). Restrict by IP/API. |
| `ALLOWED_EMAILS` | Comma-separated allow-list; empty = open sign-up. |
| `MCP_OWNER_EMAIL` | Owner the MCP server acts as (defaults to first `ALLOWED_EMAILS`). |
| `MCP_AUTH_TOKEN` | Bearer token enabling `POST /api/mcp`. **Unset ⇒ the MCP endpoint is disabled (401).** |

The container runs `docker-entrypoint.sh`, which syncs the schema (`prisma db push`)
into the volume DB on start, then serves on `:3000`. Mount a volume at `/data` to
persist the database.

```sh
docker run -p 3000:3000 -v roadtrip-data:/data \
  -e AUTH_SECRET=... -e APP_URL=https://trips.example.com \
  -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... \
  -e GOOGLE_MAPS_SERVER_KEY=... -e GOOGLE_MAPS_BROWSER_KEY=... \
  -e MCP_AUTH_TOKEN=... \
  ghcr.io/fremvaerk/roadtripplanner:latest
```
