# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=30000

FROM base AS builder
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Next.js evaluates server modules while collecting route metadata. These values
# are deliberately non-secret build placeholders; the container receives real
# values only at runtime from .env.production/the hosting platform.
ENV APP_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DIRECT_DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV AUTH_SECRET=build-only-auth-secret-change-at-runtime-1234567890
ENV OTP_PEPPER=build-only-otp-pepper-change-at-runtime-1234567890
ENV SMS_PROVIDER=disabled
ENV YANDEX_GEOCODER_API_KEY=build-only-yandex-geocoder-key
ENV TELEGRAM_BOT_TOKEN=0000000000:BUILD_ONLY_PLACEHOLDER_NOT_A_REAL_TOKEN
ENV TELEGRAM_WEBHOOK_SECRET=build-only-webhook-secret-change-at-runtime-1234567890
ENV ENABLE_TEST_AUTH=false
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=30000

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates dumb-init openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs prisma.config.ts package.json ./
COPY --chown=nextjs:nodejs scripts ./scripts
RUN chmod +x ./scripts/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "./scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]
