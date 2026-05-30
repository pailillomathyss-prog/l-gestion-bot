FROM node:20-alpine
WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-workspace.yaml.docker tsconfig.base.json tsconfig.json ./
RUN mv pnpm-workspace.yaml.docker pnpm-workspace.yaml

COPY lib/api-zod/ ./lib/api-zod/
COPY lib/db/ ./lib/db/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @workspace/api-server run build

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]