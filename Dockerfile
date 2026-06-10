FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY src/ ./src/
COPY tsconfig.json ./
ENV NODE_ENV=production
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
