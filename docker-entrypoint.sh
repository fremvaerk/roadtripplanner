#!/bin/sh
set -e

# Sync the schema into the (volume-mounted) SQLite database. Idempotent; refuses
# destructive changes unless --accept-data-loss is added. This project uses
# `db push` rather than migrations.
echo "→ Syncing database schema (prisma db push)…"
bunx prisma db push --skip-generate

echo "→ Starting Next.js on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec bunx next start -H "${HOSTNAME:-0.0.0.0}" -p "${PORT:-3000}"
