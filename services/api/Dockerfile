FROM node:20

WORKDIR /app

COPY . .

RUN npm install

RUN npm run build -w @vlworkhub/types \
 && npm run build -w @vlworkhub/auth \
 && npm run build -w @vlworkhub/api

EXPOSE 8080

CMD ["node", "services/api/dist/server.js"]
