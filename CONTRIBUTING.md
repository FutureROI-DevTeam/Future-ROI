# Contributing

> GitHubやIssue、Branch、Pull Requestを使った開発に慣れていない場合は、
> [初心者向け開発運用ガイド](docs/DEVELOPMENT_GUIDE.md) を先に確認してください。

## 開発フロー

### 大会後の保守

開発期間と2026-10-12のCode Freezeは大会時の提出に関する条件として保持します。大会後に明示依頼された保守は、そのIssueの目的・完了条件・変更範囲で扱い、提出済み資料や大会時の版を遡って変更したことにはしません。通常のIssue・Branch・Review・検証の規則は引き続き適用します。

大会当時のMust / Should / Couldや未完了の受入条件を、時間の経過だけで変更・完了にしません。追加作業のScopeは依頼者が指定し、Projectに記録します。条件付きセルフマージの継続・解除と保護設定の変更も、文書整理から自動決定しません。

基本的に以下の流れで開発します。

1. 対応する既存Issueを確認し、なければ変更着手前にIssueを作成する
2. Issueの目的・内容・完了条件を確認する
3. 担当者が自分をAssigneeに設定し、Scopeを設定する
4. Issueを `Ready` にする
5. 最新の `main` から作業Branchを作成する
6. Issue本文の「開発情報」に作業Branchを記載し、Push後にリンクを追記する
7. 作業開始時に `In Progress` にする
8. 実装・動作確認を行う
9. 変更内容を確認してCommitする
10. Pushする
11. Pull Requestを作成する
12. PRで全て解決するIssueを `Closes #<Issue番号>`、一部対応・参考を `Refs #<Issue番号>` で記載する
13. Issue本文の「開発情報」にPull Requestのリンクを記載する
14. `In Review` にする
15. レビューを受ける
16. 指摘がある場合は修正し、再レビューを依頼する
17. 承認後、Squash Mergeする
18. Issue / Projectが `Done` になったことを確認する
19. Merge済みの作業Branchを削除する

担当者は、各操作を完了した時点でGitHub ProjectsのStatusも更新します。実装中・レビュー待ち・Merge済みを同じStatusのまま放置しません。

---

## Branch運用

`main` はレビュー済みの変更が統合されたBranchです。

`main` 上では直接開発しません。

