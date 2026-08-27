# syntax=docker/dockerfile:1
# Build context: repository root. Build with:
#   docker build -t superapp-web -f apps/web/Dockerfile .
# One image serves both Railway services:
#   web    (default CMD): prisma migrate deploy + remix-serve on $PORT
#   worker (startCommand override): pnpm --filter web worker:start

FROM node:20-alpine AS base
# Prisma's query engine needs libssl at runtime; node:20-alpine ships neither
# openssl nor libssl, so `prisma generate` (build stage) and the engine binary
# (runtime stage) both need it installed here.
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app

FROM base AS build
# Manifests first for install-layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/job-orchestration/package.json packages/job-orchestration/package.json
COPY packages/network-security/package.json packages/network-security/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/rate-limit/package.json packages/rate-limit/package.json
RUN pnpm install --frozen-lockfile --filter web...

# Sources. apps/workers is no longer copied — WS-C (D2/C5) ported its only
# live import (image-storage processor) into apps/web/app/services/assets/.
COPY packages packages
COPY apps/web apps/web

# Build web's workspace dependencies in topological order, then the app.
RUN pnpm --filter "web^..." build
RUN pnpm --filter web exec prisma generate
RUN pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
RUN chmod +x /app/apps/web/docker-start.sh
EXPOSE 3000
CMD ["/app/apps/web/docker-start.sh"]
