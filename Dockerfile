FROM node:20-alpine AS base

# Rebuild the source code only when needed
FROM base AS builder
# apk add is needed for some node packages on alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json ./
RUN npm ci

# Copy all source files
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

# Remove development dependencies to heavily shrink the final image size
RUN npm prune --omit=dev

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable Next.js telemetry during runtime
ENV NEXT_TELEMETRY_DISABLED=1

# Copy the entire pruned project from the builder stage
# (This ensures drizzle-kit, schema, and drizzle.config.ts are all present for db:push on startup)
COPY --from=builder /app ./

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The start script in package.json runs `drizzle-kit push --force && next start`
CMD ["npm", "start"]
