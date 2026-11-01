FROM node:22-bookworm-slim

ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY apps ./apps
COPY scripts ./scripts
COPY docs ./docs
RUN mkdir -p /app/data /app/media /app/apps/agent/logs

COPY deploy/docker/agent-entrypoint.mjs /usr/local/bin/stream24-agent-entrypoint.mjs
RUN chmod 0644 /usr/local/bin/stream24-agent-entrypoint.mjs

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/server.mjs"]
