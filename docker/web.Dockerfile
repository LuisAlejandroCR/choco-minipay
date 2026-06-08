FROM node:22-alpine AS build

WORKDIR /app
COPY package.json ./
RUN npm install

COPY apps ./apps
COPY packages ./packages
COPY public ./public
COPY vite.config.mjs ./

RUN npm run build:web

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html

EXPOSE 8080
