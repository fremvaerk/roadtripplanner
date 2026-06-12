# syntax=docker/dockerfile:1

# Road Trip Planner — production image (Bun + Next.js 16 + Prisma 7/libSQL).
# The SQLite database lives on a volume at /data; the schema is synced on start
# with `prisma db push` (this project uses db push, not migrations).

# ---- Base ----
FROM oven/bun:1.3 AS base
WORKDIR /app
ENV NODE_ENV=production

# ---- Dependencies (full, incl. the prisma CLI used at build + startup) ----
FROM base AS deps
COPY package.json bun.lock ./
# Skip postinstall (`prisma generate`) here — the schema isn't copied yet.
RUN bun install --frozen-lockfile --ignore-scripts

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The Google Maps browser key + map id are now read at RUNTIME (server reads env
# and passes them to the client via MapsConfigProvider), so the build needs no
# Maps secrets — nothing Maps-related is baked into the image.
ENV DATABASE_URL="file:/tmp/build.db"
RUN bunx prisma generate
RUN bun run build

# ---- Runner ----
FROM base AS runner
ENV PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/app.db"

# Writable data dir for the SQLite volume, owned by the non-root `bun` user.
RUN mkdir -p /data && chown -R bun:bun /data

COPY --from=build /app/node_modules   ./node_modules
COPY --from=build /app/.next          ./.next
COPY --from=build /app/public         ./public
COPY --from=build /app/lib/generated  ./lib/generated
COPY --from=build /app/package.json   ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/prisma         ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh             ./docker-entrypoint.sh

USER bun
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["./docker-entrypoint.sh"]
