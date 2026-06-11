FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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
 && pnpm --filter @superapp/workers build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/workers/dist ./apps/workers/dist
COPY --from=build /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "apps/workers/dist/start.js"]
