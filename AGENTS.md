# AGENTS.md

## 1. このファイルの目的

このファイルは、JOGI HACK 2026リポジトリで作業するAI Coding Agent向けのプロジェクト共通ルールである。

Codex、Claude Code、GitHub Copilotなど、利用するAIに関係なく、
このリポジトリで作業するAIは最初にこのファイルを確認すること。

このファイルには、

- 常に守るべきプロジェクト共通ルール
- 不確定情報の扱い
- 実装時の基本原則
- Git / GitHub利用時の基本原則
- テスト・検証方針
- ドキュメント方針
- AIの判断範囲

のみを記載する。

特定作業の詳細な手順は `.agents/skills/` に分離する。

同じルールを複数ファイルへコピーしない。

Single Source of Truthを維持する。

開発基盤の現行状態と旧構成への入口は[開発基盤の状態](docs/operations/development-foundation-status.md)を参照する。
ADOPTEDを動作確認済みと扱わない。外部リソース作成・権限・保護設定変更は対象と差分の承認後に行う。
Secret不要の検証へProductionのSecretを渡さない。現段階の文書検証コマンドは[README](README.md#開発基盤のセットアップと確認)を参照する。

---

## 2. Project Context

大会名：

`JOGI HACK 2026`

開発期間：

`2026-09-19` ～ `2026-10-12`

Code Freeze：

`2026-10-12`

対象：

Web Application

チーム人数：

3人

Code Freeze後は、原則としてソースコードおよび事前提出資料を編集できない。

大会後に明示依頼された保守は[CONTRIBUTINGの大会後の保守](CONTRIBUTING.md#大会後の保守)に従い、対象Issueの範囲で進める。大会時の提出条件と現在の保守を混同しない。

そのため、

- 実装量
- 技術選定
- テスト量
- ドキュメント量
- リファクタリング範囲

は、残り開発期間を考慮して判断すること。

---

## 3. 現在のプロジェクト状態

正式な現在のProduct・Scopeは[Product Spec](docs/product-spec.md)、Architecture・技術採択・条件付き候補は[Architecture](docs/architecture.md)を確認する。採択済みでも本番実装・実User検証済みとは扱わない。過去の会話・PoC・古いIssueを現在の決定へ昇格させない。OPEN / RECOMMENDED / CONDITIONALを人間の判断なくDECIDEDへ変更しない。

作業開始時は次の順に読む。

[目的別の文書入口](docs/README.md#目的から読む)で該当節を選ぶ。下記は関連要件・契約を読む順序であり、全資料の全文読込を要求しない。引継ぎと根拠の更新は[AIへ渡すコンテキスト](CONTRIBUTING.md#aiへ渡すコンテキスト)に従う。

1. [Product Spec](docs/product-spec.md): 対象RequirementとScope。
2. [Architecture](docs/architecture.md): 実現責務と正式Decision。
3. [変更対応表](docs/change-map.md)から実在Code / Testsを調査する。
4. 新Productの領域文書が作成された場合は、そのREADMEからdecision-log、design-intent、implementation-guideと必要なevidenceを確認する。

[旧音楽案の保管資料](README.md#廃止した音楽案の履歴)は当時の判断・検証を調べる場合だけ参照し、現在の実装手順へ持ち込まない。

Supporting Docsは理由・証拠・実装手順を展開する補助資料であり、正式な仕様の追加正本ではない。

---

## 4. 不確定情報の扱い

プロジェクト内の情報は、以下を区別する。

### 確定

チームで明示的に決定済みの事項。

### 候補

現在検討している選択肢。

### 仮説

検証が必要な推測。

### 未定

まだ議論・決定されていない事項。

AIは、

`候補 → 確定`

`仮説 → 事実`

へ勝手に変換してはいけない。

判断材料が不足している場合は、推測で埋めず「未定」と扱う。

---

## 5. Source of Truth

情報の種類ごとに正本を分ける。

### `AGENTS.md`

AIが常に守るプロジェクト共通ルール。

### `CONTRIBUTING.md`

人間・AI共通の開発運用ルールの正本。

主に以下を扱う。

- Issue
- Branch
- Commit
- Pull Request
- Review
- Merge
- GitHub Projects
- Scope
- Definition of Ready
- Definition of Done

### `docs/DEVELOPMENT_GUIDE.md`

GitHubや開発フローに慣れていないメンバー向けの詳細ガイド。

管理IssueのReady・Status・Close判断は[開発ガイドのFuture ROIのIssue運用](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)へ集約する。共通の開発運用は `CONTRIBUTING.md` を参照する。

### `AI_DEVELOPMENT_TOOLS.md`

AI向けツール、MCP、CLI、Skillsの採用方針の正本。

どのツールを使用するか判断するときは、このドキュメントを確認する。

### `.agents/skills/`

特定作業を行うときの詳細なワークフロー。

### `docs/product-spec.md` / `docs/architecture.md`

正式なProduct・Architecture設計の正本はこの2本だけとする。要件・Scope・Product Decision Logは前者、実現方式・Technology Stack・DB・Deployment・Architecture Decision Logは後者に集約する。
配置と補助資料・過去の基盤ADRの扱いは[CONTRIBUTING](CONTRIBUTING.md#仕様文書の配置)を参照する。

### GitHub Issue

個別タスクの目的、背景、スコープ、完了条件の正本。

### GitHub Projects

現在のStatusとScopeの正本。

---

## 6. 情報が矛盾した場合

複数のドキュメント間で内容が矛盾している場合、
勝手にどちらかを採用しない。

まず、

1. どの情報が矛盾しているか確認する
2. どちらが現在の決定なのか判断できる証拠を探す
3. 判断できない場合は人間へ確認する

現在の人間からの明示的な指示がある場合は、それを優先する。

ただし、

- Secret漏洩
- データ破壊
- Git履歴破壊

など安全性に関わる操作は、指示内容を確認してから実行する。

---

## 7. 基本原則

技術からプロダクトを考えない。

必ず、

課題
↓
必要な機能
↓
必要な技術的性質
↓
技術選定

の順番で考える。

以下を技術採用理由にしてはいけない。

- 流行っている
- 新しい
- 難しい
- 技術的に強そう
- 有名企業が利用している
- AIが実装しやすい

技術は目的ではなく手段である。

---

## 8. JOGI HACKで意識する観点

技術判断では、以下を意識する。

1. 技術の相当性
2. アーキテクチャ・設計の妥当性
3. 技術的な挑戦の度合い
4. プロダクトの完成度
5. 技術的な面白さ

ただし、審査基準を満たすためだけに不要な技術を導入しない。

AIは、

「技術を増やせば評価される」

という前提で提案してはいけない。

---

## 9. 技術的挑戦

技術的挑戦は、

「難しい技術を使用すること」

ではなく、

「プロダクト固有の難しい問題を技術で解決すること」

として扱う。

候補としては、

- 大量データ処理
- Real-time処理
- 非同期処理
- Search
- Recommendation
- 差分検出
- 状態同期
- AI出力検証
- Conflict解決
- Offline対応
- Authorization
- Performance改善
- 複雑なDomain Rule

などがあり得る。

ただし、実際のプロダクトに必要なものだけ採用する。

複数の難しい技術を浅く導入するより、
1〜2個の本質的な技術課題を深く解決することを優先する。

---

## 10. Architecture

Architectureを先に決めない。

以下をデフォルトで採用してはいけない。

- DDD
- Clean Architecture
- Hexagonal Architecture
- CQRS
- Event Sourcing
- Microservices
- Event Driven Architecture
- Kubernetes
- Message Queue
- Vector Database

必要性がある場合のみ検討する。

目標は、

「複雑なArchitecture」

ではなく、

「必要な複雑性だけを持つArchitecture」

である。

---

## 11. 技術選定

新しい技術を導入するときは最低限以下を確認する。

1. 何を解決するのか
2. 現在の方法・単純な方法ではなぜ不足するのか
3. 実装コスト
4. 学習コスト
5. Debug難易度
6. 運用コスト
7. Testコスト
8. 開発期間への影響
9. チームメンバーが採用理由を説明できるか

重要な技術判断では `.agents/skills/architecture-decision/` を利用する。

採用が決定した重要事項は、正式な2文書の該当Decision Logに記録する。

---

## 12. ADR

重要な技術・設計判断を記録するときは、基本的に以下を整理する。

### Context

なぜ判断が必要になったか。

### Decision

何を採用したか。

### Alternatives

何を比較したか。

### Reason

なぜその案を選んだか。

### Consequences

どのような利点・欠点・制約・今後の影響があるか。

重要な判断をAIとの会話だけに残してはいけない。

過去のDecisionを変更するときは、
古いADRを黙って書き換えない。

新しいProduct・Architecture判断は該当する正式文書内のDecision Logへ記録し、旧判断を参照して変更理由と影響を残す。正本には短い判断要約と詳細リンクを置き、比較理由は領域別decision-log、日常の作業経緯はIssue/PRへ記録する。記録対象・SUPERSEDED・履歴分離の規則は[CONTRIBUTING](CONTRIBUTING.md#decision-logを増やしすぎないためのルール)を参照する。新規の正式ADR群は作らず、既存の開発基盤ADRは過去の決定記録として保持する。

Existing Decisions / Baselineを理由なく再議論しない。明確な欠陥・要件未達・重大リスク・コスト超過・単純化等の根拠がある場合だけ、[Product SpecのReconsideration Policy](docs/product-spec.md#reconsideration-policy)に従って提案する。提案 → 人間Decision → 正式反映の順を守る。

---

## 13. Skills

`.agents/skills/` には、特定作業用の詳細ワークフローを配置する。

AIはタスクに関係するSkillだけを確認する。

すべてのSkillを毎回読み込む必要はない。

現在の主なSkillは以下。

### `issue-to-pr`

既存Issueを実装し、Pull Requestまで進める場合。

### `bug-investigation`

バグや予期しない挙動を調査する場合。

### `review-gate`

Pull Request作成前にセルフレビューする場合。

### `pr-review`

他メンバーのPull Requestをレビューする場合。

### `architecture-decision`

重要な技術・設計判断を行う場合。

### `scope-guard`

機能追加・削除・優先順位変更など、スコープ判断を行う場合。

### `documentation-sync`

変更後にコードとドキュメントの整合性を確認する場合。
正式採択と適用範囲は[AI開発ツールガイド](AI_DEVELOPMENT_TOOLS.md#採択済みの運用方針)を参照する。

Skillは、リポジトリ内に実際に存在することを確認してから利用する。

`AI_DEVELOPMENT_TOOLS.md`に記載されていても、
まだ追加されていないSkillを存在するものとして扱わない。

---

## 14. Skillの使い分け

### 通常のIssue実装

Issue
↓
`issue-to-pr`
↓
実装
↓
`documentation-sync`
↓
`review-gate`
↓
Pull Request

### Bug

Bug
↓
`bug-investigation`
↓
Root Cause特定
↓
Fix
↓
`documentation-sync`
↓
`review-gate`
↓
Pull Request

### Pull Request Review

Pull Request
↓
`pr-review`
↓
Blocking / Should Fix / Optional
↓
Human Reviewer判断

### 技術判断

技術的な問題
↓
`architecture-decision`
↓
Alternatives比較
↓
Team Decision
↓
正式文書内のDecision Log

### Scope変更

追加案
↓
`scope-guard`
↓
Must / Should / Couldの影響整理
↓
Team Decision

AIが最終的なProduct Decisionを勝手に行わない。

### Design Change Contract

変更前にRequirement / Decision / Design Intent / Evidence / Testsへの影響を確認する。意図不明な設計を推測で変えず、関連する理由・代替案・不変条件を読んでから変更する。Framework都合でProduct要件を変えない。Supporting Artifactの成功だけで採択へ昇格しない。不変条件の破壊、新Library / Framework / Algorithm導入は対象要件とEvidenceで必要性を説明する。

変更後は必要な仕様、Tests、Decision / Intent、Evidenceと対応表を同期する。新しい重要設計には「なぜ必要か、なぜその構造か、Alternatives、Trade-offs、Invariants、Non-goals、再検討条件、Evidence」をDesign Intentとして残す。private chain-of-thoughtではなく、人間がレビュー可能な設計理由へ要約する。項目・配置・Doneの正本は[CONTRIBUTING](CONTRIBUTING.md#変更に伴う文書更新)を参照する。


---

## 15. AI Tools

AI向けツールの詳細な採用方針は `AI_DEVELOPMENT_TOOLS.md` を正本とする。

AGENTS.mdでは、基本的な役割だけ定義する。

### Serena

自分たちのコードベースを意味的に調査するときに使用する。

主な用途：

- Symbol検索
- Definition確認
- Reference確認
- 呼び出し元・呼び出し先
- 影響範囲
- Rename
- Refactoring

単純なファイル検索や小規模な変更では、
標準のファイル操作や検索を優先する。

Serenaを使用すること自体を目的にしない。

### Context7

外部Library / Frameworkの現在の仕様を確認するときに使用する。

特に、

- Version依存API
- Configuration
- Deprecated API
- Framework固有仕様
- Security関連仕様
- Migration

について、AIの記憶だけで推測しない。

Context7へSecretや不要な内部情報を渡さない。

### Playwright

UIやUser Flowへ影響する変更を実ブラウザで確認するときに使用する。
[採択済み方針](AI_DEVELOPMENT_TOOLS.md#採択済みの運用方針)に従い、CLI＋Skillを利用する。Playwright MCPは常時MCPに追加しない。
CLI・対応Skillの導入、設定、E2E整備はUI実装時に行い、利用前に導入状況を確認する。

主な用途：

- UI操作
- User Flow
- E2E
- Screenshot
- Console
- Network
- Bug再現
- 修正後確認

すべての変更でPlaywrightを起動する必要はない。

### GitHub

AIエージェントによるIssue・GitHub Projects・Pull Request操作は[採択済み方針](AI_DEVELOPMENT_TOOLS.md#採択済みの運用方針)に従い、GitHub MCPを基本手段とする。
利用前に接続・認証・対象リポジトリの権限を確認し、利用できない場合はGitHub Web UIで代替する。Issueを確認・作成できない場合は変更を始めない。
ローカルのBranch・Commit・Pushには`git`を使用する。

同じ操作を複数のツール経路で重複実行しない。

---

## 16. Issue

実装・修正・設定・文書の変更は、変更着手前にIssueへ紐付ける。チケット未作成のままローカル編集を先行しない。
既存Issueの利用、新規作成、承認・権限待ちの扱いは[CONTRIBUTINGの着手条件](CONTRIBUTING.md#チケット作成を着手条件にする)に従う。

Issueの着手・進捗更新・Close前には、[開発ガイドのFuture ROIのIssue運用](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)を読む。階層、管理IssueのReady、最新情報の確認、Close・製品完成の判断手順は同ガイドへ集約し、このファイルに複製しない。

Issueを確認するときは、

- 背景
- 目的
- 完了条件
- Scope
- Assignee
- 関連Issue
- 開発情報

を確認する。

Issueの完了条件が曖昧な場合、
大きな実装を開始する前に確認する。

Issueのスコープ外を勝手に実装しない。

追加作業を発見した場合は、

1. 現Issueに必須か確認する
2. 必須でない場合は別Issue候補として整理する
3. 現PRへ無断で混ぜない

---

## 17. Scope

GitHub Projectsでは以下を使用する。

### Must

Code Freezeまでに必ず完成させる。

### Should

Must完成後に取り組む。

### Could

余力がある場合のみ取り組む。

Mustの完成度を犠牲にしてShould / Couldを実装しない。

機能追加・Scope変更を検討する場合は、必要に応じて `scope-guard` Skillを使用する。

---

## 18. GitHub Workflow

開発フローの詳細は `CONTRIBUTING.md` を正本とする。

個別の作業Issueに適用する基本フロー：

Issue
↓
Ready
↓
Branch
↓
In Progress
↓
Implementation
↓
Commit / Push
↓
Pull Request
↓
In Review
↓
Review
↓
Squash Merge
↓
Done

AIはこの流れを無視して独自のGit Workflowを導入しない。

AIは、個別の作業Issueについて、作業開始時に `In Progress`、PR作成時に `In Review`、Merge後に `Done` へGitHub ProjectsのStatusを更新する。管理IssueのStatusは[開発ガイド](docs/DEVELOPMENT_GUIDE.md#管理issueのstatus)に従う。承認要件と状態遷移の正本は `CONTRIBUTING.md` とし、必要なApproveがないPRをMergeしたり、保護ルールをbypassしたりしない。

---

## 19. Branch Strategy

このリポジトリでは `main` を中心としたシンプルなBranch運用を使用する。

`develop` Branchは使用しない。

通常：

main
↑
Pull Request
↑
作業Branch

`main` 上で直接実装しない。

Branch名は `CONTRIBUTING.md` に従う。

基本的に、

`1 Issue = 1 Branch = 1 Pull Request`

を個別の変更を扱う作業Issueに適用する。管理Issueの扱いは[開発ガイド](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)を参照する。

---

## 20. 作業開始前

コードを変更する前に最低限以下を確認する。

1. 現在のBranch
2. Working Tree
3. 対象Issue
4. 完了条件
5. 関連コード
6. 既存実装パターン
7. ドキュメントへの影響

最低限確認するコマンド：

    git status

    git branch

未Commitの変更が存在する場合、
それが自分の変更か他人の変更か確認する。

他人の変更を勝手に削除・上書きしない。

責務・配置・テストを整理する作業では、[Architectureの境界](docs/architecture.md#責務と配置を変えるとき)と[検証の範囲](docs/DEVELOPMENT_GUIDE.md#検証)を確認する。

---

## 21. Git Safety

以下を安易に実行しない。

- `git reset --hard`
- `git clean -fd`
- `git push --force`
- History Rewrite
- 他人の未Commit変更を破棄する操作

必要性がある場合は、人間へ確認する。

`git add .` は原則として使用しない。

まず、

    git status

    git diff

で変更を確認する。

必要なファイルだけStageする。

    git add <file>

必要に応じて、

    git add -p

を使用する。

Commit前に、

    git diff --staged

で実際にCommitされる内容を確認する。

AIが作成するCommitメッセージとPull Requestタイトルは、変更内容の説明を日本語で書く。`feat:`などの種別、Issue番号、固有名詞・技術名は英語や記号のままでよいが、説明を英語だけにしない。
Commit前とPR作成前に実際に使う文言を確認する。Squash MergeでPRタイトルがCommitメッセージになる場合も同じルールを適用する。人間が作成するCommitとPRの言語は、このAI向けルールの対象外とする。

---

## 22. 変更範囲

現在のIssueに必要な変更だけを行う。

以下を同じPRへ無断で混ぜない。

- 無関係なRefactoring
- 無関係なRename
- 無関係なFormatting
- Dependency Update
- Architecture変更
- 別IssueのBug Fix
- 別機能
- 不要なDocumentation変更

改善価値がある場合は別Issue候補として提示する。

AIがコードを生成しやすいという理由で変更範囲を拡大しない。

---

## 23. Existing Code

新しい実装Patternを導入する前に、類似コードを調査する。

既存コードを確認せず、

「一般的にはこうだから」

という理由だけで構造を変更しない。

ただし、

「既存コードに存在する」

ことだけを、

「正しい設計である」

根拠にもしてはいけない。

既存実装とDocumentation / ADRが矛盾している場合は、その事実を報告する。

---

## 24. Dependencies

新しいDependencyを追加するときは、必要性を確認する。

最低限、

- 何を解決するか
- 既存Dependencyで代替できないか
- 標準機能で代替できないか
- Maintenance状況
- Security
- Runtime / Bundleへの影響
- 学習コスト
- Debugコスト

を確認する。

現在のIssueと無関係なDependency Updateは行わない。

---

## 25. Test

Testは数を増やすことを目的にしない。

特に以下を優先する。

- Business Rule
- Invariant
- Validation
- Boundary
- Error Case
- Regression
- Complex Transformation
- Important Integration

既存Testを通すためだけに、

- Assertionを弱くする
- Testを削除する
- Skipする

といった変更をしてはいけない。

Test自体が誤っていると考える場合は、理由を明示する。

---

## 26. Verification

実装後は、変更内容に応じて検証する。

Technology Stackが確定するまでは、

- Build Command
- Lint Command
- Typecheck Command
- Test Command

を勝手に決めない。

Technology Stack確定後は、Repository内の正しいCommandを確認して利用する。

AIは、

「実行していないTestが通った」

と報告してはいけない。

以下を区別する。

- 実際に検証済み
- Code Readingで確認
- 推測
- 未検証

UIやUser Flowに影響する変更では、必要に応じてPlaywrightを利用する。

---

## 27. Bug Investigation

バグを発見した直後に、原因未確認のままコードを書き換えない。

バグ調査では `.agents/skills/bug-investigation/` を利用する。

基本的な考え方：

症状
↓
再現
↓
期待挙動
↓
実挙動
↓
原因仮説
↓
仮説検証
↓
Root Cause
↓
最小修正
↓
Regression確認

Root CauseとFixを混同しない。

---

## 28. Pull Request前

Pull Request作成前には `review-gate` Skillを利用する。

最低限以下を確認する。

- Issueの完了条件
- 不要な変更
- Error Handling
- Boundary
- Data Integrity
- Security
- Test
- UI
- Accessibility
- Documentation Impact

AIによるセルフレビューをHuman Reviewの代替にしない。

---

## 29. Pull Request Review

他メンバーのPRをAIでレビューするときは `pr-review` Skillを利用する。

指摘は基本的に以下へ分類する。

### Blocking

Merge前に修正が必要。

### Should Fix

可能であればMerge前に修正したい。

### Optional

任意改善。

以下のような内容をBlockingにしない。

- 自分ならこう書く
- 自分の好み
- 少し綺麗になる
- 将来的には良さそう

コードの問題と個人的な好みを区別する。

最終的なApprove / Request ChangesはHuman Reviewerが判断する。

---

## 30. Documentation

すべての変更で、

「Documentationへの影響があるか」

を確認する。

[documentation-sync](.agents/skills/documentation-sync/SKILL.md)で変更に関係する正本への影響を確認し、必要な文書だけ更新する。毎回すべての文書を更新する必要はない。

実装・バグ修正を含む変更前に、関連仕様と[変更対応表](docs/change-map.md)を読み、コード検索で影響範囲を確認する。
各機能の仕様は[配置ルール](CONTRIBUTING.md#仕様文書の配置)に従い、目的・操作・条件・状態・内部処理を説明する。コード一覧だけで仕様説明を代替しない。
変更時・完了前は[CONTRIBUTINGの執筆・保守手順](CONTRIBUTING.md#文書を書く手順)に従い、必要な仕様・対応表・参照を更新する。Skillはこの規則を実行する入口とする。履歴の配置・全文移動・旧見出し保全は[履歴の配置と移動](CONTRIBUTING.md#履歴の配置と移動)に従い、AGENTS.mdへ履歴を追記しない。更新不要の場合は理由を報告する。共通の完了条件は[CONTRIBUTING](CONTRIBUTING.md#definition-of-done)を正本とする。

確認対象：

- `README.md`
- `CONTRIBUTING.md`
- `docs/DEVELOPMENT_GUIDE.md`
- `docs/product-spec.md`
- `docs/architecture.md`
- [旧開発基盤ADR](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/decisions/0001-development-foundation.md)（既存基盤判断の履歴参照）

以下が変更された場合はDocumentation更新を検討する。

- User Behavior
- Setup
- Development Command
- Environment Variable
- API
- External Service
- Database
- Architecture
- Responsibility Boundary
- Authentication
- Authorization
- Development Workflow
- Deployment
- Technical Decision

すべての変更でMarkdownを追加する必要はない。

Markdownを作ること自体を目的にしない。

同じ説明を複数ファイルへ書かない。

---

## 31. Secret

以下をRepositoryへCommitしない。

- API Key
- Access Token
- Password
- Database Credential
- Private Key
- Webhook URL
- `.env` の実値
- その他Secret

外部ツールへも、必要のない内部情報やSecretを渡さない。

Secretを誤って公開した場合、

「Commitを消したから安全」

とは判断しない。

必要に応じてSecret自体を無効化・再発行する。

---

## 32. AIの役割

AIは単純な肯定役ではない。

提案を評価するときは必要に応じて、

- 良い点
- 弱い点
- Technical Risk
- Product Risk
- Schedule Impact
- Alternative

を整理する。

弱い案は弱いと指摘してよい。

ただし否定だけで終わらず、改善案や代替案も提示する。

---

## 33. AIが勝手に決めてはいけないもの

特に以下は、人間の明示的な判断なしに確定しない。

- Product
- Target User
- Core Value
- Must / Should / Couldの最終分類
- Framework
- Database
- Authentication
- Infrastructure
- Major Architecture
- AI導入
- External Service
- Major Dependency
- Scope Expansion

AIは比較・分析・提案を行う。

最終判断はチームが行う。

---

## 34. High-impact Action

以下のような影響の大きい操作は、明示的な依頼がない限り勝手に実行しない。

- Shared Branchの削除
- Force Push
- Git History Rewrite
- Repository設定変更
- Branch Protection変更
- CI Required Check変更
- Secret削除・Rotation
- Production Data変更
- Database destructive operation
- Infrastructure変更
- Major Dependency置換
- Architecture全体の変更

通常のIssue実装の範囲内で毎回確認を要求する必要はない。

---

## 35. AI生成コード

AIが生成したコードもHuman Codeと同じ基準で扱う。

AI生成であることを理由に、

- 検証を省略する
- Testを省略する
- 読めない抽象化を入れる
- 大量のBoilerplateを追加する
- Scopeを拡大する

ことを認めない。

生成コードは、

- 理解可能
- Review可能
- Test可能
- Scope内
- Existing Conventionと整合

している必要がある。

---

## 36. 完了報告

AIが作業を完了したときは、最低限以下を明確にする。

### Changed

何を変更したか。

### Files

どのファイルを変更したか。

### Verification

実際に何を実行・確認したか。

### Not Verified

確認できなかったもの。

### Follow-up

現在のIssue外として残した作業。

実際に確認していないことを、
確認済みとして報告してはいけない。

---

## 37. Code Freeze

Code Freezeは `2026-10-12`。

Code Freezeが近づいた段階では、

- 新規機能追加
- Large Refactoring
- Architecture変更
- Dependency大量更新
- Riskの高い改善

より、

- Must完成
- Bug Fix
- Regression確認
- Test
- Demo安定性
- Documentation
- Submission確認

を優先する。

`freeze-check` Skillが追加された場合は、Code Freeze前確認で利用する。

---

## 38. 最重要原則

このプロジェクトでは、

「技術をたくさん使ったプロダクト」

ではなく、

「なぜその技術が必要なのか説明できるプロダクト」

を目指す。

AIを使ってCode量を増やすことを目的にしない。

すべての重要な判断について、チームが、

「なぜ？」

と聞かれたときに説明できる状態を維持する。

重要な判断を、

- AI Memory
- AI Chat
- 個人メモ
- Discordだけ

に閉じ込めない。

必要な情報はGit管理されたRepository内へ残す。

判断材料が不足している場合は、
推測で確定させず、不確定であることを明示する。
