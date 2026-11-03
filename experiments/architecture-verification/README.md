# Architecture verification (Issue #84)

> **2026-10-02追加検証：** この文書は#85時点の履歴。現在の旧版/1.7.7修正後の結果と未解決事項は[追加報告](FOLLOWUP-2026-10-02.md)、[Linux結果](LINUX-2026-10-02.md)。修正前Linux終了はexit137、承認済み最小hook後v6/v7は正常終了。採択は実Cloud/Engine/復旧運用等の残条件により保留。
>
> **2026-10-05追加検証：** main統合済みの実Engineで、T-14と混合負荷をmacOS・Node 24.21.0で測った。結果は[実Engineの報告](REAL-ENGINE-2026-10-05.md)。1 vCPU・実クラウドは未実施。
>
> **2026-10-07訂正・追加検証：** 旧混合負荷の将来DONE回数とwarmup混入を訂正し、隔離候補の入力・worker失敗・cohort回帰を追加した。[現main Engineと公開R-11の別検証](REAL-ENGINE-2026-10-07.md)へ。旧JSONは改変しない。

**Supporting Artifact / Not a Source of Truth.** 技術選定の第一候補を採択前に最小構成で実測した検証コードです。Productの実装ではありません。正式な仕様・採択は `docs/product-spec.md` と `docs/architecture.md`、およびチームの決定に従います。Architecture D-23〜D-25は候補のままです。

- 検証結果と判断材料：[REPORT.md](REPORT.md)
- 訂正後の比較文書：[SELECTION-v3.1.md](SELECTION-v3.1.md)
- 生データ：[results/](results/)

## 何であって、何でないか

- Fastify ＋ Better Auth ＋ PostgreSQL ＋ 共有TypeBoxスキーマ ＋ Vite / TanStack Router / Query を、採択判断に必要な接続だけつないだもの。
- #70（開発基盤）、#74（スキーマとmigration）、#75（認証）、#76・#77（API）の実装ではない。テーブルとAPIは検証に必要な部分だけで、Issueの契約を満たしていない箇所がある（例：記録できる日の制限は未実装）。
- **予測エンジンは含まない。** `src/predict-placeholder.ts` は指定した時間だけCPUを使うだけの代用品で、#73のT-14の証拠ではない。
- ルートに依存を追加しない。専用の `package.json` と lockfile を持つ。

## 前提

- Node.js と npm があればよい。Node 24.21.0 は devDependency の `node` パッケージで固定しており、`npm run` 経由なら自動でその版が使われる。
- PostgreSQL は `embedded-postgres` が配布する実バイナリをローカルで起動する（検証端末にDockerがなかったため）。データと生成した資格情報は `.local/` に置かれ、Git管理外。
- Secretの実値は不要。検証スクリプトは実行のたびに乱数で生成する。

## 再実行時の依存更新（2026-11-03）

[PR #327](https://github.com/FutureROI-DevTeam/Future-ROI/pull/327)で、本ディレクトリと`candidate-1.7.7`のSerovalは1.7.7へ更新された。現在の再実行で使うBetter Authも、親環境は1.7.7、隔離候補は1.7.15となっている。実際の版は各manifest／lockfileを参照する。フォルダ名と過去の報告にある1.7.6／1.7.7は当時の比較対象であり、現在の依存でその比較を再現したとは扱わない。既存ソース・報告・raw JSONは保持し、更新後の依存で再検証済みとはしない。説明の同期は[#326](https://github.com/FutureROI-DevTeam/Future-ROI/issues/326)で追跡する。

更新前のlockfileはmain `160c0f81f8e178ae5d405440764b064a5482f0fc`の[親環境](https://github.com/FutureROI-DevTeam/Future-ROI/blob/160c0f81f8e178ae5d405440764b064a5482f0fc/experiments/architecture-verification/package-lock.json)と[隔離候補](https://github.com/FutureROI-DevTeam/Future-ROI/blob/160c0f81f8e178ae5d405440764b064a5482f0fc/experiments/architecture-verification/candidate-1.7.7/package-lock.json)から参照できる。各報告の測定時点を再現する場合は、その報告が指定するcommitとlockfileを使う。今回の検証結果と未確認範囲はIssue／PRに記録する。

## 再実行

```bash
npm ci
npm run typecheck
npm run verify:auth-db        # 検証1: 認証・401/404・契約・Cookie・変換処理・migration再現
npm run verify:rate-limit     # 検証1: DB保存のレート制限（再起動・複数instance・並列・転送ヘッダー・待ち時間。windowの経過を待つため1分以上）
npm run verify:mixed-load     # 検証2: 代用計算とCRUDの混合負荷（約2分半）
npm run web:build
npm run verify:single-process # 検証3: 1プロセスでSPA＋API、経路、ログ、SIGTERM
```

各スクリプトは空のデータディレクトリからPostgreSQLを起動し、終了時に停止します。結果は `results/*.json` に上書きされます。使用ポートは 3184〜3220 と 55484〜55488 です。

ブラウザで触る場合：

```bash
npm run web:build && npm run start:browser   # http://localhost:3220
```

## ファイル

| パス | 内容 |
| --- | --- |
| `src/contracts.ts` | TypeBoxスキーマ。APIの検証・応答serializationとWebの型・実行時検証が共有 |
| `src/app.ts` | Fastify本体。認証の変換route（公式ガイド版と修正版）、保護plugin、422のerror形式、SPA配信 |
| `src/auth.ts` | Better Authの設定（メール／パスワード、DB保存のレート制限） |
| `src/pool.ts` | DB接続pool。`SPIKE_PG_INT8=number` で `int8` を数値として読む（REPORTのF-10の対処。既定はnode-postgresの既定どおり文字列で、レート制限の検証だけが `number` を指定する） |
| `src/migrate.ts`、`migrations/` | 認証テーブル → アプリテーブルの順で適用。アプリ側は最小の代用runner |
| `src/predict-*.ts` | 代用のCPU消費と、同一プロセス内の固定サイズworker pool |
| `src/server.ts` | 1プロセスの起動とSIGTERM処理 |
| `verify/` | 検証スクリプト |
| `web/` | 最小のSPA |
