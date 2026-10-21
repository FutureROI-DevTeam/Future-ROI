# 単一コンテナ: Fastify APIがビルド済みSPAを同一originで配信する（Architecture D-23）。
# 版固定: Node 24.22.1（package.json engines・mise.tomlと同じ）。

FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/prediction/package.json packages/prediction/
# lifecycle scriptsは実行しない（lockfileにinstall scriptを持つ依存は開発用のみ）。
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 WEB_DIST=/app/apps/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/prediction/package.json packages/prediction/
# API workspaceの実行時依存だけを入れる。SPAはビルド済みの静的ファイルとしてコピーする。
RUN npm ci --workspace=@futureroi/api --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Engine（@futureroi/prediction）はAPIのworkspace依存。node_modulesのリンク先にビルド済みdistを置く。
COPY --from=build /app/packages/prediction/dist ./packages/prediction/dist
COPY apps/api/migrations ./apps/api/migrations
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 8080
# DATABASE_URLとproduction認証設定は起動時に注入する。公開環境では事前にmigrationを適用する。
# ローカルComposeはcommandをcontainer-start.jsへ上書きし、migration成功後に配信する。
CMD ["node", "apps/api/dist/server.js"]