基本構成は以下です。

    main
    ↑
    Pull Request
    ↑
    feat/* / fix/* / refactor/* / docs/* / chore/*

原則として、

`1 Issue = 1 Branch = 1 Pull Request`

を個別の変更を扱う作業Issueに適用します。管理Issueの扱いは[開発ガイド](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)を参照してください。

複数の無関係なIssueを同じBranchで扱わないでください。

---

## ブランチ命名

以下の形式を使用します。

- `feat/<Issue番号>-<概要>`
- `fix/<Issue番号>-<概要>`
- `refactor/<Issue番号>-<概要>`
- `docs/<Issue番号>-<概要>`
- `chore/<Issue番号>-<概要>`

例：

`feat/12-document-upload`

`fix/23-save-error`

`docs/6-development-guide`

### Prefixの意味

| Prefix     | 用途                         |
| ---------- | ---------------------------- |
| `feat`     | 新機能・機能追加             |
| `fix`      | バグ修正                     |
| `refactor` | 外部の動作を変えない内部改善 |
| `docs`     | ドキュメント                 |
| `chore`    | 開発環境・設定・依存関係など |

---

## Issue

### チケット作成を着手条件にする

実装・修正・設定変更・ドキュメント更新は、変更着手前にGitHub Issueへ紐付けます。
小さな変更やローカルだけの作業でも、チケットを省略しません。

Future ROIの階層・管理IssueのReady・着手前の再確認・Closeと製品完成の判断手順は、[開発ガイドのIssue運用](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)へ集約します。個別Issueの目的・依存・完了条件とProjectの担当・Status・ScopeはGitHubで確認し、文書へ現在値を複製しません。

1. 既存Issueを検索し、目的・範囲が一致する未完了Issueがあれば利用します。追加修正も同じ範囲なら同じIssueに記録し、重複作成しません。
2. 対応するIssueがなければ、目的・範囲・完了条件を記載して作成します。投稿案をローカルに用意しただけでは作成完了ではありません。
3. Issue番号・URL、Assignee、Scope、Definition of Readyを確認してから、番号付きBranchで変更を開始します。

Issue作成に承認が必要な依頼では、投稿する内容を示し、**変更着手前に**承認を求めます。
ログイン・権限不足や承認待ちの場合も、チケット未作成のまま実装・設定・文書編集を先行しません。
その間に行えるのは、既存状態の読み取り調査とIssue本文案・判断材料の準備までです。
すでにチケットなしで着手していた場合は、既存変更を消さずに状況を報告し、紐付けを整えてから対象作業を再開します。

Issueは以下の4種類を使用します。

- Feature
- Bug
- Task
- Investigation

### Feature

新しい機能や既存機能の拡張に使用します。

### Bug

想定した動作になっていない不具合の修正に使用します。

### Task

機能追加・バグ修正以外の開発作業に使用します。

例：

- ドキュメント作成
- CI構築
- 開発環境整備
- リファクタリング

### Investigation

技術・仕様・実現可能性などを調査するときに使用します。

単に調査するだけではなく、

「何を判断するための調査なのか」

を明確にしてください。

---

## Issueに書く内容

各Issueには可能な限り以下を記載します。

- 目的・背景
- やること
- 完了条件
- 開発情報

特に「完了条件」を明確にします。

悪い例：

`検索機能を作る`

良い例：

- [ ] キーワードを入力できる
- [ ] 検索結果が表示される
- [ ] 検索結果が0件の場合の表示がある

「どこまでできればIssueを完了できるのか」が分からない状態で実装を開始しないでください。

---

## IssueとBranch / Pull Requestの紐付け

担当者は、Issue本文の「開発情報」に対応するBranchとPull Requestを記載します。
Branchを作成した時点で名前を記載し、GitHub上に作成・PushしたらBranchのリンクを追記してください。
PR作成後はPRのリンクも追記します。IssueのDevelopment欄で関連付けた場合も、本文の開発情報を更新してください。

Issue本文の末尾などに、以下の形式で記載してください。

    ## 開発情報

    - Branch: [feat/12-search](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/feat/12-search)
    - Pull Request: #18（またはPRのURL）

Pull Requestをまだ作成していない場合：

    ## 開発情報

    - Branch: `feat/12-search`
    - Pull Request: 未作成

上記のBranch名・Issue番号・PR番号は記載例です。実際に作成したものに置き換えてください。
同じリポジトリのPRは `#18` のように番号を書いてもリンクになります。未作成のBranch・PRは「未作成」とし、存在しないリンクを記載しないでください。

### Branch

可能な限りIssueの右側にある、

`Development → Create a branch`

からBranchを作成してください。

GitHub上でもIssueとBranchの関係を追いやすくするためです。

### Pull Request

Pull Requestで対応Issueを全て解決する場合は、以下の形式で記載します。

`Closes #12`

これにより、

- Issue
- Branch
- Pull Request

の関係を追いやすくします。

PRが `main` へMergeされると、対応Issueも自動的にCloseされます。

一部対応・Supporting Artifact・管理Issueの参照には `Refs #12` を使います。自動Closeの指定前と手動Close前の確認は[開発ガイド](docs/DEVELOPMENT_GUIDE.md#closeと製品完成を確認する)に従ってください。

---

## Assignee

Assigneeは、そのIssueを担当する人です。

チケットに着手する本人が、作業開始前に自分をAssigneeとして設定してください。
Issue作成時は `Select assignees` から自分のGitHubアカウントを選択します。
作成後はIssue右側の `Assignees` の編集、または `Assign yourself` で設定できます。
Issue作成者と作業担当者が異なる場合も、実際に作業する人を設定します。担当が変わったらAssigneeも更新してください。

担当者が分からない状態のIssueを勝手に実装し始めないようにします。

---

## Scope

### StatusとScope

Statusは作業の進捗、Scopeは完成の優先範囲です。両者を別々に設定します。
Statusの値・更新方法は[GitHub Projects](#github-projects)を参照してください。

GitHub Projectsの `Scope` を使用します。

- `Must`: コードフリーズまでに必ず完成させる
- `Should`: Must完成後に取り組む
- `Could`: 余力がある場合のみ取り組む

Mustの完成度を犠牲にしてShouldやCouldを実装しないでください。

---

## GitHub Projects

原則1人1Issueとし、レビューが滞っている場合は新規着手よりレビューを優先します。
BoardのWIP上限と資料との差分の旧記録は[履歴](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md#資料との相違点)を参照し、列や上限を無断で置換しません。

Statusは以下を使用します。

以下の着手・PR・Mergeの遷移は個別の作業Issueに適用します。最上位・領域の管理Issueの扱いは[開発ガイド](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)を参照してください。

    Backlog
    ↓
    Ready
    ↓
    In Progress
    ↓
    In Review
    ↓
    Done

Projectの自動追加対象はIssueです。PRはIssue本文の開発情報とDevelopment欄から追跡し、IssueカードのStatusを更新します。既存PRカードの扱いは[旧基盤状態](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md#資料との相違点)に記録しています。

| 対象 | タイミング | Status |
| --- | --- | --- |
| Issue | Issueを作成し、まだ着手条件を満たしていない | Backlog |
| Issue | 目的・完了条件・Assignee・Scopeが決まり、着手できる | Ready |
| Issue | Branchを作成して作業を開始する | In Progress |
| Issue | Pull Requestを作成してレビューを依頼する | In Review |
| Issue | `Request changes`を受けて修正する | In Progress |
| Issue | 修正後に再レビューを依頼する | In Review |
| Issue | PRが `main` へMergeされ、IssueがCloseされたことを確認する | Done |

### Backlog

まだ着手できる状態になっていないIssueです。

例：

- 仕様が未確定
- やるか判断していない
- 調査が必要
- Scopeが決まっていない

### Ready

個別の作業Issueが着手条件を満たした状態です。管理Issueについては[開発ガイド](docs/DEVELOPMENT_GUIDE.md#着手前に読み直す)に従います。

### In Progress

現在作業中です。

### In Review

Pull Requestを作成し、レビューを待っている状態です。

### Done

PRが `main` へMergeされ、作業が完了した状態です。

実装が終わっただけではDoneではありません。

---

## Definition of Ready

個別の作業Issueを `Ready` にするには、最低限以下を満たしている必要があります。管理Issueの扱いと実装前の再確認は[開発ガイド](docs/DEVELOPMENT_GUIDE.md#future-roiのissue運用)に従います。

- [ ] 目的・背景が分かる
- [ ] やることが分かる
- [ ] 完了条件が分かる
- [ ] Scopeが設定されている
- [ ] 実際の作業担当者がAssigneeに設定されている
- [ ] 大きすぎるIssueになっていない
- [ ] 必要な前提作業が完了している

条件を満たしていないIssueは、原則として実装を開始しません。

---

## 作業開始前

新しい作業を始める前に、ローカルの `main` を最新状態にします。

    git switch main
    git pull origin main

その後、Issue用のBranchで作業します。

GitHub上ですでにBranchを作成している場合：

    git fetch origin
    git switch feat/12-example

ローカルでBranchを作成する場合：

    git switch -c feat/12-example

古い `main` を元に新しいBranchを作らないようにしてください。

現在のBranchは以下で確認できます。

    git branch

---

## コードの読みやすさ

`.editorconfig`に従い、条件の判定、入力の変換、更新、結果の構築を改行・空行で区切ります。長い条件や引数は一項目ずつ並べ、早期return・throwにもblockを使って判断と処理を読み分けます。formatterや依存の導入を目的にせず、変更対象の意味のまとまりだけを整理します。

コメントは理由、数式の前提・単位、境界、失敗時の保証を残します。コードを日本語へ言い換えるだけの説明や重複は省き、長い設計理由は正本・領域文書へ参照を置きます。数式の記号と変数の対応を明示し、演算順序・比較の等号・丸め・乱数・資源上限を整形の都合で変えません。JSX、文字列、SQLの空白は意味を持つため、通常のコードの字下げと分けて確認します。

抽出は同じ理由で変わる処理を単位にします。純粋な変換・表示と状態・副作用を分け、owner・訪問世代・transaction・時計の所有者を増やしません。変更する場所と依存方向は[Architectureの責務と配置](docs/architecture.md#責務と配置を変えるとき)、実装と確認の入口は[変更対応表](docs/change-map.md#コードを読むための短いtrace)に同期します。見た目・コメントの整理と責務抽出は別commitにし、それぞれ意味の保持を確認します。

## Commit

コミットメッセージは変更内容が分かる形にします。

例：

- `feat: ファイルアップロード機能を追加`
- `fix: 保存時のエラーを修正`
- `refactor: パーサーの責務を整理`
- `docs: READMEを更新`
- `chore: Issueテンプレートを追加`

---

## Commitする前に確認する

まず現在の変更状態を確認します。

    git status

変更差分を確認します。

    git diff

---

## `git add .` は原則使用しない

このプロジェクトでは、意図していないファイルをCommitする事故を防ぐため、

`git add .`

は原則使用しません。

変更したファイルを確認して、必要なファイルだけStageします。

例：

    git add src/example.ts
    git add README.md

変更の一部分だけStageしたい場合：

    git add -p

`git add -p` は、変更を部分ごとに確認しながらStageするコマンドです。

Stageした内容はCommit前に必ず確認します。

    git diff --staged

意図していない変更が含まれている場合は、そのままCommitしないでください。

---

## 1つのCommitに無関係な変更を混ぜない

例えば、

- 検索機能の実装
- READMEの修正
- 別画面のバグ修正

を1つのCommitにまとめないでください。

できるだけ、

「このCommitは何を変更したのか」

を説明できる単位に分けます。

ただし、Commitを細かく分割すること自体を目的にはしません。

---

## Pull Request

Pull Requestでは以下を守ります。

- 対応Issueと紐付ける
- `main` へ直接pushしない
- `main` を対象とするPRは、書き込み権限を持つ別メンバーのApproveが最低1件付くまでMergeしない
- 保護ルールのbypassや、承認待ちのままのMergeを行わない
- Merge方式はSquash Mergeを使用する
- レビューコメントは解決してからMergeする
- 無関係な変更を同じPRに含めない
- PRを必要以上に大きくしない

関連Issueには、

`Closes #12`

のように記載します。

---

## Pull Requestを作る前のセルフレビュー

PRを作成する前に、自分で変更内容を確認します。

最低限以下を確認してください。

- [ ] Issueの完了条件を満たしている
- [ ] 意図していないファイルを変更していない
- [ ] デバッグ用コードを残していない
- [ ] 不要なコメントアウトを残していない
- [ ] APIキーやパスワードなどの秘密情報を含んでいない
- [ ] 関係のないフォーマット変更を含んでいない
- [ ] 必要な動作確認を行った
- [ ] PRの説明だけで変更内容を理解できる

可能であれば、GitHub上のPRの `Files changed` も自分で一度確認してください。

---

## レビューしやすいPRにする

Reviewerが、

「何が変わったのか」

を短時間で理解できるPRを目指します。

### 変更理由を書く

PRには以下を記載します。

- なぜ変更したのか
- 何を変更したのか
- どのように確認したのか
- 特にレビューしてほしい箇所

コードをすべて読まないと目的が分からないPRにしないでください。

### 変更範囲を小さくする

1つのPRに大量の無関係な変更を入れないでください。

PRが大きくなりすぎた場合は、IssueやPRを分割できないか検討します。

### 不要な変更を入れない

例えば機能追加PRで以下のような変更を同時に行わないでください。

- 関係のない変数名変更
- 関係のないファイルの整形
- README修正
- 別機能のリファクタリング
- 別Issueのバグ修正

必要であれば別Issue・別PRに分けます。

---

## UI変更がある場合

UIを変更した場合は、可能な限りPRにスクリーンショットを添付してください。

Before / Afterがある場合は、両方載せます。

Reviewerがローカル環境を起動しなくても、変更内容を把握できる状態を目指します。

---

## 動作確認

PRには、

「確認しました」

だけではなく、

「何を、どのように確認したか」

を書きます。

例：

- Chromeでファイルアップロード成功を確認
- 未入力時にエラーが表示されることを確認
- 既存の一覧表示に影響がないことを確認

---

## Review

Reviewでは主に以下を確認します。

- Issueの目的を満たしているか
- 完了条件を満たしているか
- 想定外の変更が含まれていないか
- バグにつながる処理がないか
- コードの意図を理解できるか
- 責務の置き場所が不自然ではないか
- 不必要に複雑になっていないか
- セキュリティ上の問題がないか

Reviewは、

「書き方の好みを押し付ける場」

ではなく、

「変更を安全にmainへ入れられるか確認する場」

として扱います。

---

## Reviewの種類

### Comment

質問・提案・補足です。

必ずしも修正必須ではありません。

### Approve

問題なし。

Mergeしてよい状態です。

### Request changes

Merge前に修正が必要な状態です。

Request changesされた場合は、修正後に `Re-request review` を行います。

---

## Request changesされた場合

基本的な流れは以下です。

    In Review
    ↓
    Request changes
    ↓
    In Progress
    ↓
    修正
    ↓
    Commit
    ↓
    Push
    ↓
    Re-request review
    ↓
    In Review

---

## レビューコメントへの対応

レビューコメントに対応した場合は、必要に応じて返信します。

例：

- `修正しました。`
- `この理由から現状の実装を維持しています。`
- `確認したところ、こちらの実装に問題があったため修正しました。`

対応が完了したConversationはResolveします。

指摘の意味が分からない場合は、推測して修正せず質問してください。

---

## Review開始後の大きな変更

Review開始後に大規模な変更を追加すると、Reviewerが確認済みの内容と差分が大きく変わります。

そのため、Review開始後に以下の変更を追加しないでください。

- 大規模なリファクタリング
- 新しい機能追加
- PRの目的と関係のない変更

必要な場合はReviewerへ共有するか、別PRに分けます。

---

## Merge Conflict

Merge Conflictとは、複数のBranchで同じ箇所が変更され、Gitが自動でどちらの変更を採用すればよいか判断できない状態です。

Conflictが発生した場合は、まず以下で状態を確認します。

    git status

内容を理解せずに、

- Conflict markerを削除する
- 相手の変更を削除する
- とりあえず自分の変更だけ残す

といった対応をしないでください。

解決方法が分からない場合は、チーム内で相談してください。

---

## 作業中にmainが更新された場合

他のメンバーのPRが `main` へMergeされることがあります。

必要に応じて最新の `main` を自分のBranchへ取り込みます。

まず `main` を最新状態にします。

    git switch main
    git pull origin main

自分のBranchへ戻ります。

    git switch feat/12-example

最新の `main` を取り込みます。

    git merge main

Conflictが発生した場合は、内容を確認して解決してください。

---

## Force Push

理由なくForce Pushしないでください。

特に以下は原則として使用しません。

    git push --force

Force PushはGitの履歴を書き換えるため、他のメンバーの変更や作業に影響する可能性があります。

必要な場合はチーム内で確認してから行います。

---

## 秘密情報

以下の情報はCommitしないでください。

- APIキー
- アクセストークン
- パスワード
- DB接続情報
- 秘密鍵
- Webhook URL
- `.env` の実値

次のProductのSecret管理方式は未決定です。旧Doppler採択と当時の接続待ちは[履歴](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md#dopplerの引き継ぎ)に保管しています。Secretの実値は承認された安全な手段で管理し、リポジトリやIssue・PRへ載せません。

`.env` などは `.gitignore` でGitの管理対象から除外します。

GitHubのSecret ProtectionやPush Protectionも有効にしていますが、これらは最後の防御です。

秘密情報をCommitしてよいという意味ではありません。

誤って秘密情報を公開した場合は、Commitを削除するだけではなく、そのSecret自体を無効化・再発行してください。

---

## Merge

書き込み権限を持つ別メンバーのApproveが最低1件付き、Reviewが完了したらSquash Mergeします。2026-10-11からは、下記の[条件付きセルフマージ](#条件付きセルフマージ2026-10-11)も認めます。保護ルールのbypassは使用しません。

Merge前に以下を確認してください。

- [ ] 書き込み権限を持つ別メンバーのApproveが最低1件ある（セルフマージの場合は、下記の条件をすべて満たす）
- [ ] 未解決のレビューコメントがない
- [ ] Issueの完了条件を満たしている
- [ ] 必要な動作確認が完了している
- [ ] 関係のない変更が混ざっていない

導入済みCIが失敗している場合は原因を修正してからMergeします。
現在の`Foundation / Repository checks`は文書・設定の検証であり、アプリのテスト成功を意味しません。
アプリ実装後は採用したFormatter・Linter・テスト・buildを実行し、未実装のコマンドはCIへ追加しません。

### 条件付きセルフマージ（2026-10-11）

2026-10-11、Kaito-Iwaseの判断で、mainのrulesetから承認必須を外し、自分のPRを他のメンバーのApproveなしでSquash Mergeできるようにしました。チーム全員が体調不良でレビューが難しく、Code Freeze（10/12）の直前でレビュー待ちが作業の一番の詰まりになっていたためです。

セルフマージは、次の条件をすべて満たすときだけ行います。

- [ ] マージ前に敵対的セルフレビューをした。正常系だけでなく、通信失敗・連打・訂正・削除・日付の切り替わりなど、変更に関係する壊れ方まで確かめた
- [ ] 最新コミットのCIが成功し、競合がない
- [ ] PRに「確認した内容・結果・未確認事項」を書いた
- [ ] 仕様・API・データ保存・予測の意味に関わる変更は、理由と影響をPRで共有した
- [ ] 未解決の重大な問題が残っていない（残っている場合はマージせずに共有する）

レビュアーの指定とレビュー依頼は続けます。マージ後に付いたコメントは、通常のレビューコメントと同じように対応します。

比較した案：

| 案 | 判断 | 理由 |
| --- | --- | --- |
| 別メンバーのApproveを必須のままにする | 不採用 | レビューできるメンバーがいない期間は、Code Freezeまでにマージできない |
| 承認必須を残し、保護ルールをbypassしてマージする | 不採用 | 保護ルールのbypassはしない方針で、誰がどの条件でマージしたかも残らない |
| rulesetから承認必須を外し、上の条件を満たすときだけセルフマージする | 採用 | 保護ルールを迂回せずに進められ、確認内容と未確認事項がPRに残る |

再検討の条件：Code Freeze後、またはメンバーがレビューできる状態に戻ったときに、承認必須へ戻すかをチームで決めます。

## ドキュメントと技術判断

| 情報 | 正本・扱い |
| --- | --- |
| 議事録、ブレスト、発表原稿の下書き | Google Docs。議論中の内容を確定事項として扱わない |
| UI、Wireframe、操作の流れ | Figma / FigJam。共有URLと権限は管理者が確認してから案内する |
| 正式Product仕様・要件・Scope | [docs/product-spec.md](docs/product-spec.md)。何を作り、何を保証するか |
| 正式Architecture・技術構成・DB・Deployment | [docs/architecture.md](docs/architecture.md)。Product要件をどう実現するか |
| 新しいProduct・Architectureの重要判断 | 上記2文書内のDecision Log。ID・日付・状態・判断要約・詳細/Issueリンクを記録する。詳しい理由は領域別decision-logへ置く |
| Git管理できる構成図・Sequence図 | 必要な仕様文書内のMermaid。実装前に架空の図を作らない |

当時の採用方針・導入条件は[旧開発基盤ADR](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/decisions/0001-development-foundation.md)、項目ごとの導入・検証結果と外部変更の承認待ちは[旧基盤状態](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md)を参照してください。現在の未決定事項は[現行状態](docs/operations/development-foundation-status.md)に記録しています。
過去の基盤ADRは履歴として保持します。新しいProduct・Architecture判断のために正式ADRファイルを増やさず、2文書内のDecision Logから旧判断を参照し、変更理由と影響を記録します。Baselineの再検討は[Reconsideration Policy](docs/product-spec.md#reconsideration-policy)に従い、人間の決定前に正式反映しません。
リリース・提出前は[リリースとデモの手順](docs/operations/release-demo.md)を使います。

### 仕様文書の配置

仕様文書は「誰が、どの条件で操作すると、何が起こるか」を説明する正本です。コードの場所を並べるだけでは仕様の説明になりません。
2026-09-24の依頼者決定により、正式なProduct・Architecture設計のSingle Source of Truthは以下の2本だけに集約します。RECOMMENDED / CONDITIONAL / OPENをDECIDEDと混同せず、未実装の画面を実装済みとして説明しません。

| 内容 | 置き場所・分割単位 |
| --- | --- |
| 機能・操作・共通業務ルール・要件・Scope・評価 | `docs/product-spec.md`。Requirement ID、条件・状態・失敗時の保証と検証を記載する |
| 構成・責務・技術・DB・Deployment・Auth・Testing | `docs/architecture.md`。Product要件から実現方法またはOPENへ追跡できるようにする |
| 開発基盤・運用・リリース手順 | 既存の`docs/operations/`。日常の具体的な操作は[開発ガイド](docs/DEVELOPMENT_GUIDE.md)に置く |
| Product / Architecture Decision | 2文書内のDecision Log。別の正式requirements・scope・technology-stack・deployment文書やADR群を増やさない |
| 領域別の理由・実装支援 | 新Productの要件と領域が決まってから、必要なSupporting Docsを`docs/`に置く。[旧音楽案のFE/BE/ML文書](README.md#廃止した音楽案の履歴)は履歴として保管し、現行仕様にはしない |
| 調査資料・PoC・測定CSV/JSON・experiment README | `Supporting Artifact / Not a Source of Truth`と明記。正式Decisionは2文書へ反映し、補助資料だけに残さない |
| 過去の開発基盤の判断 | [旧開発基盤ADR](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/decisions/0001-development-foundation.md)を履歴として保持。正式Product・Architecture仕様の追加正本とはしない |
| ページ・機能・基盤の棚卸しと、仕様・コード・確認方法の対応 | [docs/change-map.md](docs/change-map.md)。動的URLはルートのパターン単位で扱う |

Figma / FigJamの図や画面表現から、条件・制約を説明するGit管理の仕様文書へ相互に参照できるようにします。外部資料の共有先が未確認ならURLを創作せず、同じ仕様の別正本を作りません。
詳しい記載項目と更新手順は[文書を書く手順](#文書を書く手順)を正本とします。[documentation-sync](.agents/skills/documentation-sync/SKILL.md)はAIがこの規則を実行する入口です。

### 変更に伴う文書更新

変更前に関連仕様と[対応表](docs/change-map.md)を確認し、実際のコード・参照元から影響範囲を調べます。
必要な仕様・手順・対応表・リンクの更新は変更と同じ作業内で行います。関連PRに分ける場合も対応先と依存関係を明記し、必要な更新が未完了のまま元の作業をDoneにしません。
文書中の説明・参照に影響がなければ、不要な文書変更を加えず、PRの検証欄に更新不要の理由を残します。
承認済み仕様と実装が違う場合は不一致として記録し、現在の動作を理由に仕様を無断で変更しません。

更新対象は説明への影響で決めます。

| 変更内容 | 更新する場所 |
| --- | --- |
| 現行の振る舞い・条件・契約・不変条件 | Product / Architectureの該当本文。重要判断が変わる場合は該当P/D番号と詳細の理由も更新する |
| コードの入口・責務・確認方法・説明先が変わる | change-mapの該当行・trace・参照。行番号だけに依存しない |
| 既存条件での追加実測・再検証・作業経緯 | 既存の検証資料またはIssue/PR。リポジトリ内で継続参照が必要ならIssue単位のSupporting履歴。結果を追加しただけでchange-map末尾に毎回追記しない |
| 共通の文書運用規則 | 本節と下記手順。AGENTS・README・Skill・PR templateには全文を複製せず参照を置く |

履歴への分離で古い現行説明を放置しない。Auth・API契約の変更など、正本・対応表の更新が必要な変更は同じPRで同期します。

### Decision Logを増やしすぎないためのルール

仕様本文は現在有効な内容へ更新し、経緯を追記し続けません。正本のDecision LogはID・日付・状態・判断要約・詳細/Issueリンクの索引にします。記録対象はProductの振る舞い・Scope・重要技術・責務・不変条件など、将来「なぜ選んだか」の説明が必要な判断です。文言修正、通常の実装、決定済み設計に沿う修正のたびにDecisionを追加しません。

比較理由・代替案・影響は対象領域のdecision-log.mdに一度だけ記載します。詳細にはContext、Requirements、Candidates、Evaluation Criteria、Why / Why Not Alternatives、Trade-offs / Consequences、Known Risks、Reconsider When、Evidence、Related Design Intentsを残し、正式な状態・結論は2正本を参照します。複数領域に関係する場合も主担当の文書へまとめ、他領域からリンクします。

判断を置換したら旧IDをSUPERSEDEDとして新IDへリンクします。一部だけ置換した場合は範囲を明記し、有効な部分まで失効扱いにしません。旧IDは再利用せず、過去の判断理由やEvidenceを削除しません。過去記録が読みづらくなった段階でSupporting Artifactの履歴資料へ移し、索引と参照元を更新します。通常の修正ごとにDecisionや判断履歴を増やす必要はありません。保存が必要な草稿・検証・移行記録は[履歴の配置と移動](#履歴の配置と移動)に従います。

作業経緯・細かな変更・実行結果はIssue/PRへ記録します。Closed Issueも権限と接続があればGitHub MCPで本文・コメントを参照できます。本文はissue_readのget、コメントはget_commentsで読み、一覧が分割される場合は全ページを確認します。現在の仕様や必須の不変条件をIssueだけに残さず、初見の人間/AIが2正本から理解できる状態を保ちます。外部参照できない場合は未確認を明示し、経緯を推測しません。

重要変更ではRequirement → Decision → Design Intent → Evidence → Code / Testsをたどり、影響するIDとリンクを更新します。

Design IntentにはContext、Intent、Design、Why、Invariants、Non-goals、Alternatives、Trade-offs、Failure Modes、Change Guidance / 再検討条件、Related Requirements / Decisions / Evidence、Code Map、Testsを残します。AIのprivate chain-of-thoughtではなくレビュー可能な設計理由を書きます。EvidenceはRESEARCH / PRODUCTION_RESEARCH / SPEC / LOCAL_POC / ENGINEERING / HYPOTHESISを区別し、出典・著者/組織・日付・参照箇所・実験条件、支持する主張/しない主張、限界、適用Decisionを記録します。研究の結論だけで採択を正当化せず、対象集団と実験条件を確認します。

### 履歴の配置と移動

保存が必要な草稿・検証結果・移行記録は`docs/changes/issue-<実在Issue番号>-<内容>.md`に置き、`Supporting Artifact / Not a Source of Truth`、対象Issue、基準SHA・日付、当時の状態、実施結果・未実施・理由、現行仕様への参照を明記します。同じIssueの記録は追記・更新し、訂正前の結果と訂正理由を残します。既存のoperations・experiment・領域別decision-logに適切な記録先があればそこを使い、全文を重複させません。

入口は[履歴フォルダ](docs/changes/)への固定リンクとファイル名です。ファイルごとの中央一覧やchange-map末尾への追記を必須にしません。2つのIssueが別々の履歴を追加するだけなら、互いのファイルや中央文書を編集せず共存できます。現行判断・契約を履歴だけに置くことはできません。

既存本文を移動する場合は、理由・代替案・却下理由・制約・Evidence・実施／未実施・参照を全文で保存します。元の実見出しとP/D番号・重複見出しの順序を保ち、そこから移動先へ案内します。HTMLの別名だけではFoundationの見出し検査を通りません。相対リンク（同一文書内の`#見出し`を含む）は元と同じ説明先へ付け替えます。

移動PRでは基準commitと原文範囲・移動先をIssue単位のmanifestに記録し、`pwsh -NoProfile -File scripts/check-doc-migration.ps1 -Manifest <manifestのパス>`で全文と旧見出しを確認します。続いて[Foundation](README.md#開発基盤のセットアップと確認)で相対リンク・見出し・文書形式を検査します。移動manifestはその移動時点の検証用で、将来の正本更新を古いSHAの本文へ固定する常設ゲートにはしません。

依頼者が廃止資料を現行作業ツリーから除外すると決めた場合は、tracked fileの通常削除commitと固定Git履歴で保存できます。対象treeの基準SHA・object ID・全fileの対応と内容保持・削除範囲・現行依存の確認をIssue単位に記録し、必要な入口を固定tree/blobへ更新します。raw・FAIL・採択理由を部分的に間引かず、Git履歴と未tracked資料を保全します。既存本文を別文書へ移す上記の全文検査とは分け、除外を未検証事項の解消や過去の成功への読み替えに使いません。

個々の比較実験を現行検証へ残すか固定履歴で保存するかの正本は、[実験履歴の比較実験の保存範囲](docs/prediction/experiment-history.md#比較実験の保存範囲)です。この文書には保存手順を置き、実験群の分類表を複製しません。

### AIへ渡すコンテキスト

[目的別の入口](docs/README.md#目的から読む)で対象の節を選び、必要な範囲を段階的に読みます。AGENTSの共通ルールを前提に、Productの要件 → Architectureの契約 → change-mapのコード・テスト → 必要な判断理由・Evidenceの順で確認します。全仕様・全履歴・全Skillを毎回入力する運用にはしません。対象の節に不変条件や共通契約への参照があれば、そこまで読みます。

着手・引継ぎ時には、次の内容を対象Issue/PRまたは作業メッセージに短くまとめます。新しい常設の仕様ファイルは作りません。

| 渡す情報 | 必要な内容 |
| --- | --- |
| 依頼と範囲 | Issue、完了条件、変更するもの・対象外、人間の判断待ち |
| 作業基準 | repo、branch、HEAD、未commit差分。結果の基準SHAが違えば明記 |
| 契約と理由 | 関係するR/P/D番号、本文の見出しリンク、守る条件。理由が未確認なら推測しない |
| 実装と確認 | 実ファイル・主要symbol・関連テスト、選んだ既存コマンド、実行済み／未実行と理由 |
| 次の一手 | 未解決の指摘、依存、更新すべき文書、次に検証すること |

要約には出典を残し、要約だけを根拠に採択・受入・外部設定を変更しません。別作業やコンテキスト圧縮後の再開時はHEAD・差分・Issue/PRの更新を確認します。新しい差分がある場合、影響する根拠を読み直します。

AIには、差分から文書更新候補を出す、仕様と実装の不一致を根拠付きで探す、履歴と現行の混同を指摘する作業を任せられます。文書を読んだだけでテストを実行済みにしたり、根拠のない設計理由を補ったりしません。独立レビューを依頼する場合は、対象Issue・比較元SHA・差分・正本・確認範囲を渡し、作者の説明を証拠として扱わずに検査します。指摘は再現または参照で確認してから採否を決めます。

入口の品質は、代表依頼から「仕様 → 実装 → テスト → 更新先」にたどれるかで確認します。リンク検査の成功だけでは、意味の一致や情報の探しやすさを保証しません。

### 文書を書く手順

人間とAIが共通で使う執筆・保守手順はここに集約します。Skillや別ガイドへ全文を複製しません。

<!-- documentation-procedure:start -->

#### 文書を書く前

1. 対象Issueの要件・承認済み決定と、関連仕様・対応表を読む。実装・設定・テスト・呼び出し元・参照元を検索し、表の記載だけで影響範囲を断定しない。
2. 影響を受ける範囲、実際に変更する範囲、確認のみの範囲を分ける。無関係な改善や設定変更を混ぜない。
3. 要件・承認済み仕様、コード上の動作、テストが検証する内容、実行済みの結果、候補・仮説・未定・過去記録を区別する。採用方針、ファイルの存在、外部設定、接続・動作確認も別に扱う。
4. 不一致は根拠と影響を記録する。実装があることを仕様承認の証拠にせず、決定が必要な項目は人間へ確認する。設計理由の根拠がなければ「理由は未確認」とする。

#### 機能の仕様を書くとき

機能単位で「どういう仕様で、どう動くか」を説明し、必要な関連コード・テストへつなぐ。ファイル一覧を仕様本文の代わりにしない。確認できる内容について、該当する項目を記載する。

| 観点 | 記載する内容 |
| --- | --- |
| 目的・利用条件 | 誰の何を解決するか、対象ユーザー、URLパターン、ログイン・権限等の前提 |
| 入力・表示 | 項目、初期値、必須・任意、入力チェック、表示内容と表示条件 |
| 操作・状態 | 操作順、画面遷移、何が取得・保存・更新・公開されるか、処理中・完了等の状態変化 |
| 例外・権限 | 読み込み中、データなし、入力不備、通信失敗、未ログイン、権限不足時の挙動。他ユーザーのデータを扱う際の制約 |
| 内部処理 | 実装の順に画面 → 呼び出す処理 → データ取得・更新先 → 結果表示を説明。実在するAPI・DB・外部連携のみ記載 |
| 根拠・確認方法 | 承認記録、実装パスと必要な関数・コンポーネント名、関連テスト、実行結果または未検証の範囲、制約・不一致 |

同じ機能の説明を初心者向けとAI向けに複製しない。専門用語は初出時に短い日本語の説明を添える。
共通ルールは一つの説明先にまとめて参照する。画面の分類・ラベル、内部状態、DB値、未入力・未設定・不明、処理失敗を混同しない。
外部API・AI・非同期・リアルタイム処理は、実装がある場合に限って失敗・再試行・同期と制約を説明する。コードだけで外部データの正確性、安全性、法的妥当性を保証しない。

アプリがなければ、存在する基盤・手順と未実装の理由を記載する。承認済み未実装の仕様は実装済みと分ける。空の機能文書や架空のURL・API・実行コマンドを作らず、内容が生まれた時点で配置ルールに沿って追加する。

#### 文書の手順・例を書くとき

- 前提、作業ディレクトリ、OS・シェル・コンテナ、各コマンドの意味、成功時の確認、失敗の原因 → 修正箇所 → 再確認を記載する。検証した環境だけを明示する。
- Docker・開発DB・テストDBは実在する場合のみ、役割・接続先の区別を説明する。本番接続とSecret不要の確認を分ける。
- コード例は小さくし、各行を説明する。実行可能な例か既存ファイルの抜粋かを明記する。独立実行可能とする例には必要な文脈を含め、ソース全体を複製しない。

#### 文書を変更するとき

- 表示・入力条件・状態・権限・API・データ構造・起動／テスト／運用方法が変わる場合は、影響する仕様と説明を同じ作業で更新する。古い説明への追記だけで済ませない。
- 追加・移動・改名・削除で参照が変わったら、目次・リンク・コード参照・対応表を更新する。動的URLはパターン単位とし、全ページ・主要機能に説明先または未対応理由を持たせる。
- 対応表には状態、説明先、調査の開始点、関連処理・API・DB、テスト・既存コマンド・手動確認を結び付ける。テストがなければ未整備とし、可能な手動確認だけ示す。変わりやすい行番号だけに依存しない。
- 決定が変わったら根拠に沿って候補・未定の記述を更新する。履歴文書では過去と現行を分け、過去の設計理由や検証結果を後から創作・置換しない。
- AGENTS.mdは作業ルール・コマンド・参照先に影響がある場合だけ更新し、変更履歴置き場にしない。仕様・説明・参照が変わらなければ文書更新不要の理由を報告する。

#### 文書更新を完了する前

変更した文書を実装・設定・関連テスト・承認済み仕様と照合し、目次、相互リンク、コード参照、未実装／未確認の表記を確認する。
既存チェックは定義・副作用を確認してから安全な範囲で実行し、実行した確認と未実行の確認を分けて報告する。チェック成功を仕様・アプリ動作の全面的な検証としない。
文書の入口や構成を整備した場合は、代表的な変更依頼から仕様・実装／設定・確認方法・更新対象文書へ実際にたどれるか確認する。
必要な文書更新が残っていれば完了扱いにしない。共通の完了条件は[CONTRIBUTING](CONTRIBUTING.md#definition-of-done)に従う。

#### 文書保守の原則

1. ドキュメントを書くこと自体を目的にしない。
2. 必要な情報だけを残す。
3. 同じ情報を複数ファイルへ重複して書かない。
4. 既存のSingle Source of Truthを優先して更新する。
5. コード変更によって既存ドキュメントが誤りになった場合は必ず修正する。
6. 正式仕様は `docs/product-spec.md` と `docs/architecture.md` に統合し、重要な判断は対応する文書内のDecision Logへ記録する。
7. 過去のADRは履歴として保持し、黙って書き換えない。新しい正式ADRファイルは増やさない。
8. 判断を変更する場合は人間の採択後にDecision Logへ旧判断・根拠・影響を記録する。補助成果物は `Supporting Artifact / Not a Source of Truth` と明示する。
9. 確定、候補、仮説、未定を混同しない。

#### 文書更新で報告する内容

- 更新が必要だったドキュメント
- 実際に更新したドキュメント
- 更新不要と判断したドキュメント
- 残っている不整合
- 実行した検証・結果と、未確認事項・実施できなかった理由
- 入口や構成を変えた場合の、変更依頼からの導線確認結果

<!-- documentation-procedure:end -->

---

## Definition of Done

個別の変更を扱う作業Issueは、以下を満たした状態をDoneとします。管理Issueの完了判定は[開発ガイド](docs/DEVELOPMENT_GUIDE.md#closeと製品完成を確認する)に従います。

- [ ] Issueの完了条件を満たしている
- [ ] 必要な動作確認が完了している
- [ ] 重要変更のCode / Tests / Product Requirement / Architecture / Decision / Design Intent / Evidenceへの影響を確認した（対象外なら理由を記録）
- [ ] 関連仕様・実装・テスト・文書の整合を確認し、必要な文書・対応表・参照の更新を完了した（不要なら理由をPRに記載した）
- [ ] 実施した検証と未確認事項・不一致・残課題を区別して記録した
- [ ] Pull Requestが作成されている
- [ ] Reviewが完了している
- [ ] 未解決のレビューコメントがない
- [ ] `main` へSquash Mergeされている
- [ ] IssueがCloseされている
- [ ] ProjectがDoneになっている

「実装が終わった」だけではDoneではありません。

---

## Merge後

Merge後は以下を確認します。

- PRがMergedになっている
- IssueがClosedになっている
- ProjectがDoneになっている
- 作業Branchが不要になっている

Merge済みの作業Branchは原則削除します。

次のIssueでは、最新の `main` から新しいBranchを作成してください。

---

## やってはいけないこと

- `main` へ直接pushする
- `main` 上で直接実装する
- `git add .` で内容を確認せず全変更をStageする
- 無関係な変更を1つのIssue・PRに混ぜる
- 完了条件が不明なまま実装を開始する
- Review前にMergeする
- Review指摘を無視する
- Merge済みBranchを使い回す
- 理由なくForce Pushする
- 秘密情報をCommitする
- 分からないGit操作を適当に実行する

---

## Gitで困ったとき

まず現在の状態を確認します。

    git status

現在のBranchを確認します。

    git branch

最近のCommitを確認します。

    git log --oneline

接続しているGitHub Repositoryを確認します。

    git remote -v

分からない状態で、

- `reset`
- `rebase`
- `force push`

などを実行しないでください。

必要であればチーム内で確認します。
