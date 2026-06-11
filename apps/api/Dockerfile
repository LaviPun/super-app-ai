FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/workers/package.json apps/workers/
COPY packages/platform-contracts/package.json packages/platform-contracts/
COPY packages/job-orchestration/package.json packages/job-orchestration/
COPY packages/security/package.json packages/security/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @superapp/platform-contracts build \
 && pnpm --filter @superapp/security build \
 && pnpm --filter @superapp/job-orchestration build \
 && pnpm --filter @superapp/workers build \
 && pnpm --filter @superapp/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health || exit 1
CMD ["node", "apps/api/dist/index.js"]
