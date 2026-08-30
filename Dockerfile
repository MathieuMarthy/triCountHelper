FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_TRICOUNT_ENABLED=false
ARG VITE_TRICOUNT_RELAY_URL=
ENV VITE_TRICOUNT_ENABLED=$VITE_TRICOUNT_ENABLED \
    VITE_TRICOUNT_RELAY_URL=$VITE_TRICOUNT_RELAY_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q --spider http://127.0.0.1/index.html || exit 1
