# Dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches/ ./patches/
COPY apps/monolith/package.json ./apps/monolith/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS prod
WORKDIR /app
ENV PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/monolith/node_modules ./apps/monolith/node_modules
COPY apps/monolith/src/ ./apps/monolith/src/
COPY apps/monolith/scripts/ ./apps/monolith/scripts/
COPY apps/monolith/server.ts apps/monolith/tsconfig.json apps/monolith/package.json ./apps/monolith/
COPY tsconfig.base.json ./
EXPOSE 3001
WORKDIR /app/apps/monolith
CMD ["bun", "run", "server.ts"]
