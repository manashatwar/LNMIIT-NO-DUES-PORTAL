# Multi-stage build: compile the SPA, then serve it (+ proxy /api to Django) with nginx.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Defaults match docker-compose.yml (service name `backend`, container port
# 80). Override BACKEND_HOST/BACKEND_PORT/PORT for any other deploy target —
# e.g. Railway injects its own PORT and expects the app to listen on it (see
# docs/DEPLOY.md).
ENV BACKEND_HOST=backend \
    BACKEND_PORT=8000 \
    PORT=80
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
