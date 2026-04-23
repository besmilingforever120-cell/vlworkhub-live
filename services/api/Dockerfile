FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/*/package.json ./apps/
COPY packages/*/package.json ./packages/
COPY services/*/package.json ./services/
RUN npm install

COPY . .

RUN npm run build -w @vlworkhub/types \
 && npm run build -w @vlworkhub/auth \
 && npm run build -w @vlworkhub/api

EXPOSE 8080

CMD ["node", "services/api/dist/server.js"]
