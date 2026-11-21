# apps/web: Next.js. Build from the repo root: docker build -f docker/web.Dockerfile .

FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/theme/package.json packages/theme/
RUN pnpm install --frozen-lockfile --filter "web..."

COPY . .
# Build-time values (Railway passes service variables as build args):
# NEXT_PUBLIC_API_URL is inlined into the browser bundle (/api in deployment),
# API_URL is where the /api rewrite in next.config.ts forwards to.
ARG NEXT_PUBLIC_API_URL
ARG API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "web..." run build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/web
# PORT is pinned to 3000 on the Railway service so it matches EXPOSE.
EXPOSE 3000
CMD ["sh", "-c", "exec node_modules/.bin/next start -p ${PORT:-3000}"]
