FROM node:20-alpine
WORKDIR /app
COPY dist/ ./dist/
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
