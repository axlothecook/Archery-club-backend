# Archery club BACKEND image (Express + Prisma 7/Postgres, run via tsx).
# Built by CI for linux/arm64 (the Pi) and pushed to GHCR; the Pi only pulls.
#
# The app runs straight from TypeScript with `tsx` (no compile step — the project's
# `build` is just `tsc --noEmit`). We DO run `prisma generate` so the generated
# client (src/generated/prisma) is present in the image regardless of whether it
# was committed. Prisma 7 uses the PrismaPg driver adapter; the native query engine
# isn't bundled, so no extra engine binaries are needed.

FROM node:24-slim AS base
WORKDIR /app

# OpenSSL is needed by Prisma's tooling; ca-certificates for outbound TLS (R2,
# Google Translate). Keep the layer slim.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# 1. Install deps (cached unless package*.json changes).
COPY package*.json ./
RUN npm ci

# 2. App source.
COPY . .

# 3. Generate the Prisma client into src/generated/prisma (idempotent).
RUN npx prisma generate

ENV NODE_ENV=production
# Default port (overridable via env). The reverse proxy targets backend:3100.
ENV PORT=3100
EXPOSE 3100

# tsx runs the TypeScript entrypoint directly.
CMD ["npx", "tsx", "src/server.ts"]
