# ─── Build Stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install --production

# ─── Production Stage ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 needs these at runtime
RUN apk add --no-cache libstdc++

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY package.json ./
COPY server/ ./server/
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
