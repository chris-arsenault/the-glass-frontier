# syntax=docker/dockerfile:1.6

ARG NODE_VERSION=20.18.0

FROM node:${NODE_VERSION}-slim AS dependencies
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run client:build

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG SERVICE_NAME="langgraph"
ARG SERVICE_ENTRYPOINT="services/langgraph/index.js"
ENV SERVICE_NAME=${SERVICE_NAME}
ENV SERVICE_ENTRYPOINT=${SERVICE_ENTRYPOINT}

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/services ./services
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/infra/docker/entrypoint.sh ./infra/docker/entrypoint.sh
COPY --from=build /app/infra/minio ./infra/minio
COPY --from=build /app/docs ./docs
COPY --from=build /app/REQUIREMENTS.md ./REQUIREMENTS.md
COPY --from=build /app/DESIGN.md ./DESIGN.md

RUN chmod +x ./infra/docker/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["./infra/docker/entrypoint.sh"]
