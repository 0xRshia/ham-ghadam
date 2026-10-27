FROM node:24-bookworm-slim AS build
WORKDIR /app/blog
ENV NEXT_TELEMETRY_DISABLED=1 \
    BLOG_ORIGIN=https://hmghadam.com \
    BLOG_DATA_DIR=/tmp/build-blog-data
COPY blog/package.json blog/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY blog/ ./
COPY public/brand/ /app/public/brand/
COPY public/fonts/darbareh/ /app/public/fonts/darbareh/
COPY public/favicon.ico public/favicon.svg public/apple-touch-icon.png /app/public/
COPY design-system/tokens.css /app/design-system/tokens.css
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    BLOG_DATA_DIR=/data
COPY --from=build --chown=node:node /app/blog/.next/standalone/ ./
COPY --from=build --chown=node:node /app/blog/.next/static/ ./.next/static/
COPY --from=build --chown=node:node /app/blog/public/ ./public/
COPY --chown=node:node blog/scripts/backup.ts blog/scripts/password.ts ./scripts/
COPY --chown=node:node blog/lib/config.ts blog/lib/passwords.ts ./lib/
RUN mkdir -p /data/media && chown -R node:node /data && chmod 700 /data /data/media
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:" + process.env.PORT + "/api/health", {signal: AbortSignal.timeout(4000)}).then(r => {if (!r.ok) process.exit(1)}).catch(() => process.exit(1))'
CMD ["node", "server.js"]
