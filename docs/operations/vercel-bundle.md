# Vercel候補の配備物をローカルで準備する（#208）

[D-25](../architecture.md#d-25)の条件付き候補を具体化するSupporting Doc。公開先の採択、配備成功、無料適合、[#83](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/83)の受入完了を意味しない。公開の認証・DB・proxy・性能等のゲートは[既存リリース手順](release-demo.md#公開候補の採用前に行う最小検証)へ残す。

## root・entry・生成物

| 境界 | 実装 |
| --- | --- |
| Project root | repository root。3 workspaceのroot lockを使う。[vercel.json](../../vercel.json)のInstall Commandは`npm ci --include=dev --ignore-scripts --no-audit --no-fund`、Build Commandは`npm run build:vercel` |
| build順序 | 既存`npm run build`（Prediction→API→Web）後、[build-vercel.mjs](../../scripts/build-vercel.mjs)が公式Build Output API v3の`.vercel/output`を生成 |
| Function | `.vercel/output/functions/server.func/apps/api/dist/vercel.js`。[専用entry](../../apps/api/src/vercel.ts)が既存`buildApp`を遅延起動。Node runtime指定は`nodejs24.x`、raw request/responseを保持するため`shouldAddHelpers:false` |
| routing | 全pathを同じFunctionへ渡し、既存FastifyのAPI・SPA fallback・assets・Cache-Controlを使用。別のSPA fallbackを追加しない |
| assets | 最新Web dist全体をFunction内の`apps/web/dist`へコピー。HTML/CSSのローカル参照、全ファイルhash、分離されたWOFF/WOFF2も検査。Vercel entryのWeb rootは生成物内から求め、`WEB_DIST`の外部値やcwdに依存しない |
| 依存 | root buildにはdev依存もinstallし、Functionには別installでAPIのproduction依存とPredictionのcompiled exportsだけを同梱。コピー前の各distとコピー後のFunctionで`.env*`・`.npmrc`・`.local`、境界外／循環リンクを検査し、開発依存と250 MiB超過も拒否 |
| DB lifecycle | Vercel entryだけで固定`@vercel/functions@3.9.11`の`attachDatabasePool`をapp/auth双方へ登録。既存pgの上限5/2・型・timeoutを維持。hookはrelease後のidle猶予を`waitUntil`へ登録し、poolを強制終了する処理ではない |

Docker・常駐`server.ts`の起動と終了、migration、認証設定、FEソース、Engine数式はこのTaskの変更対象外。ネイティブFastify検出も公式に存在するが、この候補ではmonorepoの資産・依存を明示するBuild Outputを使う。汎用serverless adapterが必須という判断ではない。

## 秘密値・DB・クラウド操作なしの検証

定義済みNode **24.22.1**をPATHの先頭に置き、repository rootで実行する。実`.env`を読み込まず、Vercel CLIのlogin/link/deployを呼ばない。

```powershell
npm ci --include=dev --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build:vercel
npm run verify:vercel
pwsh -NoProfile -File scripts/check-foundation.ps1
```

`verify:vercel`はbuild完了後に実行する。専用loopback port 0と接続しないpool fixtureだけを使う。Functionだけをworktree外のTempへコピーしたfresh Node processでPrediction/entryのimport、SPA deep link、API／missing asset境界、配備した全assetのHTTP hashを照合する。起動失敗、再試行、同時cold request、切断、Secret非生成、リンク境界も検査する。生成したTemp fixtureは終了時に削除する。

`bundle-manifest.json`にNode版、総bytes、ファイル別hash、HTML/CSS参照数、フォント数を記録する。Function設定ファイルはmanifest作成後に追加されるため、manifestのファイル一覧には含めず別途照合する。公開先の実runtime、URL書換え、全Set-Cookie、proxy、実DB接続・休止、CPU／混合負荷をこのローカル試験から成功扱いにしない。

Projectの`NODE_ENV=production`はinstallにも作用し、npmは既定でdev依存を省く。rootはTypeScript/Viteでbuildするため`--include=dev`を明示する。Function内の別installは`--workspace=@futureroi/api --omit=dev`を維持し、build専用の依存を配備物へ入れない。

Application CIの専用jobは秘密値・DBなしで`NODE_ENV=production`と実`vercel.json`のInstall Commandを使い、`build:vercel`と配備構造・コピー前／asset境界の軽量回帰を実行する。外部Tempで全assetをHTTP取得する試験は上記`verify:vercel`の明示実行に残す。

## 統合と公開前の手動ステップ

このTaskはmain `041f24c557dd90034d64d630fb912e0a01696da9`から独立する。2026-10-10の再確認では[#204](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/204)（Engine、HEAD `542ea3c272d857a97149c95274d7afa5ff0f5fca`）はmerge済み、[#202](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/202)（Web、HEAD `e9d34444060a80fbb1189fc03501fe2f380bffe7`）はOpen。#209の合成merge treeと最新Webを別のローカルsnapshotで照合し、通常checkoutを変更しない。各PRのHuman Review・Mergeを代行せず、配備対象は統合後のSHAで再固定する。[#205](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/205)/[#206](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/206)の文書Taskとは分離する。

公開操作が承認された段階で担当者が行うこと：

1. 統合SHA、本人アカウント、無料条件・非商用適合・Organization接続条件を確認し、rootをrepository root、Framework PresetをOther、実Node版を記録する。`vercel.json`のbuild/install設定と実生成物を照合する。
2. 承認された管理経路で`NODE_ENV=production`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、公開HTTPSと一致する`BETTER_AUTH_URL`、パスワード再設定メール用の`RESEND_API_KEY`と`MAIL_FROM`（送信元はResendで認証済みのドメイン）を設定する。`MAIL_TRANSPORT=log`は再設定URLをログへ出すため公開先では使わない。値をGit・Issue・ログへ書かない。proxy実測に基づく設定判断は既存#83のゲートで行う。
3. 既存migrationをHTTPと分け、直結URLをその実行の`DATABASE_URL`へ供給して認証→アプリの順に実行する。`DIRECT_DATABASE_URL`という自動読取機能は既存CLIにない。schema確認・backup・復旧の受入も既存手順に従う。
4. 実配備物でルート・query/body・全Set-Cookie・認可・SPA／フォント配信、app/auth両poolの実idle解放と休止後応答、公開runtime互換性・性能を確認する。未確認なら#83を完了にしない。

この文書の追加に伴う外部設定・Secret入力・DB操作・配備は行っていない。

## 一次根拠

- [Vercelのproduction install](https://vercel.com/kb/guide/dependencies-from-package-json-missing-after-install)、[npm ciのinclude/omit](https://docs.npmjs.com/cli/v11/commands/npm-ci/)：Projectの環境値がinstallへ渡ることと、dev依存の明示収容。
- [Build Output API configuration](https://vercel.com/docs/build-output-api/configuration)：version 3とroutes。
- [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives)：Functionディレクトリ、handler/runtime、Nodejs launcherとraw HTTP。
- [Fastify on Vercel](https://vercel.com/docs/frameworks/backend/fastify)：ネイティブ対応とFunctionへの収容。
- [attachDatabasePool](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool)、[Connection pooling](https://vercel.com/kb/guide/connection-pooling-with-functions)：poolのidle lifecycle。
- [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)：24.xとProviderの版更新。ローカルの固定patchと同一とは限らない。
