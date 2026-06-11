# Platform V2 workers — Railway / container deploy
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/workers/package.json apps/workers/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/network-security/package.json packages/network-security/package.json
RUN pnpm install --frozen-lockfile --filter @superapp/workers...

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/workers apps/workers
COPY packages/platform-contracts packages/platform-contracts
COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/network-security packages/network-security
RUN pnpm --filter @superapp/platform-contracts build \
  && pnpm --filter @superapp/core build \
  && pnpm --filter @superapp/db build \
  && pnpm --filter @superapp/network-security build \
  && pnpm --filter @superapp/workers build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/workers/dist ./apps/workers/dist
COPY --from=build /app/apps/workers/package.json ./apps/workers/package.json
COPY --from=build /app/packages/platform-contracts/dist ./packages/platform-contracts/dist
COPY --from=build /app/packages/platform-contracts/package.json ./packages/platform-contracts/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/network-security/dist ./packages/network-security/dist
COPY --from=build /app/packages/network-security/package.json ./packages/network-security/package.json
EXPOSE 8080
ENV WORKER_HEALTH_HOST=0.0.0.0
ENV WORKER_HEALTH_PORT=8080
CMD ["node", "apps/workers/dist/main.js"]
