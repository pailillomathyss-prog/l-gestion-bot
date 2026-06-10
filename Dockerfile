FROM node:22-slim
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Start bot with tsx (no compile step needed)
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/main.ts"]
