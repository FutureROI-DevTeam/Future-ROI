# Better Auth 1.7.7 隔離候補

Supporting Artifact / Not a Source of Truth。採用済みアプリではない。[追加検証報告](../FOLLOWUP-2026-10-02.md) に結果・制約・設計理由を集約する。親 package は1.7.6の履歴として保持する。

2026-11-03のSerovalパッチ更新と、更新前のlockfile・過去結果の扱いは[親READMEの再実行時の依存更新](../README.md#再実行時の依存更新2026-11-03)を参照する。Better Auth 1.7.7の比較対象は変更しない。

Node 24.21.0 と空の隔離合成 DB を使用し、このディレクトリ内で `npm ci --no-audit --no-fund`、`npm run typecheck`、`npm run web:build`、`npm run verify:auth-db`、`npm run verify:rate-limit`、`npm run verify:fixed` を実行する。Windows では `pwsh -NoProfile -File verify-fixed.ps1` が exit code、JSON FAIL、結果時刻を確認し、所有する合成 DB を終了する。node/npm は親 repo や system を更新しない。Windows実行は既存Chromeを新規隔離profileで使う。`SPIKE_CHROME_PATH`で既存binaryを指定でき、なければブラウザ未検証の INFO とする。ポート3290/3291/3292/3299、PG55591等が空いていることを確認する。他人の process は止めない。

`results/post-fix` は現在の再実行結果。公開した比較の生結果は [日付別結果](../results/2026-10-02/) に保存し、修正前後を上書きしない。試験は2つの合成identityだけで Secret/Cookie/password を出力しない。`.local`、node_modules、生成 env、DB、browser profile を commit しない。

Linux検証は既存のDocker Desktop Linux engineが使える場合だけ、`node verify/v6-linux-container.mjs`を実行する。公式Node24.21.0/bookworm-slimとPostgreSQL18/bookwormを使用し、実際のdigestを結果へ記録する。専用名・label、tmpfs DB、SQL非公開、API loopback3390のみ。migrationを1回だけ実行し、アプリは`SPIKE_MIGRATE=0`。今回生成したenvは試験終了後削除、所有labelを確認した今回のcontainers/imageだけ除去する。DockerDesktop新規install、system/WSL設定、既存資源の削除、クラウドdeployは行わない。

ローカルHTTP試験だけ`NODE_ENV=test`を指定する。productionのHTTPS gateは変更しない。Containerの`DATABASE_URL`/`BETTER_AUTH_SECRET`/`BASE_URL`不足は拒否し、embedded DBへfallbackしない。本番利用は未承認。[復元後session失効手順](RESTORE-PROCEDURE.md) は loopback合成DB限定で、本番復旧を代行しない。

終了回帰は `node verify/v7-shutdown-regression.mjs`。正常keep-aliveのidle/処理中/並列worker/SQL書込と反復起動9条件。専用tmpfs DB、合成2人、worker1・代用CPU2000ms・書込lock4秒、Docker猶予10秒、全応答200・終了後SQL・resource解放を確認する。実Engine/クラウド試験ではない。WindowsからDockerへはユーザー設定を読まない空の専用DOCKER_CONFIGと既存Linux endpointを指定する。Dockerへの権限がなければ停止し、新認可/設定変更をしない。

実Engineの混合負荷は `npm run verify:real-engine`。現mainの参照checkoutのrootで `npm ci` → `npm run build:prediction` を済ませ、本候補内で独立した `npm ci` を行う。`SPIKE_ENGINE_ROOT` に参照checkoutの `packages/prediction` の絶対パスを指定する。旧同梱distを現mainとして測らない。入力・worker・cohort回帰は同じ環境で `npm run verify:real-regression`（14件）。手順・結果・限界は[2026-10-07の追加報告](../REAL-ENGINE-2026-10-07.md)。旧報告・旧JSONは履歴として保持する。

`SPIKE_PREDICT_ENGINE=real` のときだけ `/today` が実Engineを呼び、既定は代用計算のまま。`SPIKE_PREDICT_ENTRY=question-prior` は既存strength-4 mapping（LOW 1/3、MID 2/2、HIGH 3/1）と合成回答HIGH/LOWで公開 `predictWithQuestionPrior` を別測定する。採択値や本体Algorithm/DTOは変更しない。loopback HTTPでは `NODE_ENV=test` を使う。HTTP3230、PGの既定55592、Windows予約範囲の場合は `SPIKE_PG_PORT`（今回は65392）を明示する。

Windowsでは `pwsh -NoProfile -File verify-real-engine.ps1 -EngineRoot <参照Engine絶対パス> -PgPort 65392` で、旧predictと公開R-11の7条件を各2回逐次実行する。既存JSONを上書きせず、UTC日時の新規フォルダへ生JSON・ログ・exit code ledgerを保存する。CPU測定中は別のtests/buildを実行しない。

再レビューのURL移植性・公開R11入力境界・diff証拠保存・pool停止後の限界は[2026-10-08の対応報告](../REAL-ENGINE-2026-10-08.md)。候補のhealthはDB疎通のみで、worker poolは死亡後に自動復旧せずprocess再起動まで予測503となる。次回測定するsrc/verifyはcommitまたはstageし、JSONと同じfolderの `*.candidate.diff` を保存する。diff移送の軽量回帰は `pwsh -NoProfile -File verify/diff-evidence.test.ps1`。
