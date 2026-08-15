# ADARE PLATFORM — API + built SPA in one image
FROM node:20-alpine AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
RUN npx vite build

FROM node:20-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server ./
COPY --from=webbuild /app/web/dist /app/web/dist
RUN addgroup -S agh && adduser -S agh -G agh \
 && mkdir -p storage/uploads storage/private && chown -R agh:agh storage
USER agh
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/index.js"]
