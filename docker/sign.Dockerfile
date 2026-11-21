# apps/sign: Next.js. Build from the repo root: docker build -f docker/sign.Dockerfile .

FROM node:24-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/sign/package.json apps/sign/
COPY packages/contracts/package.json packages/contracts/
COPY packages/theme/package.json packages/theme/
RUN pnpm install --frozen-lockfile --filter "sign..."

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "sign..." run build

FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/sign
# PORT is pinned to 3001 on the Railway service so it matches EXPOSE.
EXPOSE 3001
CMD ["sh", "-c", "exec node_modules/.bin/next start -p ${PORT:-3001}"]
