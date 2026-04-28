FROM node:20-alpine AS deps
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=https://api.vlworkhub.ca
ARG NEXT_PUBLIC_MAIN_APP_URL=http://www.vlworkhub.ca
ARG NEXT_PUBLIC_ROOT_URL=http://www.vlworkhub.ca
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAIN_APP_URL=$NEXT_PUBLIC_MAIN_APP_URL
ENV NEXT_PUBLIC_ROOT_URL=$NEXT_PUBLIC_ROOT_URL

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY services ./services
COPY tsconfig.base.json ./

RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=https://api.vlworkhub.ca
ARG NEXT_PUBLIC_MAIN_APP_URL=http://www.vlworkhub.ca
ARG NEXT_PUBLIC_ROOT_URL=http://www.vlworkhub.ca
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAIN_APP_URL=$NEXT_PUBLIC_MAIN_APP_URL
ENV NEXT_PUBLIC_ROOT_URL=$NEXT_PUBLIC_ROOT_URL

COPY --from=deps /app /app

RUN npm run build -w @vlworkhub/hr-app

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app /app

EXPOSE 3002

CMD ["npm", "run", "start", "-w", "@vlworkhub/hr-app"]