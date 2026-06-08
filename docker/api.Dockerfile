FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY packages ./packages
COPY services/api ./services/api
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "services/api/src/server.js"]
