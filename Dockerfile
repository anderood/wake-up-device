FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache iputils

COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

COPY server.ts tsconfig.json ./
COPY src ./src

EXPOSE 3000

CMD ["npm", "start"]
