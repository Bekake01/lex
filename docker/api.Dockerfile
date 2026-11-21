# apps/api: the NestJS backend (HTTP + BullMQ workers in one process).
# Build from the repo root: docker build -f docker/api.Dockerfile .

FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests first, so a source change doesn't re-resolve dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/crypto/package.json packages/crypto/
RUN pnpm install --frozen-lockfile --filter "api..."

COPY . .
# Builds @lex/contracts and @lex/crypto first, then the api (topological order).
RUN pnpm --filter "api..." run build

# The runtime keeps the whole tree: the api resolves @lex/* through the
# workspace links, and @lex/crypto reads its fonts next to its dist/.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo /repo
COPY --chown=node:node docker/api-predeploy.sh /repo/predeploy.sh
USER node
WORKDIR /repo/apps/api
# Railway's PORT is pinned to this value on the service, so the edge and the
# private network both reach the port the app binds.
EXPOSE 5000
CMD ["node", "dist/main.js"]
