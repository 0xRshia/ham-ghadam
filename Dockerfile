# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build:node

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    MVP_RUNTIME=node \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/hmghadam.sqlite \
    MEDIA_PATH=/data/media
COPY --from=build /app/dist/standalone ./dist/standalone
COPY --from=build /app/drizzle ./drizzle
COPY scripts/migrate-node.mjs scripts/backup-node.mjs scripts/notifications-job.mjs ./scripts/
COPY --chmod=755 scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN mkdir -p /data/media && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:" + process.env.PORT + "/api/health", {signal: AbortSignal.timeout(4000)}).then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))'
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "dist/standalone/server.js"]
