# Multi-stage production Dockerfile for GameScope Live Backend & Embedded Admin Panel
FROM node:20-alpine AS build

WORKDIR /app

# Copy root package files
COPY package*.json tsconfig.json ./

# Install backend dependencies
RUN npm ci

# Copy backend source
COPY src ./src

# Build backend
RUN npm run build

# Build Admin Panel
COPY admin/package*.json ./admin/
RUN cd admin && npm ci

COPY admin ./admin
RUN cd admin && npm run build

# --- Production Runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built backend files
COPY --from=build /app/dist ./dist

# Copy built admin static assets for serving
COPY --from=build /app/admin/dist ./admin/dist

# Create persistent local fallback data directory
RUN mkdir -p /app/.data

EXPOSE 8080

CMD ["node", "dist/server.js"]
