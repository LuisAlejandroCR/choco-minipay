FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY packages ./packages
COPY services/worker ./services/worker

ENV NODE_ENV=production

CMD ["node", "services/worker/src/scheduler.js"]
