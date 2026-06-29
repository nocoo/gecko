# --- Stage 1: Install dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: skip native-module post-install (e.g. better-sqlite3).
# better-sqlite3 is a dev-only dep loaded behind D1_LOCAL_PATH; production
# uses the Cloudflare D1 REST API and never imports it. Avoids node-gyp,
# which would otherwise fail in this image (no Python toolchain, and Bun
# is not supported by prebuild-install).
RUN bun install --frozen-lockfile --ignore-scripts

# --- Stage 2: Build ---
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# --- Stage 3: Runtime ---
# IMPORTANT: bun runtime hangs vinext's `req.json()` on POST bodies > ~80 KB.
# Reproduced 2026-06-29 locally: same vinext, same code, same env, same payload
# — `bun node_modules/vinext/dist/cli.js start` hangs forever after auth;
# `node node_modules/vinext/dist/cli.js start` returns 202 in <500 ms. The
# Mac client's /api/sync batches (250 sessions, ~85 KB) hit this every time.
# Node 22 LTS on a slim image is the right runtime; bun stays for install/build.
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV VINEXT_TRUST_PROXY=1

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/vite.config.ts ./

EXPOSE 7018

CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--port", "7018"]
