# 大会後の文書整理と独立レビュー（#341）

Supporting Artifact / Not a Source of Truth

対象：[Issue #341](https://github.com/FutureROI-DevTeam/Future-ROI/issues/341)。2026-11-13 JST、基準main `7beba614697ecc3098cde122e2f0305842962812`。文書の整理であり、アプリ再検証・公開受入・Product/Architectureの新規採択ではない。

現行の仕様は[Product](../product-spec.md)と[Architecture](../architecture.md)、読む場所は[文書入口](../README.md)、更新・コンテキストの規則は[CONTRIBUTING](../../CONTRIBUTING.md#aiへ渡すコンテキスト)を参照する。

## 移した過去の現在地

change-map冒頭の2026-10-09時点の併用記録を全文保存する。「本PR」は当時の記録を指す。原文範囲・リンク付け替えと旧見出しの保持は[移動manifest](issue-341-documentation-migration.json)で検査する。

<!-- change-map-state:start -->
2026-10-09のmain `593e126`（#175・#172を含む）と、本PRの#157・#148・#155の併用契約を基準に読む。Goal・記録・Today API、純粋Engine、実APIを使うGoal・今日の記録・昨日の補完／訂正・Today画面、R-11の質問入力・保存・予測／出所表示はコードにある。下表の「ローカル実装済み」「実ブラウザ確認」は各実装PRの既存記録を示し、本書の更新でアプリを再検証したという意味ではない。実ユーザーでの需要・効果・数値校正、製品受入、E2E・公開配置は別の残条件として各Issueで確認する。

[PR #147](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/147)の画面・ルート変更とGoal一覧の`progressDone`はmain `685e7d0`で統合済み。本PRはその表示と#148の保存契約を両方保持する。PR175 `f575741`（PR159のFE owner/連続性/訪問境界を含む）をPR163へ通常mergeした。#157の到達予定日と#148の作成ledger・設定CASを併用し、確定作成の終了処理も保持する。各Issue/PRで製品受入・merge状態を確認する。D-26や候補資料の2026-10-05時点のOPEN／提案は当時の記録。現利用は[2026-10-07の承認範囲](../architecture.md#2026-10-07の保存予測接続133)と実コードで確認する。

併用時の作成終了は[Architecture](../architecture.md)と[175検証記録](../operations/issue148-verification.md#pr159の通常取込みと確定作成の終了境界2026-10-09)を参照する。[session-draft.browser.tsx](../../apps/web/tests/session-draft.browser.tsx)は成功通知消費・次の新規入力・K2/別owner原文・storage例外を直接resetなしで検証する。[issue148-browser.mjs](../../apps/web/tests/issue148-browser.mjs)のF23は実APIで確認中成功→次の新規→NUL422訂正を連続検証する。

併用の境界は[作成・期日・設定CASのAPI回帰](../../apps/api/tests/goals-target-date-integrity.test.ts)、[両順序のmigration保存性](../../apps/api/tests/goal-pair-migrations.test.ts)、[復元・期日・409リベースの画面回帰](../../apps/web/tests/target-date-integrity.test.mjs)で確認する。既存hashとの互換、期日の変更／解除による設定版、回復bodyの不変性を対象とする。実ブラウザの範囲と人工条件は[最終併用の検証記録](issue-157-final-integration.md)で明記する。
<!-- change-map-state:end -->

## 独立レビューと変更内容

独立したエージェントによる読み取りレビュー。全コード・全履歴の監査ではなく、文書の入口と現行の検証・配備経路の整合を対象にした。判定はすべてShould Fix。

| 指摘 | 対応 |
| --- | --- |
| change-mapが継続E2Eを未整備と記載 | 既存のChrome/CDP・実API・隔離DBの入口へ修正。公開環境の受入と区別 |
| READMEの「現在の状態」が10/11の履歴へ遷移 | 現行の対応表と日付付き履歴へのリンクを分離。履歴本文は保持 |
| 公開R-10の実装欄が未定 | 既存のVercel bundle・CDのtraceへ接続。配備成功は主張しない |
| 基盤の現行説明に旧Node版が混在 | 導入当時の値と明示し、現行版はpackage.json・起動手順へ誘導 |
| AIツール案内がUI実装前の説明のまま | 既存runnerとPlaywrightの採択・導入状況を区別して案内 |

追加で、対象要件・契約・実装・テスト・更新先へ進む索引と、出典付きの引継ぎ項目を整備した。大会時のFreezeと今回の明示依頼による保守を区別し、大会当時のScopeや採択状態は変更しない。

変更後の独立レビューで、移動した本文に含まれる現役の期日・設定CAS・migration両順序の3テストが履歴経由でしか探せなくなる点を追加指摘された。履歴全文を保持しつつ、[現行の境界・テスト入口](../change-map.md#変更前に読む境界とテスト入口)へ3本の参照を戻した。任意改善として指摘された#244の「APIは変更しない」もP-23当時の範囲と明示し、現P-27/D-35との見かけの矛盾を解消した。

## 検証と未確認

本文移動検査は1,379文字の全文・相対リンクの意味・元見出し順の保持を確認した。Foundationの初回は新索引の予測文書参照1件で失敗し、実在するdecision-logへ修正して再実行した。修正後のFoundationは成功。独立レビューで次の3導線を実ファイルまで照合した。

| 代表依頼 | 確認した導線 |
| --- | --- |
| 量入力変更 | 文書入口 → MVP/Today・P-27/D-35 → 量入力・保存hook・Log store → goal-feedback・log-change・継続E2E |
| R-11競合 | 文書入口 → R-11/D-26 → 回答revisionのtrace → Goal store/routes・reloadLatestGoal・rebaseValues → question-prior-http・goal-form |
| CD遮断 | 文書入口 → R-10/Deployment → release-guide §12 → workflow・deploy-gate → gate回帰 |

いずれも更新先はCONTRIBUTING「変更に伴う文書更新」へ到達する。これはコード読解と導線の確認であり、表中のアプリテストを今回実行したという意味ではない。

アプリ・DB・ブラウザ・本番・外部権限はこの文書変更では再検証しない。文書全体の歴史的記述を最新化したという保証や、読解効率の実人評価は含めない。既存の図・コード・テスト・CI定義は変更していないため、アプリ全suiteや図の再検証は今回の対象外。開発ガイドは既存の正しい検証手順を参照し、本文の複製や更新は不要と判断した。

## 次の改善案（未採択）

| 案 | 最小の試し方・評価 | 制約 |
| --- | --- | --- |
| AIによる差分と文書の照合 | まず3件のPRで、変更パスから該当R/P/D・文書の更新候補と根拠を出す。人が実際の漏れ・誤検知・確認時間を記録 | 自動書換え・採択・Mergeはしない。#340の開発ハーネスと重複する実装を別に作らない |
| 文書を探す課題による評価 | 量入力、R-11競合、CD遮断の3依頼で、仕様・コード・テスト・更新先に到達できるかを記録 | token数の減少だけで質を判断せず、見落とした不変条件も数える。モデル・対象SHA・条件を固定 |
| AGENTSと大きい正本の段階的な縮小 | 共通ルールとの重複を棚卸しし、既存見出し・必須境界・履歴を保つ小さい移動PRで試す | ルールを短くするために削除しない。読み込み量の実測後に分割を判断 |
| 古い現在形の検出 | まず「本PR」「未整備」「現在」などの候補を検索して、人が現行・履歴のどちらか判定 | 日付だけで古いと断定しない。履歴を自動書換えするCIにはしない |

必要な情報を検索で段階的に取得する設計の参考は、Anthropic Applied AIの[Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)（2025-09-29、2026-11-13参照）。本リポジトリでの効果測定や新ツール採択の証拠ではない。上の改善案はこのリポジトリの不整合から導いた提案である。
