# apps/web production image — WS-B deployability-gate version.
#
# Purpose today: prove every master push builds a runnable image
# (.github/workflows/deploy.yml). WS-A (launch-program D1, Railway) hardens
# this: multi-stage prod-only prune, worker-service entrypoint, healthcheck,
# and real runtime env injection. Keep the build root at the REPO ROOT —
# apps/web imports @superapp/* workspace packages from their dist/.
FROM node:20-bookworm-slim

# Prisma engines need openssl; git-less image → husky must not run.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV HUSKY=0
RUN npm install -g pnpm@9.15.9

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile

# Build-time placeholders: remix vite:build loads server modules that read
# these. Real values are injected at RUNTIME by the platform (WS-A). Keep in
# sync with the CI build job's placeholder env (.github/workflows/ci.yml).
ENV NODE_ENV=production \
    SHOPIFY_API_KEY=docker-build-placeholder \
    SHOPIFY_API_SECRET=docker-build-placeholder \
    SHOPIFY_APP_URL=https://placeholder.example.com \
    SCOPES=read_products \
    DATABASE_URL=file:./dev.db \
    ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    INTERNAL_ADMIN_PASSWORD=docker-build-placeholder \
    INTERNAL_ADMIN_SESSION_SECRET=docker-build-placeholder

# Workspace dists first (topological), then the app itself
# (web's build script = `prisma generate && remix vite:build`).
RUN pnpm --filter "web^..." run --if-present build
RUN pnpm --filter web build

ENV PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
