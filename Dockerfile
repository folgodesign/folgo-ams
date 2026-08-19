# Single-image build for Folgo Pulse: builds the React app and the API, then
# runs one Node process that serves both plus applies the DB schema on start.

# ---- build the frontend ----
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- build the backend ----
FROM node:20-bookworm-slim AS server
# OpenSSL is required by Prisma's engines (the slim image omits it).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM node:20-bookworm-slim AS runtime
# Prisma's schema engine (prisma db push) and query engine need OpenSSL too.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app/server
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/dist ./dist
COPY --from=server /server/prisma ./prisma
COPY --from=server /server/package.json ./package.json
COPY --from=web /web/dist /app/web/dist
ENV WEB_DIST_PATH=/app/web/dist
# Railway injects PORT; the server reads it. Expose is informational.
EXPOSE 4000
CMD ["npm", "run", "start:prod"]
