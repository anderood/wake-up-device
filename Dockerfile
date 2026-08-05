FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache iputils

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.ts tsconfig.json ./
COPY src ./src

EXPOSE 3000

CMD ["npm", "start"]
