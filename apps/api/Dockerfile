# Platform V2 API — Railway / container deploy
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/network-security/package.json packages/network-security/package.json
RUN pnpm install --frozen-lockfile --filter @superapp/api...

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/platform-contracts packages/platform-contracts
COPY packages/db packages/db
COPY packages/network-security packages/network-security
RUN pnpm --filter @superapp/platform-contracts build \
  && pnpm --filter @superapp/db build \
  && pnpm --filter @superapp/network-security build \
  && pnpm --filter @superapp/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/platform-contracts/dist ./packages/platform-contracts/dist
COPY --from=build /app/packages/platform-contracts/package.json ./packages/platform-contracts/package.json
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/packages/network-security/dist ./packages/network-security/dist
COPY --from=build /app/packages/network-security/package.json ./packages/network-security/package.json
EXPOSE 3001
ENV HOST=0.0.0.0
ENV PORT=3001
CMD ["node", "apps/api/dist/server.js"]
