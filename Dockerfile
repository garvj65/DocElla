FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/schemas/package.json packages/schemas/package.json

RUN npm ci

FROM dependencies AS build

COPY . .

ENV VITE_API_BASE_URL=""

RUN npm run build \
  && npm run verify:build -w @docella/frontend

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/schemas/package.json packages/schemas/package.json

RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force

COPY --from=build --chown=node:node /app/apps/backend/dist apps/backend/dist
COPY --from=build --chown=node:node /app/apps/backend/assets apps/backend/assets
COPY --from=build --chown=node:node /app/apps/frontend/dist apps/frontend/dist
COPY --from=build --chown=node:node /app/packages/schemas/dist packages/schemas/dist

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "apps/backend/dist/server.js"]
