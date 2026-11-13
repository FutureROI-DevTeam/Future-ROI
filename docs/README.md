# ドキュメントの入口

このページは読む場所を選ぶ索引です。正式仕様や進捗の追加正本ではありません。製品の紹介・起動方法は[リポジトリREADME](../README.md)、文書の配置・更新規則は[CONTRIBUTING](../CONTRIBUTING.md#ドキュメントと技術判断)を参照します。

## 目的から読む

変更作業では、対象Issueの範囲を確認してから **Productの該当要件 → Architectureの対応契約 → change-mapの実装・テスト** の順で進みます。表は読み始める節を選ぶための案内です。AIの共通ルールは[AGENTS](../AGENTS.md)、ツールの選び方は[AI開発ツールガイド](../AI_DEVELOPMENT_TOOLS.md)にあります。

| 目的 | 最初に読む説明 | 実装・確認方法への入口 |
| --- | --- | --- |
| 製品の目的・できることを知る | [Product概要](product-spec.md#product-overview)・[MVP要件](product-spec.md#requirementsmvp) | [アプリの対応表](change-map.md#アプリの仕様と実装) |
| 起動・開発環境を用意する | [起動・検証](DEVELOPMENT_GUIDE.md#アプリを起動検証する) | [package.json](../package.json)・[環境変数の空の例](../.env.example) |
| Goal・量入力・記録保存を変更する | [MVP要件](product-spec.md#requirementsmvp)・[Today表示](product-spec.md#today-decision画面の表示仕様) → [API契約](architecture.md#api契約) | [保存から表示までのtrace](change-map.md#記録の入力からdb予測表示まで)・[#244の対応](change-map.md#goalとtodayの量入力保存後表示244) |
| 初期質問・回答の競合を変更する | [R-11](product-spec.md#質問から始める見通しr-11) → [D-26](architecture.md#d-26) | [409から再保存](change-map.md#回答revisionの409から再保存まで)・[R-11の対応](change-map.md#r-11の既存issueへの対応) |
| 予測の計算・意味を調べる | [Productの意味と限界](product-spec.md#product-overview) → [Prediction Engine](architecture.md#prediction-engine) | [Engine README](../packages/prediction/README.md)・[予測の設計理由](prediction/decision-log.md) |
| 認証・本人のデータ保護を調べる | [R-01](product-spec.md#requirementsmvp) → [認証の契約](architecture.md#2026-10-06の認証実装75) | [認証・所有者境界のテスト入口](change-map.md#変更前に読む境界とテスト入口) |
| 公開・CDの準備や失敗を調べる | [R-10](product-spec.md#requirementsmvp) → [Deployment](architecture.md#deployment) | [リリース手順](operations/release-guide.md)・[配備コードと確認方法](change-map.md#確認記録と残課題) |
| テストの範囲と実行方法を知る | [Test Strategy](architecture.md#test-strategy) → [検証手順](DEVELOPMENT_GUIDE.md#検証) | [Application CI](../.github/workflows/application.yml)・[CI集計の説明](../.github/scripts/README.md) |
| 仕様や文書を整理する | [文書を書く手順](../CONTRIBUTING.md#文書を書く手順) | [変更時の更新先](../CONTRIBUTING.md#変更に伴う文書更新)・[履歴の移動と検査](../CONTRIBUTING.md#履歴の配置と移動) |

## 現在と過去を区別する

- **現在の契約**：Product SpecとArchitecture。未採択の案やコードの存在で契約を置き換えません。
- **実装と確認の入口**：change-mapから実ファイルへ進みます。「テストがある」「特定SHAで通った」「公開環境で受け入れた」は別の情報です。
- **作業の現在値**：Issue・PR・[Project](https://github.com/orgs/FutureROI-DevTeam/projects/1)。この索引にはStatusやテスト件数を転記しません。
- **判断の理由**：正本のP/D番号から領域文書・Evidenceへ進みます。旧判断を調べる必要がある場合に履歴を読みます。
- **当時の証跡**：[Issue別の履歴](changes/)・[実験履歴](prediction/experiment-history.md)・[基盤の履歴](operations/development-foundation-status.md)。日付・対象SHA・条件を確認し、過去の未実施も現在の成功も推測しません。

## 大会後に再開する

大会時の日程・提出版と、現在の保守対象を区別します。[大会後の保守](../CONTRIBUTING.md#大会後の保守)に沿って対象Issueを決め、現在のmainと作業ブランチの差分を確認します。公開済みSHAや製品受入は文書の最終更新日から判断しません。

AIへ作業を渡すときは、[必要なコンテキストの組み立て方](../CONTRIBUTING.md#aiへ渡すコンテキスト)を使います。履歴の全文や全Skillを初回入力へ足す代わりに、対象要件・不変条件・実装・検証の根拠へたどれる情報を渡します。
