# AI開発ツールガイド

この文書は、Issue #10とIssue #28で整理したツール利用方針の正本です。共通の開発ルールは [CONTRIBUTING](CONTRIBUTING.md) を参照してください。

作業に必要な説明は[文書入口](docs/README.md)、読み込む範囲・引継ぎ・独立レビューの渡し方は[コンテキストの組み立て方](CONTRIBUTING.md#aiへ渡すコンテキスト)から選びます。ツールの追加より先に、既存の実装・確認方法を調べます。

## 採択済みの運用方針

2026-09-19に採択した3点のうち、GitHub操作の基本手段は2026-09-23の明示決定（Issue #28）でAIエージェント向けに変更しました。Playwrightとdocumentation-syncの方針は維持します。
採択方針と各環境への導入・設定状況は分けて管理します。

| 対象 | 決定 | 理由・適用範囲 |
| --- | --- | --- |
| GitHub MCP | AIエージェントによるIssue・GitHub Projects・Pull Request操作の基本手段とする。接続・認証・権限を確認し、利用できない場合はGitHub Web UIで代替する | チケットを起点にIssueとProjectの状態を直接確認・更新できる。ローカルのBranch・Commit・Pushは引き続き`git`を使う。人間の操作手段は強制しない |
| Playwright | ブラウザ操作・E2E確認に **CLI＋Skill** を利用する。Playwright MCPは常時MCPに追加しない | 検証方法の方針を明確にする。CLI・対応Skillの導入、設定、E2E整備はUI実装時に行い、変更に応じて実ブラウザで確認する |
| documentation-sync | 既存Skillを今回正式に採択する | 変更に関係する文書の整合を確認し、必要な正本だけ更新する。毎回すべての文書の更新を要求しない |

GitHub MCPの採択は全メンバーの接続完了を意味しません。接続できない環境ではGitHub Web UIを使い、Issueを確認・作成できないまま変更を始めません。個人のMCP設定や認証情報をリポジトリに含めず、同じ操作を複数の経路で重複実行しません。PlaywrightのCLI・対応Skillの導入状況は利用前に確認し、未配置のSkillを存在するものとして扱わないでください。
documentation-syncは既存ファイルと利用ルールを確認したうえで、今回の承認を正式採択の根拠とします。

Issue #47の[ML Agent Harness](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/ml-agent-harness.md)は旧音楽案の履歴です。2026-09-30に通常のmiseタスクとCIから外しました。当時の番号指定なしのキュー処理は、依頼されたGitHub CLIとCodex CLIを使用していました。通常のAIによるGitHub操作のMCP優先方針は維持します。Harnessの存在を次のProductの自動化採択や全環境でのCLI導入・認証完了とみなしません。


## 利用前の確認

- GitHub MCP：利用前にツールの公開、認証、対象リポジトリとProjectへの権限を確認する。未接続・権限不足は未確認として扱う。
- ブラウザ検証：既存の[Chrome/CDP回帰と実API・隔離DBの継続E2E](docs/DEVELOPMENT_GUIDE.md#検証)を優先する。これはPlaywrightの導入確認とは別。Playwright CLI＋Skillが必要な場合は、その環境での検出・本文・依存ツールを確認する。
- [documentation-sync](.agents/skills/documentation-sync/SKILL.md)：既存Skillを確認済み。今回の正式採択を記録し、変更に関係する正本への影響だけを確認する。

関連Issue：[旧`gh`方針 #10](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/10)、[GitHub MCPへの切り替え #28](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/28)

## 変更に応じた補助Skillと検証

個人環境のSkillは共有リポジトリへの導入済み一覧に含めない。利用時は実際の検出・本文・依存ツールを確認し、導入や権限追加は別の判断とする。既存の作業用Skillを優先し、`review-gate`／`pr-review`と同等の差分レビューに`find-bugs`を追加で実行しない。

- 予測・統計的主張・実験解釈を評価するときは[Product Spec](docs/product-spec.md)、Architectureの[Prediction Engine](docs/architecture.md#prediction-engine)と[Test Strategy](docs/architecture.md#test-strategy)、[実験・根拠の索引](docs/prediction/experiment-history.md)を先に読む。必要なら`scientific-critical-thinking`を補助に使う。P50／P80／Δとモデル仮定は正本に従い、数値テスト・合成比較の成功を実測に対する精度・校正・製品受入の証明にしない。
- 小さな文書・文言修正は意味・参照・差分と既存の文書検証を基本とする。既存のレビューSkillが要求するUI変更の実ブラウザ確認など、プロジェクトの必須検証は維持し、重要な表示や挙動への影響に応じて追加する。設定点検や一般の報告書作成を完全セキュリティ監査の依頼と解釈しない。

### CodexでUIを設計・検証する

1. **対象画面と利用者が行う操作を決める。** Issueの受け入れ条件を[Product Spec](docs/product-spec.md)と[画面設計書](docs/design.md)で確認し、[変更対応表](docs/change-map.md#アプリの仕様と実装)から既存の画面・部品・検証をたどる。通常状態に加え、変更に関係する未入力・通信失敗・保存中などの状態を選ぶ。Reactの実装・レビューで`vercel-react-best-practices`を使う場合は、現行の[React＋Vite](apps/web/package.json)に当てはまる指針を参照する。
2. **画面構成や情報の優先順位に判断が必要なときだけ案を比較する。** 現行画面を基準に、変更案で主要な操作が見つかるか、スマートフォン幅で情報と操作が見えるかを確認する。既存のFigma案から実装するときは、参照権限のある対象フレームをFigma MCPと`figma-design-to-code`で読む。ImageGenを使う場合は合成データによる視覚案に限る。判断が必要な案はIssue・PRに理由とともに提示し、仕様や導線の変更は既存の承認手順に従う。
3. **変更した操作と表示を実画面で確かめる。** [利用前の確認](#利用前の確認)に従い、既存のChrome/CDP回帰と、必要な場合は隔離環境のE2Eを使う。対象画面のUX・アクセシビリティを監査する場合は、利用可能な`web-design-guidelines`を補助にし、[画面設計書のアクセシビリティ項目](docs/design.md#アクセシビリティ)から変更に関係する点を選ぶ。例えばフォームではキーボードでの操作、フォーカスの移動・復帰、エラー通知を確認する。読み上げ自体が受け入れ条件なら実際の支援技術で確かめ、未実施ならPRに記録する。
4. **既存のPRレビューへ渡す。** `review-gate`と`documentation-sync`を使い、確認した画面・状態・環境と結果、未確認事項をPRに記録する。画像は[UI変更時の既存ルール](CONTRIBUTING.md#ui変更がある場合)に従い、合成データで撮影する。開発ハーネスで実行する場合は、[#340の実行契約](https://github.com/FutureROI-DevTeam/Future-ROI/issues/340)で許可された入力・操作・検証の範囲に従う。

共通SkillやMCPは、既存の利用環境を再利用する。各セッションで必要なSkillの検出と本文、ツールの接続を確認し、Figmaを使うときは対象ファイルへの権限も確認する。使えない補助ツールがあれば、画面設計書と既存画面で進められる範囲を確認し、残った制約をIssue・PRに記録する。インストール・権限追加やチームの正式採択には別途判断が必要となる。

## リポジトリで確認できる導入状況

この表は2026-09-19の監査記録を基に、GitHub MCPは2026-09-23、ghは2026-10-03の個人環境の確認結果を併記したものです。全メンバーのPCへの導入を保証するものではありません。

| 対象 | 確認結果 | 制約・未検証事項 |
| --- | --- | --- |
| Git | ローカルで実行可能 | GitHubへのpush・認証は環境ごとに確認する |
| GitHub MCP | 2026-09-23、KaitoのWindows CodexでIssueの読み取り・作成・更新と非公開Projectの読み取り・Status/Scope更新を確認 | 個人環境での確認。全メンバーの接続・権限と将来の稼働は未確認。Secret実値や個人設定はGit管理しない |
| GitHub CLI（gh） | 2026-09-23の作業環境ではPATH上に見つからなかった。2026-10-03、KaitoのWindows環境で公式配布版の導入と、このrepoのIssue／PR読み取りを確認 | 環境・時点ごとの確認。全員の導入・書込権限や将来の接続は保証しない。AI向けの基本手段はIssue #28のGitHub MCP方針を維持し、個別の明示依頼ではその指定に従う |
| Context7 MCP | ライブラリ仕様を確認するための接続先として利用可能 | 接続設定は各AIクライアントで確認する |
| Serena MCP | コードベース探索用の接続先として利用可能 | 対象言語のバックエンドやシンボル探索の範囲は技術スタック決定後に確認する |
| Playwright CLI＋Skill | リポジトリ内に専用設定・Skillはない。個人環境の導入状況は別に確認する | 方針は採択済み。実装済みのブラウザ検証は[開発ガイド](docs/DEVELOPMENT_GUIDE.md#検証)へ。既存のChrome/CDP runnerをPlaywright導入済みとは扱わない |

未導入のツールを導入済みと扱いません。接続できない場合は未確認と記録し、無断でインストールやリポジトリ設定の追加を行わないでください。

## リポジトリに配置されたSkills

以下のSkillはこのリポジトリに配置されています。利用時はそれぞれのSKILL.md本文を読み、目的に合うものだけを使います。

| Skill | 主な用途 |
| --- | --- |
| [issue-to-pr](.agents/skills/issue-to-pr/SKILL.md) | Issue確認からBranch、実装、検証、Pull Request作成まで |
| [bug-investigation](.agents/skills/bug-investigation/SKILL.md) | 不具合の再現、原因検証、最小修正 |
| [documentation-sync](.agents/skills/documentation-sync/SKILL.md) | 機能仕様の執筆、変更前・変更時・完了前の正本・実装・説明の整合確認 |
| [review-gate](.agents/skills/review-gate/SKILL.md) | Pull Request作成前のセルフレビュー |
| [pr-review](.agents/skills/pr-review/SKILL.md) | 他メンバーのPull Requestレビュー |
| [architecture-decision](.agents/skills/architecture-decision/SKILL.md) | 技術・設計の比較と判断材料の整理 |
| [scope-guard](.agents/skills/scope-guard/SKILL.md) | 機能追加・削除・優先順位変更の影響整理 |
| [旧ml-issue-execution](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/.agents/skills/ml-issue-execution/SKILL.md) | 廃止した音楽案のML Issue手順。現行の実装ワークフローには使わない |

Skillの存在は、各ワークフローが実行済みであることや、技術・プロダクトの採択を意味しません。
