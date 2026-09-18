FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
# 测试用的 mongodb-memory-server 仅在本地按需下载二进制，镜像构建时禁用
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm install --include=dev --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 29512
CMD ["node", "dist/index.js"]
