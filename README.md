# Future ROI

学習・読書・運動などの日々の取り組みを記録し、再開の目安と、設定した累積量に到達する時期を表示する Web アプリです。

たとえば「英語学習を合計3000分、1回30分」のように目標を設定し、毎日の記録から進捗と今後の見通しを確認できます。

## 主な機能

- 目標の作成・編集：総量、1回の量、開始前の進捗、到達予定日を設定
- 初期質問による最初の見通しと、記録に応じた予測の更新
- 今日の量入力、未保存の進捗試算、保存後の増分表示
- 再開までの待ち日数と、完了時期の P50 / P80 の表示
- 昨日の記録の補完・訂正、カレンダーでの履歴確認
- ログインした本人の目標・記録の管理

## 使い方

1. 登録・ログインし、Goal 作成フォームに総量・1回の量・開始前の進捗を入力します。
2. 初期質問2問それぞれで選択し、Goal を保存します。「経験がない・思い出せない」や「回答しない」も選べます。
3. Today で目安を確認し、「やった」量または「今日は休む」を保存します。
4. 保存した進捗と履歴を確認します。記録開始日以降の昨日の記録は補完・訂正できます。

### 利用の流れ

![Goal作成フォームで初期質問2問を選択し、Todayで記録を保存して、再取得成功時は履歴、失敗時は更新待ちへ進む利用フロー](docs/diagrams/user-flow.svg)

[原寸の利用フロー](docs/diagrams/user-flow.svg) · [編集用 draw.io](docs/diagrams/user-flow.drawio)

Goal は初期質問の選択後に保存します。図の「分からない」は「経験がない・思い出せない」（`UNKNOWN`）を指し、「回答しない」（`null`）とは区別します。未選択のまま保存せず、どちらも数値の中間回答には置き換えません。[質問・編集時の扱い](docs/product-spec.md#p-24-初期質問の必須化とtodayの編集入口259)

## 技術構成

| 領域 | 技術 |
| --- | --- |
| フロントエンド | React、Vite、TanStack Router / Query |
| API・認証 | Fastify、TypeBox、Better Auth |
| データベース | PostgreSQL、pg |
| 予測 | 純粋 TypeScript、2状態 Bayesian Markov |
| 開発・実行 | npm workspaces、Node.js、Docker Compose |

ローカルでは、静的ファイル配信・API・予測を1つの Node.js アプリで実行し、PostgreSQL を別コンテナで動かします。予測を DB・HTTP・時計から分離し、同じ入力を独立した数値オラクルと照合できる構成にしています。継続と再開を分けて扱い、未記録を「休んだ」とみなさずに計算します。

構成図、責務の分担、技術選定の理由は [Architecture](docs/architecture.md#system構成)、計算方法と数値テストは [Prediction Engine](packages/prediction/README.md) にまとめています。

## 起動方法

Docker Engine と Compose を使用します。以下は repository root で実行する PowerShell の例です。

初回だけ `.env.example` を `.env` へコピーし、`LOCAL_DB_PASSWORD` と32文字以上の `BETTER_AUTH_SECRET` をローカル用に設定してください。既存の `.env` は上書きしません。

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# .env の設定後に実行
docker compose up -d --build --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw "Compose の起動に失敗しました" }
Invoke-RestMethod http://127.0.0.1:8080/api/health
```

既定の画面 URL は `http://127.0.0.1:8080`、health の正常応答は `status=ok` です。`LOCAL_APP_PORT` を変更した場合は URL も合わせてください。停止は `docker compose down`。DB を残す通常の停止では `-v` を付けません。

ホットリロードでの開発、設定例、起動に失敗した場合の確認は [開発ガイド](docs/DEVELOPMENT_GUIDE.md#アプリを起動検証する) を参照してください。

## 検証

Node.js 24.22.1 / npm 11.19.0 と開発依存を使用します。

```powershell
npm ci --include=dev
npm run typecheck
npm test
npm run build
npm run verify:ci-reports
```

API テストはテスト用 PostgreSQL を使用します。shell の `DATABASE_URL` がなければ一時クラスタを起動します。指定する場合はテスト専用 DB を作成・削除できる接続先を使ってください。root の `.env` は自動では読みません。実ブラウザのテストはローカルでは別途 `npm run test:browser --workspace=@futureroi/web` を実行します。

`typecheck`は公開型とアプリの型、`test`はEngineの独立オラクル・APIの保存境界・Webの純粋変換と描画、`build`は配信成果物を確認します。`verify:ci-reports`はCIの集計・失敗判定・診断情報の保存範囲を検査します。各層の保証と実ブラウザの範囲は[検証手順](docs/DEVELOPMENT_GUIDE.md#検証)を参照してください。

### 開発基盤のセットアップと確認

文書・リンクと図の検査は PowerShell 7 で実行できます。

```powershell
npm run verify:foundation
pwsh -NoProfile -File scripts/check-document-diagrams.ps1
```

[Application CI](.github/workflows/application.yml) · [Engine CI](.github/workflows/prediction.yml) · [図の編集・検査](docs/diagrams/README.md)

`verify:foundation`は文字コード・相対リンク・環境変数の例・差分の空白を確認します。npmがない場合は`pwsh -NoProfile -File scripts/check-foundation.ps1`でも同じ検査を実行できます。アプリの動作確認は上の検証と分けます。

## 既知の制約

- 再開の目安 g50 は待ち日数の中央値です。完了日の中央値どうしの差ではありません。P50 / P80 もモデル上の目安で、実際の達成保証ではありません。完了予測は今後の1回量を一定と仮定し、約3年の計算範囲で分位点に届かない値は「範囲内の目安なし」と表示します。
- 本人向け評価と途中到達による個人補正は既定 OFF。個人補正は API のみで、UI と標準 Today への自動適用はなく、実利用での有効性は未実証です。
- 公開 URL は未掲載です。公開環境と実ユーザーでの精度・効果の検証状況は [リリース手順](docs/operations/release-demo.md) を参照してください。

## 関連ドキュメント

- [Architecture](docs/architecture.md)：構成図、責務、技術選定、API・DBの設計
- [Prediction Engine](packages/prediction/README.md)：計算方法、独立オラクル、テスト
- [実験履歴](docs/prediction/experiment-history.md)：比較したモデル、速度、失敗、採否と根拠
- [開発ガイド](docs/DEVELOPMENT_GUIDE.md)：起動・操作・開発手順
- [Product Spec](docs/product-spec.md) / [画面設計](docs/design.md)：機能と表示の仕様
- [実装対応表](docs/change-map.md) / [CONTRIBUTING](CONTRIBUTING.md)：コード・テストへの入口と開発ルール

### 現在の状態

[開発基盤の状態と当時の記録](docs/operations/development-foundation-status.md#現在の状態)

### 廃止した音楽案の履歴

[保管先と参照方法](docs/operations/reuse-handoff.md#廃止した音楽案の履歴)

### 比較実験の保存範囲

[実験群の配置と保持区分](docs/prediction/experiment-history.md#比較実験の保存範囲)

## ライセンス

repository 全体の LICENSE ファイルは未追加です。依存パッケージと外部データのライセンスはそれぞれ確認してください。
