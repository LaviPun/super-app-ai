#!/bin/sh
# Web-service entrypoint: apply migrations, then serve.
# Fails the deploy (and Railway keeps the previous one) if migrate deploy fails.
set -e
cd /app/apps/web
pnpm exec prisma migrate deploy
exec pnpm exec remix-serve build/server/index.js
