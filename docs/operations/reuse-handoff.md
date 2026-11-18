# 次のProduct案へ引き継ぐ資産

2026-09-30、[整理Issue #67](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/67)時点の棚卸し。これは再利用のための作業案内であり、Productや技術採択の正本ではない。現行の決定は[Product Spec](../product-spec.md#現行状態2026-09-30)と[Architecture](../architecture.md#現行状態2026-09-30)を確認する。2026-09-30にProduct（Future ROI）を決定し、技術スタックの候補を[D-23](../architecture.md#d-23)に記録した（技術選定確定待ち）。下表の各資産の採否は、確定後に実装Issueで記録する。

| 資産 | 残す理由と現在の到達点 | 次の案で行うこと |
| --- | --- | --- |
| Issue Forms、PRテンプレート、[開発ルール](../../CONTRIBUTING.md)、[AI向けSkills](../../.agents/skills/) | チケットからレビューまでの共通手順。Productの中身を決めない | 新案のIssueに目的・作業範囲・完了条件を記録し、[着手条件](../../CONTRIBUTING.md#definition-of-ready)を確認する。旧案のIssueを再開しない |
| [文書・設定チェック](../../scripts/check-foundation.ps1)と[Foundation CI](../../.github/workflows/foundation.yml) | リンク、形式、設定の検査を継続できる。Productの動作試験ではない | 文書変更時に実行し、追加した仕様・コード・確認方法を[対応表](../change-map.md)へつなぐ |
| [旧Node/npm設定](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/mise.toml)、[旧Web/APIの最小起動構成](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/apps/)、[旧Application CI](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/.github/workflows/application.yml) | 当時の版固定・型検査・ビルドの土台。WebとAPIはhealthの確認までで、Product機能はない。現在は履歴として退避 | 新案の要件からFE/BE構成の必要性を再評価する。使う場合は新案の契約・テストを追加する。既存のbuild成功を機能完成と扱わない |
| [旧ローカルCompose](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/compose.yaml)と[旧起動手順](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/DEVELOPMENT_GUIDE.md#composeでwebapipostgresqlを起動する) | 当時Web/API/開発用DBをまとめて起動した記録。DB接続やmigration、公開環境は別。現在は履歴として退避 | DBが必要か要件から判断する。採用する場合はschema、migration、接続試験を新案のIssueで決める |
| [旧案のFE/BE/ML記録](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/FE/README.md)、[比較PoC](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/experiments/stack-bakeoff/README.md)、[評価・調査記録](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/ML/README.md) | 失敗例、検証方法、判断の根拠を後から参照できる。旧案の実装契約や採択ではない | 関連する課題が生じた場合だけ条件・データ・権利・結果を再確認し、必要な部分を新案の仕様へ明示的に取り込む |
| [旧ML Issue向けHarness](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/ml-agent-harness.md)のコードとテスト | Issue選択・停止規則と模擬CLIテストを検証可能な履歴として残す | 通常のmiseタスクとCIからは外した。新案で自動化が必要になった場合は、対象Issue、権限、人間判断の境界を再設計し、別Issueで安全性と実行試験を確認する |

次の案の着手時は、まず課題・対象User・MVPとScopeを決め、正式2文書へ反映する。その後に上表の各資産を「そのまま利用・変更して利用・履歴のみ」のいずれで扱うか、理由と検証条件をIssueに記録する。技術の存在や過去の成功だけで再採択しない。現在のコードと確認方法の所在は[変更対応表](../change-map.md)を参照する。

旧案の[最終Gate #66](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/66)から引き継ぐ検証方法は、成立が必須の外部データ・権利・User Flowを代表サンプルで早期に通し、期限内に成立する証拠を確認すること。APIの応答、合成データのテスト、PoCの成功はそれぞれ何を確かめたかを分けて記録する。新案に同種の依存がなければ、この検証を形式だけで追加しない。

ローカルにしかない旧調査ブランチや未push成果は、現時点の共有済み資産に含めない。共有する必要が生じたら対象・Secret・検証結果を確認し、別Issueで扱う。

READMEの旧音楽案への案内を、再利用時の確認をまとめた本書へ全文移した。履歴の再採用は意味しない。
<!-- readme-music:start -->
## 廃止した音楽案の履歴

2026-09-29に廃止した音楽探索案（[Product Spec P-10](../product-spec.md#p-10-音楽探索案の廃止)）の記録です。現行Future ROIの仕様・設計・検証ではないため、#200でREADMEの状態表・読む順番・正本一覧からの重複した案内を外し、開発者向けの折りたたみへまとめました。本文と固定履歴は削除していません。

<details>
<summary>当時の記録の参照方法（開発者向け）</summary>

廃止した音楽案の文書・比較PoC・当時の設定は、[固定commit `77c71a5` のtree](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration)から参照します。#188でtracked file 111件を現在の作業ツリーから外しました。Git履歴と当時の採択・失敗・検証結果は保持し、現行アプリの仕様や起動手順へ自動適用しません。

ローカルで調べる場合は、そのcommitの別checkoutから `archive/music-exploration` を参照してください。現行checkoutの設定やDBへ復元して動かす前に、[再利用時の確認事項](reuse-handoff.md)を確認します。

固定履歴のfile内容だけを読むには、`<path>`を当時のrepository相対pathに置き換えて `git show 77c71a5f248a4dce4ce9fb8af6619b41541be9d8:<path>` を実行します。現在の作業ツリーへ書き戻す操作ではありません。

過去の開発基盤の判断履歴は[開発基盤ADR](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/decisions/0001-development-foundation.md)です。新規Product設計の正本を増やしません。旧音楽案のML Issue向けCodex Harnessは通常の実行タスクとCIから外しました。再利用前の確認事項は[引き継ぎ](reuse-handoff.md)を参照してください。

</details>
<!-- readme-music:end -->
