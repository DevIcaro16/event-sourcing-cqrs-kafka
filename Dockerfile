# Dockerfile
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS prod
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY server.ts tsconfig.json drizzle.config.ts ./
EXPOSE 3001
CMD ["bun", "run", "server.ts"]
