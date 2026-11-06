# 開発基盤の現行状態

2026-09-30の候補記録を、2026-10-03の[技術構成合意](../architecture.md#2026-10-03の技術構成合意)に基づき更新しました。[D-23](../architecture.md#d-23)の基本構成はFE側の依頼者報告とBE本人の了承記録に基づく採用記録。[D-24](../architecture.md#d-24)／[D-25](../architecture.md#d-25)は検証・運用条件付き第一候補で、最終採択・公開・課金作成の許可ではありません。版・runner・migration方式は#70/#74で固定済み。Secret共有管理・外部設定・運用担当の残条件は未確定。[D-18](../architecture.md#d-18-旧開発スタックの一時退避)の基本構成未定状態はD-23で置き換えますが、[履歴](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/README.md)の復元・動作確認は実装Issueで追います。現在の起動基盤・migration・認証の導入と、未結合業務機能・未配置公開環境を分けて確認します。

現行の共通基盤は、Issue/PR運用、Git Hook、`mise.toml`の共通タスク、[文書・設定チェック](../../scripts/check-foundation.ps1)、[Foundation CI](../../.github/workflows/foundation.yml)です。#71〜#73の限定先行Engineには別の[型検査・数値テストCI](../../packages/prediction/README.md#検証ci)を追加しました。#70でroot workspace、Node 24.21.0の版固定、[Application CI](../../.github/workflows/application.yml)、Compose、単一コンテナを導入しました（[手順](../DEVELOPMENT_GUIDE.md#アプリを起動検証する)）。Engine検証CIの固定版は検証版のまま、lockfileはrootへ統合しました。`pwsh -NoProfile -File scripts/check-foundation.ps1`はアプリの起動、ビルド、型検査、DB接続を実行しません。

当時の導入・検証結果、外部操作の承認待ち、チーム環境の未確認事項は[旧基盤状態の全文](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md)に保管しました。当時の成功を現行構成の動作確認と扱いません。

#70向けの[mise・環境設定共有の準備案](environment-sharing-preparation.md)には、現在の共通タスク、空の設定例と共有前の確認項目をまとめた。Secret管理方式・runtimeを採択したものではなく、Engine単体検証には環境値を渡さない。

公開先は2026-10-08の依頼者方針により、**本人アカウント・厳密0円でFE／BEともVercel Hobby、DBはNeon Free、ローカルはDocker**を第一候補にしています。[D-25](../architecture.md#d-25)の非商用・無料枠・共有制限と[採用前の最小検証](release-demo.md#公開候補の採用前に行う最小検証)を#83で追跡します。採用確定・デプロイ済みではなく、Cloud Runの旧候補はD-25に保持します。

## main保護の確認（2026-11-07 JST）

`FutureROI-DevTeam/Future-ROI`のmain `ff954f9aebc1c3194e4a3000331ffc30e03fc9ed`で、GitHub APIは`protected:false`、branch protectionは404、repository rulesetsとmainへ適用されるrulesは空配列を返した。したがって、この時点では必須CI・PR・履歴保護をGitHubが強制していない。[条件付きセルフマージ](../../CONTRIBUTING.md#条件付きセルフマージ2026-10-11)の承認数一時解除と区別する。CIの存在や[配備gate](../../.github/scripts/deploy-gate.mjs)はmainの事前保護を保証しない。

設定変更は未実施。PR必須・force push/削除禁止と、既存Applicationの3jobおよびFoundationの`Repository checks`の必須化を推奨する。承認1件を復帰するかはチーム判断。確認方法・実測・制約は[Issue #334の記録](../changes/issue-334-browser-api-db.md)を参照し、実設定は変更し得るためmerge判断時に再確認する。

## 現在の未決定事項

- 認証／公開先の最終受入・検証・運用条件（[D-24](../architecture.md#d-24)／[D-25](../architecture.md#d-25)）。Runtime・runner・migration方式は[#70/#74の記録](../architecture.md#2026-10-06の版固定と起動構成)で固定済み。ローカルのDB migration・認証は実装済みで、[Docker一式起動](../DEVELOPMENT_GUIDE.md#dockerで一式を起動する)は#130で補完する。
- 本人アカウントの無料プラン・非商用適合・接続／共有条件・region・運用担当・最終受入。外部作成・権限・公開操作は承認後とし、有料への切替を前提にしない。
- stagingのhealth／SPA／APIとManaged PostgreSQL接続、HTTPS／Cookie／proxy、休止後応答・メモリ・遅延。従来のhealthコンテナ配置を含む#70→#75→#83の[移管記録](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/83#issuecomment-6007399074)を保持し、Functionでの確認を追加する。
- 退避した旧構成のうち使わない部分の削除。

## 履歴への入口

- [旧開発ガイド](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/DEVELOPMENT_GUIDE.md#13-初回セットアップ)：当時の起動・停止・検証手順。
- [旧開発基盤ADR](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/decisions/0001-development-foundation.md)：当時の採択方針。
- [旧基盤状態](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md)：個別設定・検証・未確認事項。
- [引き継ぎの棚卸し](reuse-handoff.md)：次案で再評価する資産と条件。

## READMEから移した採択・実装の履歴

2026-10-12、READMEを製品案内へ整理するため、基準commit `af9836829fe911599cdc8ecb27b231836cb3806c` の記録を全文で保管した。以下は各時点の記録で、現在の実装状況は変更対応表と正式仕様を参照する。

<details>
<!-- readme-adoption:start -->
<summary>現在の判断・実装状況の詳細（開発者向け）</summary>

| 区分 | 内容 |
| --- | --- |
| 確定 | 大会：JOGI HACK 2026 / 対象：Webアプリケーション / チーム：3人 |
| 確定 | 開発期間：2026-09-19 ～ 2026-10-12 / コードフリーズ：2026-10-12 |
| DECIDED | 2026-09-30にProductを「Future ROI（今日サボると、ゴールは何日遠ざかる？）」に決定し、要件・MVP Scopeを確定した。[Product Spec](../product-spec.md#現行状態2026-09-30) |
| DECIDED（提出版の表示） | 2026-10-11に依頼者が、#199／PR #202・#221／PR #223でmainに入ったTodayと全画面の表示を正式決定した（#232）。旧Hero/Coreコピーを保持。g50は再開待ちであり、同じ継続傾向・設定量と再開後経路共有のモデル上の追加遅れ中央値とも解釈できる（完了日のP50差・因果効果とは別）。範囲・比較した案・未確認の理解確認と最終UX受入は[Product Spec P-21](../product-spec.md#p-21-todayの朝焼け山並み案)へ |
| DECIDED（Scope・分担） | 2026-10-05、[R-11のMust追加と責任分界をチーム採択](../product-spec.md#p-15-質問由来の見通しのmust追加方針)。MustはR-01〜R-11。2026-10-07の依頼者承認範囲の回答保存・公開Engine／GETは#133、質問入力・回答版の競合復旧とTodayの出所別表示は#137・#81でmainへ接続済み。[D-26](../architecture.md#d-26)の当時のOPEN履歴と現契約を区別し、実装を製品受入・実ユーザーでの校正済みとは扱わない |
| DECIDED | 現行の実績由来の予測モデル（2状態Bayesian Markov、Beta(2,2)、中心指標はBeta-Geometric分布の中央値）、Data Modelと記載済みの業務API規則。契約の未定義部分・解釈の判断待ちは[Architecture](../architecture.md#現行状態2026-09-30)から確認する |
| DECIDED（基本構成） | 2026-10-03のD-23基本構成採用は、FE側のDiscord上の了承についての依頼者報告とBE本人の了承記録に基づく。[採用構成・理由・次の作業](../architecture.md#2026-10-03の技術構成合意)。2026-10-05に[npm workspacesと`pg`を追加採択](../architecture.md#2026-10-05の追加採択)。当時の合意範囲と、後日の[版固定・API契約](../architecture.md#technology-stack)を分けて読む |
| 条件付き第一候補 | Better Authは[D-24](../architecture.md#d-24)。公開はFE・BEともVercel Hobby＋Neon Free、ローカルDockerが[D-25](../architecture.md#d-25)の第一候補（2026-10-08、本人アカウント・厳密0円・非商用・検証条件付き）。最終採択・配備済み・一般公開や課金の許可ではない |
| mainの実装／受入・公開待ち | [Prediction計算本体・テスト](../../packages/prediction/README.md)、起動基盤・DB schema/migration・認証・Goal・記録・Today APIと実APIを使う業務画面はmainにある。画面の実装・既存ローカル検証記録と、製品受入・E2E・公開配置の残条件は[対応表の現在地](../change-map.md#現在地の読み方)で区別する。未mergeの画面変更をmainの説明へ混ぜない |

コードフリーズ後は、原則としてソースコードと事前提出資料を編集できません。
過去の案・会話・実験コードは採用済みの仕様ではありません。

情報には次の区分を明記します。

- **確定**：チームで明示的に決定済み。
- **候補**：現在検討している選択肢。
- **仮説**：検証が必要な推測。
- **未定**：まだ議論・決定されていない事項。

現時点では文書、4種類のIssue Forms、PRテンプレート、AI向けSkills、Serena設定、miseの共通タスク、文書・設定検証用のGitHub Actionsがあります。
現行のアプリ起動構成（npm workspaces・`apps/api`・`apps/web`・Compose・単一コンテナ・Application CI）は#70で、DBスキーマとmigration（`npm run db:migrate`）は#74で、認証（登録・ログイン・ログアウト、未ログインは401）は#75でローカル実装済みです。Goal API（#76）と記録・Today API（#77、`/today`が純粋Engineを呼ぶ）、Goalの一覧・作成・編集・削除画面（#78）とToday画面（#81）は実APIでローカル実装済みです。今日の記録・変更（#79）と昨日の補完・訂正（#80）も実APIで保存します。公開先（staging）への配置は未実施です。
現行の未決定事項と当時の検証記録への入口は[開発基盤の状態](development-foundation-status.md)で区別しています。
次の案で使える資産と再評価が必要な条件は[引き継ぎの棚卸し](reuse-handoff.md)にまとめています。
実装の棚卸し・調査基準・関連する判断Issueは[仕様・実装・確認方法の対応表](../change-map.md)を参照してください。
初めてコードを読む場合は、[記録保存から予測表示までのtrace・用語・テスト入口](../change-map.md#コードを読むための短いtrace)から進めます。

Demo Seed（#82）は認証で作成済みのuserIdとtimezoneを明示し、専用2Goalだけを作成・resetします。[実行・再実行・保全の手順](demo-seed.md)を参照してください。公開DBと恒久Demo Accountの作成、Webの通し確認は別途必要です。

</details>
<!-- readme-adoption:end -->

以下は旧READMEの成果への案内。個人の担当を追加・推定するものではない。
<!-- readme-team:start -->
## チームの成果と読みどころ

個人の担当・レビュー実績は、各 Issue の Assignee、PR の差分・作者・レビュー記録で確認できます。本 README はチーム成果を紹介し、個人が全体を担当したとは記載しません。

| 成果 | 読みどころ |
| --- | --- |
| [Engine #90](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/90) | 説明可能なモデル、純粋関数の責務分離、独立オラクル、完了分布の数値計算 |
| [API・基盤 #89](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/89) | 所有者境界、量・設定版・再送の保存契約、実 DB 回帰、Docker 起動・終了 |
| [画面 #88](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/88) | Goal → Today → 記録の導線、材料不足と範囲外の説明、通信・競合・session 状態の回復 |
| [仕様と実装の対応表](../change-map.md) | 要件・判断・実装・テスト・実施結果をつなぐ開発記録 |
<!-- readme-team:end -->

以下は旧READMEの文書案内を保管したもの。「このREADME」は移動前の文書を指す。現行の文書配置はCONTRIBUTINGを参照する。
<!-- readme-guidance:start -->
## 最初に読む順番

1. このREADME：前提、現在の状態、情報の置き場所。
2. [CONTRIBUTING.md](../../CONTRIBUTING.md)：チーム共通の開発ルール。
3. [開発ガイド](../DEVELOPMENT_GUIDE.md)：環境準備からIssue・ブランチ・PR・マージ後までの操作。
4. [AGENTS.md](../../AGENTS.md)：AIへ作業を依頼する際の共通ルール。
5. [AI開発ツールガイド](../../AI_DEVELOPMENT_TOOLS.md)：MCPとSkillsの使い分け、利用状況。

機能の仕様を知りたい・変更したい場合は、[対応表](../change-map.md#アプリの仕様と実装)から「目的・操作・入力や表示の条件・失敗時の動作」を説明する機能文書へ進み、内部処理、関連コード、確認方法をたどります。
正式な設計文書は[Product Spec](../product-spec.md)と[Architecture](../architecture.md)の2本です。アプリの起動構成とProduct機能の実装状況、比較結果と未検証範囲はArchitectureからたどれます。[開発基盤と作業手順](../change-map.md#開発基盤と作業手順)と[配置ルール](../../CONTRIBUTING.md#仕様文書の配置)も参照してください。

AIは最初にAGENTS.mdを読み、必要な文書とSkillを参照してください。

## 情報の正本

| 情報 | 正本 |
| --- | --- |
| プロジェクト概要、日程、文書の入口 | このREADME。Product・Architectureの状態は下記2正本を参照 |
| Issue / ブランチ / コミット / PR / レビュー / マージ / Ready・Done / Scopeの運用ルール | [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| 共通ルールを実行する具体的な操作手順 | [開発ガイド](../DEVELOPMENT_GUIDE.md) |
| AIの判断範囲、安全性、実装・検証原則 | [AGENTS.md](../../AGENTS.md) |
| ツールの利用方針、環境依存情報、Skill一覧 | [AI開発ツールガイド](../../AI_DEVELOPMENT_TOOLS.md) |
| 作業別のAIワークフロー | [.agents/skills/](../../.agents/skills/) の各SKILL.md |
| 機能・ページ・基盤から仕様、実装、確認方法への対応と棚卸し | [仕様・実装・確認方法の対応表](../change-map.md) |
| 個別タスクの背景・目的・範囲・完了条件 | [GitHub Issue](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues) |
| 現在のStatus・Scope | [GitHub Projects](https://github.com/orgs/jogi-hack-2026-team/projects/1)（アクセス権が必要） |
| 正式Product仕様・要件・Scope・Product Decision Log | [Product Spec](../product-spec.md) |
| 正式Architecture・技術候補・DB・Deployment・Architecture Decision Log | [Architecture](../architecture.md) |
| 現行基盤の状態と旧設定・検証記録への入口 | [開発基盤の状態](development-foundation-status.md) |
| リリース・提出・デモ | [リリースとデモの手順](release-demo.md) |

仕様・設計・資料の追加先と執筆手順は[ドキュメント運用](../../CONTRIBUTING.md#ドキュメントと技術判断)を正本とします。過去の草稿・実施結果は[Issue単位の履歴フォルダ](../changes/)から探せます。フォルダには新しい正式仕様を置きません。
同じ説明をコピーせず、正本へリンクします。
<!-- readme-guidance:end -->

以下は基準commit時点の状態説明。日程と当時の実装区分を履歴として保持し、現行仕様の追加正本にはしない。
<!-- readme-state:start -->
## 現在の状態

2026-10-11、main `3e5d9fb` を基準に説明しています。開発期間は 2026-09-19〜2026-10-12、コードフリーズは 2026-10-12 です。

| 区分 | 現在地 |
| --- | --- |
| main の実装 | 登録・ログイン・ログアウト、本人の Goal 管理、今日の記録、昨日の補完・訂正、履歴、Today の予測・出所表示 |
| ローカルで起動できる構成 | Docker Compose の単一 Web/API コンテナ＋PostgreSQL。公開用 bundle のローカル検証入口もある |
| 公開・製品受入 | 公開 URL、HTTPS・実クラウドの認証/DB/負荷、最終 UX 受入は未完了。[公開前の確認](release-demo.md) |
| 追加機能 | 本人向け予測保存・実績照合は main にあるが**既定 OFF**。[R-12](../product-spec.md#本人向けの予測保存実績照合r-12既定off) |
| 開発中 | [#244](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/244) の量入力・保存後表示、[#227 / PR #238](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/238) の実験的な本人学習比較。基準 main の実装紹介には含めない |

実画面の画像は今回未掲載です。量入力・保存後表示の仕上げ後に、確定した実装を動かして撮影する範囲を残しています。以下の画像は説明図です。
<!-- readme-state:end -->
