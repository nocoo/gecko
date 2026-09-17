# --- Stage 1: Install dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: skip `postinstall`/`prepare` lifecycle scripts for the
# ~30 transitive deps that declare them. better-sqlite3@13 ships prebuilt
# binaries in the tarball and has no install script — its `prebuilds/**`
# arrive regardless of this flag. We keep it for install determinism (no
# arbitrary script execution in the image) and to shave build time.
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
