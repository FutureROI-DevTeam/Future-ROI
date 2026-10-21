# 開発運用ガイド

このドキュメントでは、このリポジトリで開発するときの基本的な進め方を説明します。

GitHub、Issue、Branch、Pull Requestなどを使った開発に慣れていない人でも、
「今何をしていて、次に何をすればいいのか」が分かることを目的としています。

詳細なルールだけ確認したい場合は、ルートにある
[CONTRIBUTING.md](../CONTRIBUTING.md)
を参照してください。

AIエージェントによるIssue・Projects・PRの操作はGitHub MCPを基本とし、接続できない場合はこのガイドのGitHub Web UI手順を使います。
人間が使う操作手段は強制しません。ローカルのBranch・Commit・Pushは`git`を使います。
Playwright CLI＋Skillとdocumentation-syncを含む採択方針・導入状況は
[AI開発ツールガイド](../AI_DEVELOPMENT_TOOLS.md#採択済みの運用方針)を参照してください。

機能の内容を知りたい場合は[仕様・実装・確認方法の対応表](change-map.md)から正式なProduct Spec・Architectureへ進んでください。現行mainのAPI・Engine・業務画面の実装と、製品受入・公開配置等の残条件は[現在地の読み方](change-map.md#現在地の読み方)を参照します。[保存から予測・表示を追うtrace](change-map.md#コードを読むための短いtrace)もあります。旧FE / BEの最小起動構成は[履歴](../README.md#廃止した音楽案の履歴)に保管しています。[初回セットアップ](#13-初回セットアップ)に文書・設定とアプリの確認方法があります。
本ガイドの検索機能や例示用のIssue番号・Branch名は操作を説明する例です。[Future ROIのIssue運用](#future-roiのissue運用)に記載するIssueは、GitHub上の実在する追跡先です。

---

# 1. 最初に覚える開発の流れ

このプロジェクトでは、基本的に次の流れで開発します。

```text
Issue
↓
Ready
↓
Branch作成
↓
In Progress
↓
実装
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
```

最初からすべてのGitコマンドやGitHub機能を覚える必要はありません。

まずは、

```text
Issue
↓
Branch
↓
実装
↓
Pull Request
↓
Review
↓
Merge
```

を理解してください。

---

# 2. このリポジトリで使うもの

主に以下を使用します。

| 用語            | 意味                                   |
| --------------- | -------------------------------------- |
| Issue           | やることを管理するチケット             |
| GitHub Projects | Issueの進捗を管理するKanban            |
| Branch          | mainに影響を与えず作業する場所         |
| Commit          | 変更内容をGitの履歴として保存したもの  |
| Push            | ローカルのCommitをGitHubへ送ること     |
| Pull Request    | Branchの変更をmainへ取り込むための申請 |
| Review          | 他のメンバーが変更内容を確認すること   |
| Merge           | Branchの変更をmainへ取り込むこと       |

---

# 3. main Branchについて

`main` は、レビュー済みの変更が統合されたBranchです。

このプロジェクトでは、main上で直接開発しません。

```text
main
↑
Pull Request
↑
作業Branch
```

という形で変更を取り込みます。

mainへの直接Pushは行いません。

---

# 4. Issueとは

Issueは、

「これから行う作業を記録するチケット」

です。

変更作業を始める前に、対応する既存Issueを確認し、なければIssueを作ります。
小さな修正や文書更新も対象です。作成承認やログインを待っている間は、変更を先行せず読み取り調査とIssue本文案の準備までに留めます。
詳細は[チケット作成の着手条件](../CONTRIBUTING.md#チケット作成を着手条件にする)を参照してください。

例えば、

- 新しい機能を追加する
- バグを修正する
- READMEを更新する
- 技術を調査する
- 開発環境を整備する

といった作業をIssueとして登録します。

---

# 5. Issueの種類

このリポジトリでは、4種類のIssue Templateを使用します。

実装は`.github/ISSUE_TEMPLATE/`のYAML Issue Formsです。背景・完了条件などの必須欄を入力します。
既存のFeature / Bug / Task / Investigationの区分とラベルを維持しています。

## Feature

新しい機能の追加や、既存機能の拡張に使用します。

例：

```text
[Feature] 検索機能を追加
```

## Bug

想定した動作になっていない不具合の修正に使用します。

例：

```text
[Bug] 保存ボタンを押しても保存されない
```

## Task

機能追加やバグ修正以外の開発作業に使用します。

例：

```text
[Task] READMEを更新
[Task] CIを構築
[Task] 開発環境を整備
```

## Investigation

技術・仕様・実現可能性などを調査するときに使用します。

例：

```text
[Investigation] SSEとWebSocketを比較
```

Investigationでは、

「何を調べるか」

だけではなく、

「何を判断するために調査するのか」

まで書きます。

---

# 6. Issueには何を書くのか

最低限、

- なぜ必要なのか
- 何をするのか
- どこまでできれば完了なのか

を明確にします。

特に重要なのが「完了条件」です。

悪い例：

```text
検索機能を作る
```

これだけでは、どこまで実装すれば終了なのか分かりません。

良い例：

```md
## 完了条件

- [ ] キーワードを入力できる
- [ ] 検索結果が表示される
- [ ] 検索結果が0件の場合の表示がある
```

---

## Future ROIのIssue運用

### 3階層と情報の参照先

Future ROIは、最上位 → 領域の子 → 実装Issueの3階層で追跡します。親子関係はGitHubのネイティブSub-issuesで確認し、本文にリンクがあるだけで登録済みとは判断しません。

| 階層 | 追跡先 | 役割 |
| --- | --- | --- |
| 最上位 | [#87](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/87) | 領域と横断ゲートを含めてMVP完成・公開・提出を確認する |
| 領域の子 | [FE #88](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/88)、[BE #89](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/89)、[Prediction #90](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/90) | 配下の実装Issueと領域の受け入れ条件を管理する |
| 実装Issue | 各領域のSub-issuesから既存Issueを開く | 個別の目的・依存・完了条件に沿って実装と検証を行う |

最上位・領域Issueは管理用です。Branch・PRは個別の変更を扱う作業Issueへ紐付け、管理Issueごとに実装PRを作る必要はありません。担当者はIssueのAssignees、現在のStatus・Scopeは[GitHub Projects](https://github.com/orgs/jogi-hack-2026-team/projects/1)を確認します。このガイドへ担当表・現在Status・実装Issueごとの依存一覧を複製しません。

### 管理IssueのStatus

最上位・領域の管理Issueは、Projectsの次のStatusで管理します。

| Status | 管理Issueでの扱い |
| --- | --- |
| `Backlog` | 管理範囲・配下のIssue・受け入れ条件・Assignee・Scopeがまだ整理されていない |
| `Ready` | 上記が整理され、配下の作業は未着手。配下の実装着手を許可する意味ではない |
| `In progress` | 配下の作業Issueが1件でも着手したら変更する。最上位も領域配下の着手に合わせて変更し、自身の完了条件を満たすまで維持する |
| `In review` | 管理Issue自体には使わない。配下のPRレビューは個別の作業Issueで追跡し、管理Issueは `In progress` を維持する |
| `Done` | [Close前の確認](#closeと製品完成を確認する)に従い、配下の完了と自身の受け入れ条件・結合確認を満たしてCloseしたことを確認する。最上位 #87 は横断ゲート #69・#84・#82・#83 も必要 |

管理Issueのために専用PRを作ったり、配下のStatusを一括変更したりしません。各実装IssueのHard依存・BLOCKED・着手条件は[着手前の確認](#着手前に読み直す)を維持します。原則1人1IssueとWIP上限は個別の作業Issueで数え、同じ作業を最上位・領域の管理Issueで重ねて数えません。

配下や自身の受け入れ条件が再び未達になったら、領域・最上位の完了判定も見直し、必要な管理Issueを再オープンします。追加対応が着手済みなら `In progress`、未着手なら管理準備に応じて `Ready` または `Backlog` に戻し、理由と残る条件をIssueへ記録します。

### 着手前に読み直す

領域IssueのReadyは管理用であり、配下の実装開始を許可する意味ではありません。最上位がReadyでも同様です。各実装Issueの着手可否を個別に確認します。

1. 対象の最新Issue本文・コメント、親・領域Issue、依存先を読み、目的・Scope・完了条件・AssigneeとProjectのStatusを確認します。既存の実装Issueを再利用し、同じ作業を別の領域名や別エージェント用に重複起票しません。
2. Issueの開発情報・Development欄から関連PRを開き、最新の差分・レビュー・未解決指摘・CI・Merge状況を確認します。作業中のPRがあれば、既存作業との重複を避けます。
3. 正式仕様の[Product Spec](product-spec.md)・[Architecture](architecture.md)と[変更対応表](change-map.md)を読み、対象Requirement・Decision・実装・テストを照合します。仕様反映は[#69](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/69)とその関連PR、技術採択は[#84](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/84)の最新記録まで確認します。未Mergeの仕様案、技術候補、Supporting Artifactの検証成功・Approve・Mergeを正式採択や本実装完了へ昇格させません。
4. 各IssueのHard依存（着手の前提）とIntegration依存（結合・完了までに確認する条件）、本文・ラベルのBLOCKED、人間の判断待ち、必要な技術の採択・正式反映を確認します。Hard依存はClose表示だけでなく完了条件と必要なMergeの証拠を確認します。領域図の要約だけで依存を決めず、各実装Issueの記載を読みます。
5. 対象の[Definition of Ready](../CONTRIBUTING.md#definition-of-ready)を満たしてから専用Branchで着手します。例外として先行できる作業は、対象Issueに明記された承認済みの範囲だけです。モックやスタブで進められることをHard依存・BLOCKEDの解除と解釈しません。

既存Issueや正式仕様に不一致・不足があれば、根拠と必要な判断をIssueへ記録してチームに確認します。仕様・依存関係・Scopeを無断で書き換えたり、BLOCKEDを解除したりしません。読めない情報は未確認として扱い、着手条件を推測で満たしたことにしません。別作業が必要な場合も既存Issueを検索してから、[チケット作成の着手条件](../CONTRIBUTING.md#チケット作成を着手条件にする)に従います。

### Closeと製品完成を確認する

Close前に、そのIssueの全完了条件、必要なテスト・結合確認、レビューと未解決指摘、必要なmainへのMergeを証拠で確認します。実行済み・未検証・残課題をIssue/PRに記録し、[Definition of Done](../CONTRIBUTING.md#definition-of-done)と照合します。実装コード、PR作成、CI成功、検証用PRのMergeのいずれか一つだけでCloseしません。

実装Issueを全て解決するPRには`Closes #<実装Issue番号>`、一部対応・Supporting Artifact・管理Issueの参照には`Refs #<Issue番号>`を使います。自動Closeを指定する前にも、そのPRで残る完了条件がないことを確認します。管理Issueは配下の完了だけでなく自身の受け入れ条件・結合確認まで満たしてからCloseします。進捗バーを進めるためだけに子・実装IssueをCloseしません。

最上位 #87 の進捗バーは、**直接の子 #88〜90 の3件のうち完了した件数**です。孫の実装Issueの完了数や製品全体の完成率ではありません。3件が完了しても、次の独立した横断ゲートを全て満たすまで製品完成としません。

- [#69](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/69)：正式仕様のレビューとmain反映
- [#84](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/84)：チームの技術採択と正式仕様・関連Issueへの反映
- [#82](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/82)：再現可能なデモデータ
- [#83](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/83)：公開環境・E2E・デモ・提出の確認

横断ゲートを #87 の直接の子へ追加して進捗の分母を変えません。最上位のCloseは、領域・横断ゲート・未完了Must・重大な未解決レビュー・Freeze条件を #87 の最新完了条件と照合して判断します。公開URL・動作したSHA・CI/E2E・制約・提出記録は #83 から確認します。

---

# 7. Assignee

Assigneeは、

「そのIssueを担当する人」

です。

作業を始める本人が、着手前に自分をAssigneeとして設定します。

1. Issue作成画面の `Select assignees` を開きます。
2. 自分のGitHubアカウントを選択します。
3. 作成済みのIssueでは、右側の `Assignees` の編集、または `Assign yourself` で設定します。

Issueを作った人ではなく、実際に作業する人を設定してください。担当が変わったらAssigneeも更新します。
運用ルールの正本は [CONTRIBUTINGのAssignee](../CONTRIBUTING.md#assignee) を参照してください。

担当者が決まっていないIssueを誰かが勝手に実装し始めることは避けます。

---

# 8. Scope

GitHub Projectsでは、IssueにScopeを設定します。

このプロジェクトでは、

| Scope  | 意味                               |
| ------ | ---------------------------------- |
| Must   | コードフリーズまでに必ず完成させる |
| Should | Must完成後に取り組む               |
| Could  | 余力がある場合のみ取り組む         |

Mustの完成度を犠牲にしてShouldやCouldを実装しません。

---

# 9. Label

LabelはIssueやPRの性質を補足するために使用します。

主に以下を使用します。

| Label              | 用途                             |
| ------------------ | -------------------------------- |
| `feature`          | 新機能・機能拡張                 |
| `bug`              | 不具合                           |
| `refactor`         | 挙動を変えない内部改善           |
| `docs`             | ドキュメント                     |
| `chore`            | 開発環境・設定・依存関係など     |
| `investigation`    | 技術・仕様などの調査             |
| `blocked`          | 他の作業や判断待ちで進められない |
| `needs-discussion` | チーム内で相談が必要             |

---

# 10. GitHub ProjectsのStatus

以下の着手・PR・Mergeの遷移は個別の作業Issueに適用します。最上位・領域の管理Issueは[管理IssueのStatus](#管理issueのstatus)に従ってください。

GitHub ProjectsではIssueを管理し、PRはIssueの開発情報・Development欄から追跡します。

```text
Backlog
↓
Ready
↓
In Progress
↓
In Review
↓
Done
```

## Backlog

まだ着手できる状態になっていないIssueです。

例えば、

- 仕様が決まっていない
- やるか判断していない
- 調査が必要
- Scopeが決まっていない

場合です。

## Ready

個別の作業Issueが着手条件を満たした状態です。最上位・領域の管理Issueについては[Future ROIのIssue運用](#future-roiのissue運用)を確認してください。

## In Progress

現在作業中です。

## In Review

Pull Requestを作成し、レビューを待っている状態です。

## Done

Pull RequestがmainへMergeされ、作業が完了した状態です。

コードを書き終わっただけではDoneではありません。

---

# 11. Definition of Ready

個別の作業Issueを`Ready`にするには、最低限以下を満たしている必要があります。管理Issueの扱いと実装前の再確認は[Future ROIのIssue運用](#future-roiのissue運用)に従います。

- [ ] 目的・背景が分かる
- [ ] やることが分かる
- [ ] 完了条件が分かる
- [ ] Scopeが設定されている
- [ ] Assigneeが決まっている
- [ ] 大きすぎるIssueになっていない
- [ ] 必要な前提作業が完了している

条件を満たしていないIssueは、原則として実装を開始しません。

---

# 12. Issueの粒度

個別の変更を扱う作業Issueでは原則として、

```text
1 Issue
=
1 Branch
=
1 Pull Request
```

とします。

例えば、

```text
検索機能追加
README更新
ログインバグ修正
```

の3つを1つのIssueやBranchにまとめないようにします。

変更を小さくすることで、

- レビューしやすい
- 問題の原因を特定しやすい
- 変更を戻しやすい

というメリットがあります。

---

# 13. 初回セットアップ

基本構成は[Architecture D-23](architecture.md#d-23)にFE側の依頼者報告とBE本人の了承記録に基づく採用として記録しています。版・追加ツールと認証／公開先の残条件は[合意範囲](architecture.md#2026-10-03の技術構成合意)に記録しています。起動基盤は#70、DB migrationは#74、認証は#75、Goal APIは#76、記録・Today APIとEngine結合は#77で導入済みです。手順は[アプリを起動・検証する](#アプリを起動検証する)に記載します。Goal・記録・Today画面と公開配置は未完了です。旧構成は[履歴](../README.md#廃止した音楽案の履歴)に保持。PowerShell 7は文書・設定チェックに使用します。
GitとPowerShell 7を使える端末で操作します。以下のcloneだけはリポジトリを置きたい親ディレクトリ、それ以降はcloneしたリポジトリのルートで実行します。

初めてこのRepositoryで作業する場合、RepositoryをローカルへCloneします。

```bash
git clone https://github.com/jogi-hack-2026-team/jogi-hack-2026.git
```

Repositoryへ移動します。

```bash
cd jogi-hack-2026
```

接続先を確認します。

```bash
git remote -v
```

現在の状態を確認します。

```bash
git status
```

GitとPowerShell 7が必要です。現行の文書・設定チェックにアプリRuntime、DB、Secretは不要です。miseを使う場合は[公式の導入手順](https://mise.jdx.dev/getting-started.html)を確認し、`mise.toml`と`scripts/`を読んでから信頼操作を行います。

```sh
mise trust
mise run --skip-tools check
mise run --skip-tools hooks:install
```

miseがない場合は、リポジトリのルートで`pwsh -NoProfile -File scripts/check-foundation.ps1`を実行します。Hook導入はローカルの`core.hooksPath`を変更するため、既存Hookを確認してから行います。

旧Web/API・Compose・Node/npmの起動手順は[履歴内の開発ガイド](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/DEVELOPMENT_GUIDE.md#13-初回セットアップ)に保管しています。現行の起動・検証手順は次節を参照してください。

## アプリを起動・検証する

#70で導入した起動構成です。[Architecture D-23](architecture.md#d-23)の基本構成に、Node 24.22.1（[mise.toml](../mise.toml)・[package.json](../package.json)の`engines`・[Dockerfile](../Dockerfile)で同じ版）を固定しています。APIは`GET /api/health`（DB接続確認を含む）、認証（#75）、Goal API（#76。[実装案](architecture.md#2026-10-06のgoal-api76)）、記録とToday API（#77。[実装案](architecture.md#2026-10-06の記録today-api77)。`/today`が純粋Engineを呼びます）まで、Webは起動確認と登録・ログイン画面までです。Goal・記録・Todayの画面は未実装です。

| 構成 | 場所 | 役割 |
| --- | --- | --- |
| root | `package.json`、`package-lock.json`、`mise.toml` | npm workspacesの入口。`npm ci`・`npm run typecheck`・`npm test`・`npm run build`を3つのworkspaceへ配る |
| API | `apps/api/` | Fastify＋TypeBox＋`pg`。`src/server.ts`が起動点、`src/app.ts`がroute・エラー形式・SPA配信、`src/contracts/`がWebと共有する契約 |
| Web | `apps/web/` | React＋Vite＋TanStack Router／Query。`vite build`の出力をAPIが同一originで配信する。開発中は`/api`をAPIへ転送する |
| Engine | `packages/prediction/` | 純粋計算をAPIの`/today`から呼ぶ。rootのtypecheck/test/dev:apiは先にEngineをbuildし、Dockerにもビルド済みdistを含める |
| DB | `compose.yaml` | ローカル開発用PostgreSQL 18（`db`）。既定でDB＋単一SPA/APIコンテナ、`up -d db`ならDBだけ |
| コンテナ | `Dockerfile`、`.dockerignore`、`apps/api/src/container-start.ts` | DB health後、起動設定検査→認証・アプリmigration→API/SPA配信。`scripts/smoke-compose.sh`でCIと同じ検証 |

### Dockerで一式を起動する

リポジトリのルートで、Docker EngineとCompose v2以降を使います（Docker DesktopではLinux containers）。この経路にhostのNode・npm・miseは不要です。初回だけ`.env.example`を`.env`へコピーします（sh/Git Bashは`cp .env.example .env`、PowerShellは`Copy-Item .env.example .env`）。すでにある`.env`は上書きせず不足項目を追加してください。

`.env`をローカルで編集して`LOCAL_DB_PASSWORD`と32文字以上の`BETTER_AUTH_SECRET`へ、それぞれローカル専用の値を設定します。本番の値を使わず、Issue・PR・チャットへ貼らないでください。既存DBを使う場合は現在のpasswordを維持します。Secretも再起動のたびに変更しません。記号や`$`を含む値はComposeの補間を避けるため`.env`では単一引用符で囲みます。ComposeはDB passwordをURIへ埋め込まず`PGPASSWORD`で渡します。`DATABASE_URL`・`BETTER_AUTH_URL`・`BETTER_AUTH_ALLOW_HTTP`はCompose側が設定するため、この経路の`.env`では空のままで構いません。

```sh
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8080/api/health
```

DBがhealthyになった後、app内のmigration専用poolで認証→アプリのschemaを適用し、完了後に同じNode processで配信を始めます。`up -d`は配信準備完了を待たないため、待つ場合は`docker compose up -d --build --wait --wait-timeout 120`を使います。`ps`でapp/dbがhealthy、healthが`{"status":"ok","database":"ok"}`になれば、ブラウザで`http://127.0.0.1:8080`を開き登録・ログインできます。healthはDB到達確認で、未統合の業務機能の完成判定ではありません。DBは`127.0.0.1:55432`です。portが競合する場合だけ`.env`の`LOCAL_APP_PORT`・`LOCAL_DB_PORT`を変更し、app URLのportも合わせます。公開portはloopbackだけで、HTTP許可はこのローカルComposeに限定します。

```sh
docker compose restart app
docker compose down
docker compose up -d --build --wait --wait-timeout 120
```

`restart app`は現在のimageでmigrationを再確認します。コード変更後は`up -d --build`でimageを再作成します。すでに稼働中の同じimageへの`up`はappを再起動しません。migrationは適用履歴・checksumとadvisory lockを使い、反復時にschemaやデータを作り直しません。ComposeのinitがSIGTERMをNodeへ転送し、migration待機中はexit 143で中断してDB接続を切ります。API稼働後は処理中要求→app/auth poolの順に閉じ、正常時exit 0。Composeの停止猶予は15秒、APIの期限は10秒です。`down`はcontainer/networkを停止・削除し、`postgres_data`は保持するため、再upでもデータが残ります。データを持つ環境で`down -v`やvolume削除を実行しないでください。

設定不足またはmigration失敗は`startup: configuration failed`／`startup: migration failed`としてappがexit 1になり、配信を開始しません。括弧内の原因分類は`invalid_configuration`（設定）、`checksum_mismatch`（履歴不一致）、`db_connection`（接続）、`db_authentication`（DB認証）、`db_permission`（DB権限）、それ以外は`unknown`です。`docker compose logs app`で段階・分類を確認し、設定、DBの接続・権限、適用済みSQLと履歴を照合してから同じ`up`を再実行します。分類は既知のcodeとアプリ自身のchecksum例外だけから作り、例外のname・原文・接続文字列は出しません。適用済みSQLは書き換えず、新しい番号のmigrationで修正します。既存の部分schemaは自動削除しません。DDL/lock待ちに自動期限はないため、長く待つ場合は他のmigrationやDBを確認し、必要ならappだけ停止します。起動中の中断では未commitのtransactionとlockはDB切断で解放され、commit済み変更は保持されます。

DBだけを再起動した際はappが一時的に503になることがあります。復旧後のhealthを確認し、必要なら`docker compose restart app`で再接続します。Docker daemonの再起動後も自動起動を前提にせず`up`で起動順を通してください。既存volumeのpasswordは`LOCAL_DB_PASSWORD`の変更だけでは変更されないため、不一致時は元の値を確認し、volume削除で解消しないでください。Project名`future-roi-local`と既存volumeの保存先は維持しています。他のcheckoutと同時に動かす検証は、別project名・別port・独立DBを使います。

### Dockerとhost開発の使い分け

Docker一式はビルド済みSPA/APIとDB、起動順・認証Cookie・migration・終了処理をまとめて確認する経路です。ソースをbind mountしないため、変更反映には再buildが必要です。日常の編集では次のhost起動を使い、Viteの画面更新とNodeのwatchで変更を早く確認します。Compose appとhost開発は別port・別認証originを使うため、同じ開発DBを使う場合も同時migrationを意図なく走らせないでください。

miseはhostのNode 24.22.1を固定し、`install`・`typecheck`・`test`・`build`・`dev:*`で既存npmコマンドを呼ぶ道具です。DockerはOS・Runtime・依存・配信とDBの実行環境を再現します。DockerfileとCIはmiseを呼ばず、imageとsetup-nodeで同じNodeを固定し、lockfileからnpm ciします。

### 準備

Node 24.22.1を使います。miseなら`mise install`で導入でき、`mise run install`等のタスクも使えます。DockerはローカルでPostgreSQL・コンテナを起動する場合だけ必要です。

```sh
npm ci
cp .env.example .env
```

`.env`には`DATABASE_URL`と、Composeを使う場合は`LOCAL_DB_PASSWORD`を入れます（Git除外。実値をIssue・PR・チャットへ書かない）。項目の意味は[.env.example](../.env.example)に書いています。認証の`BETTER_AUTH_SECRET`は開発環境では未設定でよく、初回起動時に`apps/api/.local/auth-secret`（Git除外）へ自動生成します。`BETTER_AUTH_URL`も開発環境では`http://127.0.0.1:<PORT>`が既定で、Viteの`http://127.0.0.1:5173`からの要求も許可します。

### 起動

```sh
docker compose up -d db
npm run db:migrate
npm run dev:api
npm run dev:web
```

`dev:api`と`typecheck`・`test`は、先にEngine package（`packages/prediction`）を`npm run build:prediction`でビルドします（APIは`@futureroi/prediction`のビルド済み`dist`を読むため）。`db:migrate`は`.env`の`DATABASE_URL`へ、認証テーブル（固定版Better Authの`getMigrations`）→ アプリのSQL（`apps/api/migrations/`）の順に適用し、結果をJSONで1行出します。2回目以降は差分がなければ何もしません（`rateLimit.lastRequest`の型警告は既知で差分は作られません）。`db:migrate:auth`・`db:migrate:app`で片方だけも実行できます。`db:seed:demo`は[Demo Seed／reset](operations/demo-seed.md)です。認証作成済みuserIdとtimezoneを明示し、専用2Goalだけを作成・新IDで置換します。Compose起動時の自動投入はありません。`dev:api`は`.env`を読んでAPIを`http://127.0.0.1:3000`で起動し、ファイル変更で再起動します（TypeScriptをNodeが直接実行）。`dev:web`はViteを`http://127.0.0.1:5173`で起動し、`/api`をAPIへ転送します。ブラウザで`/`を開くと「API: 接続できています」、`/health`で状態の内訳が出ます。`GET /api/health`はDBへ到達できれば`{"status":"ok","database":"ok"}`、できなければ503で`database: unreachable`を返します。

認証DDL（table・column・field index）は固定版の生成SQLを1 transactionで適用します。途中失敗はrollbackされ、同じコマンドで再実行できます。アプリSQLは従来どおり1ファイル1 transactionです。migration専用poolは接続確立を5秒で制限しますが、advisory lock待ち・DDLの実行期限は設けません。長時間待機は別のmigration実行を確認してからoperatorが中止します。HTTP用のapp・auth poolは応答／文実行を5秒で制限し、auth poolのidle切断は単独listenerで処理します。

migrationはHTTP listenerを開く前に専用poolで実行します。host開発は専用CLI、Dockerは`container-start.ts`が起動時に実行してからserverを読み込みます。同一processで稼働中のBetter Auth schema cache更新や、古い部分適用schemaの自動修復は保証しません。既存schemaが不完全なら削除せず、field index等を確認して明示的な修復をレビューしてください。session単位のadvisory lockを使うため、transaction pooling経由では実行しません（Neon等の採用時の接続先選択はD-25の残条件です）。

公開前やmigration後に、接続先DBが対象checkoutと整合しているかは`npm run db:check`（[schema-check-cli.ts](../apps/api/src/db/schema-check-cli.ts)、コンテナ内は`node apps/api/dist/db/schema-check-cli.js`）で確認します。`DATABASE_URL`だけを接続先として使い、DBを変更せず（DDL・DML・migration適用・`schema_migrations`作成なし。全接続を`default_transaction_read_only`にする）、runnerと共有するSQL選択規則・SHA-256で`apps/api/migrations`の全文ファイル名を`schema_migrations`と照合します。固定版Better Authの差分計画に加え、現行認証設定のtable・column（暗黙の`id`を含む）の存在をcatalogで確認します。別directoryを照合する場合は`npm run db:check -- <migrationsDir>`で指定し、空・存在しない・読めないdirectoryは設定エラーにします。

結果はJSON 1行で、`status`が`ok`（exit 0）／`drift`（exit 1。未適用・checksum不一致・checkoutにない履歴・認証table／column欠落・空DB）／`unavailable`（exit 3。接続失敗・認証失敗・timeout）、使い方・設定の誤りはexit 2です。接続・query・文の上限は各既定5秒で`SCHEMA_CHECK_QUERY_TIMEOUT_MS`、DB検査の上限は既定30秒で`SCHEMA_CHECK_TIMEOUT_MS`を指定できます（各1000〜600000の整数ms）。接続の終了処理はquery上限を限度に別途待ちます。出力はwriteの完了callbackを待ち、writeが戻ってイベントループが進む経路ではcallback待ちにもquery上限を適用して、callbackの失敗・待機超過をexit 3にします。休止後の復帰等で上限を超えた場合も成功ではなく判定不能です。必要なら実行者が有限の予算を明示して再実行し、常時pingで復帰待ちを隠しません。公開候補Neonでの実測は未実施です。

出力の限界: [Node 24.21.0の公式I/O仕様](https://github.com/nodejs/node/blob/v24.21.0/doc/api/process.md#a-note-on-process-io)では、Windowsのpipe/socketやファイル等への同期writeはイベントループを止め得ます。受信側が読まない実pipeでwrite自体が停止すると同じイベントループのtimerも動かないため、CLI単体ではすべての出力先・OSの強制終了時間を保証しません。回帰のcallback停止fixtureはwriteを即returnする差替えで、この同期write停止の証明ではありません。出力を継続して読む先へ渡し、OSの同期I/Oを含む全体deadlineが必要なら外側のprocess監督に期限・終了判定を設けます。完全なJSONが得られない場合は成功と扱いません。全platformでの外部強制終了を公開前受入に含めるかは#179の残判断です。

`findings`の`code`と`target`で原因を読み、checkoutにない履歴は互換性未確認として成功にしません。`auth_unsafe_change`の`target`は固定版ライブラリの説明文で版に依存するため、機械判定は`code`を使います。限界として、接続roleの権限自体は制限せず、認証columnの型・PK・field単位のindex欠落や業務table全体のdrift、業務E2Eの成功は保証しません。

### 検証

確認する範囲と結果を分け、対象HEAD・実行環境・fail/skip/未実行をIssue/PRへ記録します。内部整理の責務は[Architecture](architecture.md#責務と配置を変えるとき)が正本です。

responsive詳細の実Chrome回帰では、起動開始から最初のCDP応答までを一つの有限予算で待ちます。10秒診断・30秒失敗・終了確認の保証と限界は[ArchitectureのTest Strategy](architecture.md#test-strategy)を参照してください。`node --test apps/web/tests/browser-startup.test.mjs`はChromeなしで遅延・停止I/O・異常終了を検査します。実Chromeの既存9シナリオは`npm run test:browser --workspace=@futureroi/web`で他のbrowser回帰と逐次実行され、Application CIの`npm test`にも含まれます。診断の`ready`だけでUIシナリオの完走とは扱わず、subtest結果まで確認します。

| 検証層 | 何を確認し、何を保証しないか |
| --- | --- |
| Engine | 固定例・独立オラクル・凍結fixture・型契約。`tests`配下の`*.test.mjs`を再帰収集し、境界監査も入れ子のTSを確認。DB/HTTP/UIの成功は保証しない |
| API | 実Fastifyへの`inject`と専用PostgreSQLで契約・transaction・競合を確認。実TCP/ブラウザの確認とは別。[helperの新規caller](../apps/api/tests/helpers/stack.ts)は、表示済みDTOのkey/revision/DONE量を補う`callWithDisplayedGoal`、要求を補わない`sendExact`を選ぶ。既存`call`/`rawCall`は互換入口。欠落・stale CAS・再送の負例は`sendExact`を使い、暗黙GETで時計やsnapshotを変えない |
| Web一般 | 純粋module、外部JSON検査、SSR等。session確認は製品moduleを直接importし、依存境界だけをテストtransportへ替える |
| Webブラウザ | 実React/Router/SDKと合成transportによる所有者・再確認・draft/attemptの回帰。実認証API/DBのE2Eではない。下記の別コマンドでローカルのbrowser未実行を補う |
| 実環境 | 専用アカウント・合成Goal・専用API/DBで操作し、通信・保存と再取得・画面を対応付ける。ユーザーのDB/sessionに故障を注入しない |

API helperは獲得後すぐ終了処理を登録し、途中の初期化失敗や一資源の終了失敗でも残りを片付けます。[lifecycle回帰](../apps/api/tests/helper-lifecycle.test.ts)は実DBと子fixtureを使います。失敗したCREATEの成功を推測して未所有DBを削除せず、元の失敗と終了失敗を残します。

CIのcommand・層別集計・安全な失敗artifactは[診断手順](../.github/scripts/README.md)を参照します。checkoutの合成merge SHAとPR source HEADを区別し、欠落/不明/0件/skipを成功へ置換しません。required check名・settings・閾値はこの整理で変更しません。速度比較は同条件の実測がある場合だけ行います。

```sh
npm run typecheck
npm test
npm run build
npm run verify:ci-reports
npm run verify:foundation
```

`npm test`は[Webの共通エラー回帰](../apps/web/tests/client.test.mjs)、APIテスト（`node:test`。`DATABASE_URL`があればそのPostgreSQLへ、なければ`embedded-postgres`で`apps/api/.local/`にローカルクラスタを起動し、テスト専用databaseを作成・削除）と[Engineの数値・候補回帰](../packages/prediction/README.md#検証ci)を実行します。`npm run build`は`apps/web/dist`（SPA）と`apps/api/dist`（JS）を作ります。

`verify:ci-reports`は既存のCI集計・失敗判定・保存allowlistを検査し、`verify:foundation`はPowerShell 7で文書・設定・差分の空白を検査します。アプリのテストやブラウザを代行せず、各検査の失敗をそのまま返す入口です。予測入力の行変換は[純粋回帰](../apps/api/tests/prediction-snapshot.test.ts)、Goal入力の復元は[復旧境界回帰](../apps/web/tests/form-recovery.test.mjs)から追い、実DBのclock／CASや実DOMのowner・訪問回帰と併せて確認します。

Webの[所有者境界の実hook回帰](../apps/web/tests/session-cache.browser-check.mjs)は`npm run test:browser --workspace=@futureroi/web`で実行します。既存Viteでテスト用bundleを作り、Chrome／Edge／Chromiumの専用一時profileで実DOMを確認します。Windows・macOSの一般的なインストール先とLinuxの`/usr/bin/`を探索します。別の場所なら`TEST_BROWSER`に実行ファイルの絶対pathを指定してください。GitHub Actionsの既存`npm test`から[CI入口](../apps/web/tests/session-browser-ci.test.mjs)で自動実行し、`ubuntu-latest`にあるChromeを使います。ブラウザがない場合は未実行の成功にせず失敗を報告します。ローカルの`npm test`はブラウザ回帰を明示的なskipとして報告し、Docker buildにもブラウザを要求しません。所有者切替の合成session回帰と、固定版Better Authの実client・合成HTTPによるfocus確認中／失敗／回復、空sessionの再取得ループ抑止を含みます。[ルート確認回帰](../apps/web/tests/session-confirm.test.mjs)も通常testで実行し、hookと共有する確認の置換・並行呼出し・429を検証します。[正常同一ownerのdraft回帰](../apps/web/tests/session-draft.browser.tsx)は実router・実SDK・合成HTTPで15操作と、短い中間owner／error・保存中・編集revisionの安全境界を検査します。[Todayの再確認回帰](../apps/web/tests/session-today.browser.tsx)は、同じ人の確認中に量の入力を保つこと、確認中の保存を確定後に1回だけ送ること、別の人・失敗では送らず画面を捨てることを検査します。実認証・API／DBのE2Eとは区別します。

sessionの再確認中は私的な画面・入力をDOMから除き、query cacheも消します。再確認が通信の失敗やAPIの5xxで終わった場合は、各画面は読み込み中のままにし、ログイン後の外枠（AppShell）が「接続できませんでした」と再読み込みのボタンを1か所で出します。再読み込みはsessionの再取得からやり直し、未ログインと取り違えてログイン画面へは送りません（#279）。ただしTodayは、表示していた人と同じsessionの正常な再確認の間は画面を作り直さず、入力中の量を保ちます。確認中に届いた応答は使わず、その間に押した保存は「保存中」として預かり、同じ人と確定してから1回だけ送ります（[D-30](architecture.md#d-30-todayの同一owner再確認で入力を保つ190)）。失敗・logout・別owner・認証変更通知を挟まない正常な同一owner確認だけ、画面内のメモリから未送信入力と履歴の選択月を復帰します。別route／Goalへの離脱で持ち越しません。編集の最新値・revision・記録の有無が変わった場合は復元せず、最新Goalを表示した理由を知らせます。保存・削除・回復中の状態や結果不明の作成attemptは、このdraftとは別に扱います。確定した保存成功だけは送信時owner/連続性世代/ページの訪問トークンに束縛して親へ伝え、正常同一owner確認後に一覧へ一度だけ移します。異なるpathへの遷移開始で旧訪問を失効させ、Goal1→Goal2→Goal1でも旧成功を戻った画面へ作用させません。同path/searchの再確認は訪問を保ちます。owner変更・失敗・実ページ離脱では旧成功を新画面へ作用させません。契約検査の422 VALIDATION_ERRORは、訂正開始時だけ未送信draftへ戻します。訂正前・通信結果不明・500・409・削除失敗は通常snapshot復帰の対象外です。可視状態へ戻るイベントとonlineが自動再確認を起こします（同じ自動経路の5秒抑制あり）。window focusだけでは起こらず、同pathへのroute確認にはこの抑制がありません。route確認ごとに共有Goal cacheをresetし、inactive queryも次のmountで取り直すため、画面遷移の通信量・体感遅延には影響します。公開先での性能とチーム受入は未承認で、実ユーザーでの頻度・UX受入も別途残ります。詳しい境界は[Architectureの認証実装](architecture.md#2026-10-06の認証実装75)を参照してください。

`.env`は`npm run dev:api`とmigration／seedのCLIが読みます。`npm test`とビルド済みサーバーはシェルの環境変数だけを見るため、次のように使い分けます。

| 用途 | sh（macOS / Linux / Git Bash） | PowerShell |
| --- | --- | --- |
| ComposeのDBでテストする（未設定なら`embedded-postgres`へ切り替わる） | `DATABASE_URL='postgres://…' npm test` | `$env:DATABASE_URL='postgres://…'; npm test` |
| ビルド済みの構成を1プロセスで確認する（`.env`を読み込む） | `WEB_DIST=apps/web/dist node --env-file=.env apps/api/dist/server.js` | `$env:WEB_DIST='apps/web/dist'; node --env-file=.env apps/api/dist/server.js` |

本番・コンテナでは`.env`を使わず、環境変数を直接注入します（`DATABASE_URL`未設定ならexit 1）。passwordに記号を含める場合の書き方は[.env.example](../.env.example)を参照してください。

[Application CI](../.github/workflows/application.yml)はinstall・typecheck・test（PostgreSQL service）・build、[単体コンテナsmoke test](../scripts/smoke-container.sh)と[Compose検証](../scripts/smoke-compose.sh)を実行します。Compose検証は空のenv-file、別project・portと合成データで起動、再実行/restart、履歴不一致・設定不足の配信抑止、認証/API/SPA、正常終了、down/up後のvolume・データ保持を確認します。検証projectは最後に停止しますがvolumeは保持し、既存DBを削除しません。Dockerがある端末のsh/Git Bashでは`sh scripts/smoke-compose.sh`、競合portの変更は`SMOKE_APP_PORT`・`SMOKE_DB_PORT`で指定します。CIとDockerfileの`npm ci --ignore-scripts`はlifecycle scriptsを実行せず、Docker/CI内にmiseは不要です。

記録→Todayの検証はappと同じNodeの時計・東京の暦日計算を使います。Todayが記録日の翌日を返し、appの時計でも翌日への切替が確認できた場合だけ、翌日の記録から1回再試行します。HTTP・保存body・modelの不正、同じ日の不一致、2回目の日付跨ぎは失敗です。跨ぐと合成Goalの記録が1件から2件になるため、restart/down-up後はその件数を保持していることも確認します。[日付境界の回帰](../scripts/tests/smoke-today.test.sh)はDocker・実時計の変更なしで`sh scripts/tests/smoke-today.test.sh`を実行でき、CIでも確認します。

認証設定不足の検証は[subshell](../scripts/smoke-env.sh)へ隔離し、macOSやGit for Windowsの`sh`でもSecretを空にした状態が次の復旧確認へ残らないようにします。[環境変数の回帰](../scripts/tests/smoke-env.test.sh)は`sh scripts/tests/smoke-env.test.sh`と`bash --posix scripts/tests/smoke-env.test.sh`で確認します。macOS本体での追修正確認は人間の再レビューで行います。

Compose検証のvolumeは調査用に残るため、繰り返すと増えます。調査後に削除する場合は、**自分が実行した検証の出力**にある`project=`と`volume=`を控え、sh/Git Bashで次のplaceholderをその一組に置き換えて確認します。prefixだけを根拠に他の実行のvolumeを選ばないでください。

```sh
project='YOUR_OWN_SMOKE_PROJECT_FROM_OUTPUT'
volume='YOUR_OWN_SMOKE_VOLUME_FROM_SAME_OUTPUT'
docker volume inspect --format '{{.Name}} project={{index .Labels "com.docker.compose.project"}} volume={{index .Labels "com.docker.compose.volume"}}' "$volume"
docker ps -a --filter "volume=$volume" --format '{{.ID}} {{.Names}} {{.Status}}'
```

実行記録のprojectが`future-roi-compose-smoke-`で始まり、inspectのprojectがその`$project`と一致し、volume labelが`postgres_data`、自分の合成データだけであり、参照containerが0件と確認できたものに限り、次を手動で実行します。失敗時も`SMOKE:`／`RETAINED (if created):`が自分のproject・volume名を示します。作成前の失敗ではvolumeが存在しないこともあり、inspectで対応を確認できなければ保持します。

```sh
docker volume rm "$volume"
```

通常の`future-roi-local`・実データ・他人の検証volumeを対象にせず、一括pruneや自動削除は行いません。

Windowsのembeddedテストは各回に独立clusterを作成し、`.local/`へ証跡を保持します。旧clusterを再利用・削除しない分、初期化時間とディスク使用量が増えます。embedded初期化は`UTF8`・`C` localeを明示し、`LANG`未設定でも日本語・絵文字を文字数で検証します。[encoding回帰](../apps/api/tests/database-encoding.test.ts)は子プロセスだけで`DATABASE_URL`とlocale変数を外して実embedded DBを確認します。CIの他のDBテストはPostgreSQL serviceを利用します。`npm ci --ignore-scripts`は維持し、embedded起動前だけ固定platform配布物のmanifestから`native/lib/`内のリンクを検査・復元します（外部path・異なる既存linkは失敗し、依存scriptは実行しません）。システムlocale・外部DB・既存clusterは変更しません。

Windowsの合成clusterは、poolの終了・残存接続の検査・専用DBの削除後、固定配布物の公開`pg_ctl`で全workerの正常停止を待ちます。親PIDだけの強制終了で`io_worker`が残る経路を避け、[停止helper](../apps/api/tests/helpers/windows-embedded-stop.ts)は同時・再停止を同じPromiseへまとめます。停止の非zero・timeoutは失敗のまま返し、終了hookだけに停止を任せません。[停止の失敗・再要求の回帰](../apps/api/tests/windows-embedded-stop.test.ts)と[実clusterのlifecycle回帰](../apps/api/tests/database-lifecycle.test.ts)で、PID fileの除去・所有postmaster/workerの消失・子Nodeの自然終了を検査します。後者は外部`DATABASE_URL`を子だけで外し、Linuxでも元のsignal停止を同じ条件で検証します。

### 本番向けの約束事

- 環境変数は`DATABASE_URL`（必須）、`HOST`・`PORT`・`WEB_DIST`・`LOG_LEVEL`（任意）。`DATABASE_URL`が未設定なら起動せず、値はログへ出しません。コンテナ内の既定は`HOST=0.0.0.0`・`PORT=8080`・`WEB_DIST=/app/apps/web/dist`。
- `SIGTERM`で新規接続を止め、処理中の要求を完了し、DB接続を返してからexit 0。`SHUTDOWN_TIMEOUT_MS`（既定10000）を超えたらexit 1。
- DB接続は接続確立・クエリ応答・文の実行をそれぞれ5秒で打ち切り、期限切れの接続は再利用しません。idle中の接続がDB側から切れてもプロセスは終了せず、警告ログを残して次の要求で再接続します。
- 認証・Originの保護hookを通過した存在しないAPIと対象外methodはJSONの404。未ログインは401、業務APIのOrigin違反は403。画面のURLはindex.html（`cache-control: no-cache`）、`/assets/`はhash付きのため長期キャッシュ。
- migrationは起動前に`node apps/api/dist/db/migrate-cli.js all`（コンテナ内に`apps/api/migrations/`を同梱）で適用する。同時に実行されてもadvisory lockで直列化され、適用済みSQLの内容が変わっていれば失敗する。
- ログはpinoのJSON。Cookie・Authorization・Set-Cookieはredactし、リクエストbodyは出力しません。
- 認証は`BETTER_AUTH_SECRET`（32文字以上）と公開URLの`BETTER_AUTH_URL`（https）が必須。proxyを挟む公開先では`TRUST_PROXY_HOPS`をhop数に合わせる（回数制限の鍵になるclient IPの決定に使う）。詳細は[Architecture「2026-10-06の認証実装」](architecture.md#2026-10-06の認証実装75)。
- パスワード再設定は#284の承認により一時停止中。`MAIL_TRANSPORT`・`RESEND_API_KEY`・`MAIL_FROM`は参照せず、メール送信・本文ログ出力はしない。メール設定不足だけでは通常認証やサイトの起動を止めない。環境変数だけでは再開できず、配送受入・旧リンク期限の確認とコードレビューが必要。詳細は[Architecture「パスワード再設定（#256）」](architecture.md#パスワード再設定256)。

### 登録・ログインを確認する

Goalのmigration 0002は、既存GoalがないDBへ記録開始日を追加します。既存行がある場合はschema・データを変えず停止します。開始日を補完する方針は#76の人の判断待ちです。旧版0002を適用済みの場合もchecksum差異を自動回避せず、既存DBや記録を削除して通してはいけません。

業務APIの状態変更は許可originのOriginが必須です。認証API `/api/auth/*` は固定版Better AuthのtrustedOrigins検査を使い、RefererやFetch Metadataのfallbackがあるため「Originなしは常に403」とは扱いません。保護対象はrouterが確定したrouteで判定します。通常のAPI利用でsessionが延長された場合、更新Cookieも返します。

登録・ログイン・ログアウトの通信失敗は画面に表示し、送信ボタンを再利用できます。logoutがAPI errorを返した場合はlogin画面へ遷移しません。#215の[ログアウト失敗契約](architecture.md#ログアウトの失敗と明示再試行215)では、session削除の失敗・結果不明時に503 `SIGN_OUT_UNCONFIRMED`を返し、Cookieを保持します。「ログアウトを確認できませんでした」と表示されたら、時間をおいてもう一度ログアウトを押してください。自動再試行は行わず、削除完了を確認した成功時だけCookie消去とlogin画面への遷移を行います。503時点のコピー済み旧Cookieの失効は保証せず、削除前に認証済みの要求も取り消しません。公開HTTPS・本番DB復旧の確認はD-24/#83の残条件です。

`npm run dev:web`（または`WEB_DIST`つきのビルド済みサーバー）の `/` を開くと、公開ホームに登録・ログインの入口が表示されます。「登録してはじめる」でメールアドレスとパスワード（8文字以上）を入れると登録とログインが同時に行われ、Goal一覧へ進みます。0件なら「最初のGoalをつくる」から作成し、一覧のGoalを開くとTodayへ進めます。Goal一覧の上のバーと、各画面の一覧へ戻る操作も確認してください。ログイン済みのホームには「Goal一覧を開く」が表示され、再読み込みしてもログイン状態が続きます。保護画面を未ログインで開いた場合はログインへ送り、登録・ログイン画面を切り替えても元の戻り先を保ちます。戻り先指定がない認証はGoal一覧へ進みます。Goal一覧右上のアカウントボタンから「ログアウト」を押すとログイン画面へ戻ります（ログイン済みで`/login`を開くと戻り先へ移ります）。間違ったパスワードは「メールアドレスまたはパスワードが正しくありません」、同じ接続元から60秒に6回以上の失敗は「しばらく待ってからお試しください」と再開できる時刻を表示し、その時刻を過ぎると再試行できます。APIが止まっている間に保護画面を開くと、ログイン画面ではなく「接続できませんでした」と再読み込みを表示します。未ログインで`curl http://127.0.0.1:3000/api/goals`を実行すると401のJSONが返ります。ログイン後のCookieを付けて同じURLを呼ぶとGoalの一覧（最初は`[]`）が返り、作成・編集・削除の規則は[Architecture](architecture.md#2026-10-06のgoal-api76)に記載しています。

ログイン画面は「現在パスワード再設定は利用できません」と案内します。`/forgot-password`と`/reset-password`を直接開いた場合や、以前のメールリンク・無効リンクを開いた場合も案内とログインへの導線だけを出します。再設定の要求・リンク処理・保存APIは503 `RESET_PASSWORD_DISABLED`で停止し、新規token・メール本文ログを作りません（既存Origin・入力・回数制限の拒否は4xxのまま）。既発行tokenのDB行は削除せず、停止中は使えませんが元の1時間の期限は進みます。合成テストだけ明示的に有効化して旧機能の回帰も維持し、実配送・本番設定・公開ログからのtoken取り出しは行いません。[停止の仕組みと再開条件](architecture.md#パスワード再設定256)を参照してください。

stagingへの配置は公開先の承認待ちです。現在の第一候補はFE・BEともVercel Hobby＋Neon Free、ローカル開発はDocker（[D-25](architecture.md#d-25)）。#70→#75から移された未確認項目は#83で追跡し、[採用前の最小検証](operations/release-demo.md#公開候補の採用前に行う最小検証)を行います。Cloud Run＋Neonの従来候補はD-25の履歴に残します。

## Predictionの限定先行計算を確認する

#71〜#73に記録した限定先行承認に沿った[packageの手順](../packages/prediction/README.md#ローカル検証)を使います。純粋計算本体・T-01〜T-15に対応するローカルテストと実性能を確認できます。終了コード0やFoundation成功をアプリ結合・正式受入の完了と扱いません。#70でroot workspaceとlockfileへ統合し、`npm run typecheck --workspace=@futureroi/prediction`等でも同じ検証を実行できます（[残条件](../packages/prediction/README.md#70後に合わせる点と残条件)）。[検証CI](../packages/prediction/README.md#検証ci)は純粋Engineの型検査・数値／候補回帰と独立CDF oracleをPR時に実行し、Foundationとは別です。このEngine検証はアプリの起動・DB・HTTP・UIを実行しません。

## 文書チェックで起きること

`mise.toml`の`check`は`pwsh -NoProfile -File scripts/check-foundation.ps1`を呼びます。直接実行も同じ処理です。

1. スクリプト自身の位置からリポジトリのルートへ移動し、Gitの追跡ファイルと、無視されていない未追跡ファイルを列挙します。
2. Markdown・YAML・TOML・PowerShellスクリプトと一部の設定ファイルについて、UTF-8として読めるか、競合マーカーや末尾改行の欠落がないかを検査します。ローカルの認証情報・Secretは読み取り対象にしません。
3. Markdownの通常のインラインリンクについて、相対パスの参照先とMarkdown見出しを確認します。コードブロックの例や外部URLは対象外です。コード中の関数名、参照形式リンク、文書内容の意味までは検証しません。
4. 履歴に保管した`.env.example`の形式、指定した7ケースのGit除外設定、未ステージ・ステージ済み差分の空白を確認します。
5. 問題があれば`ERROR:`で対象を示し、失敗として終了します。問題がなければ`PASS:`でファイル数・内部リンク数等を表示します。アプリのbuild・lint・型検査・テストは実行しません。

CI（変更時に自動で行う検証）は[foundation.yml](../.github/workflows/foundation.yml)が定義します。PR、mainへのpush、手動実行を入口として、Ubuntuのrunner（実行用マシン）で同じスクリプトを実行します。SecretやDBを必要とせず、実行結果は対象PRのChecksで別に確認します。
Git Hookはコミット前に[pre-commit](../.githooks/pre-commit)から`git diff --cached --check`だけを実行します。Hookが成功しても全体の文書チェックを実行したことにはなりません。

## 文書チェックで困ったとき

| 表示・症状 | 確認すること |
| --- | --- |
| `mise`が見つからない | PowerShell 7から`pwsh -NoProfile -File scripts/check-foundation.ps1`を直接実行する |
| `pwsh`が見つからない | PowerShell 7の導入とPATHを確認する。Windows PowerShell 5.1で代用しない |
| miseの信頼確認で止まる | `mise.toml`とスクリプトを確認し、信頼できる場合のみ`mise trust`を行う |
| `missing link target` / `missing heading` | 表示されたMarkdownのリンクと実ファイル・見出しを照合して修正する |
| 空白・文字コード・除外設定のエラー | 対象ファイルとチェック条件を確認し、全体チェックを再実行する |

旧アプリ・DB・Dopplerのトラブルシュートは[履歴内の手順](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/DEVELOPMENT_GUIDE.md#文書チェックで困ったとき)に残しています。現行構成として起動する手順ではありません。

---

# 14. 作業を始める前に

[Future ROIのIssue運用](#future-roiのissue運用)に沿って最新の着手条件を読み直し、自分が対象IssueのAssigneeに設定されていることを確認します。
Branch作成後はIssue本文の「開発情報」にBranch名を記載し、Push後にBranchのリンクを追記します。
記載形式は [CONTRIBUTINGの紐付けルール](../CONTRIBUTING.md#issueとbranch--pull-requestの紐付け) を参照してください。

新しい作業を始める前に、mainを最新状態にします。

```bash
git switch main
git pull origin main
```

その後、Issue用のBranchを作成します。

可能であれば、GitHubのIssue画面にある、

```text
Development
→ Create a branch
```

からBranchを作成します。

GitHub側ですでにBranchを作成した場合：

```bash
git fetch origin
git switch docs/6-development-guide
```

---

# 15. Branchとは

Branchは、

「mainに影響を与えずに作業するための場所」

です。

main上で直接コードを書かず、Issueごとに作業Branchを使用します。

---

# 16. Branch命名規則

Branch名は、

```text
種類/Issue番号-概要
```

とします。

例：

```text
feat/12-search
fix/23-save-error
refactor/31-parser
docs/6-development-guide
chore/8-ci
```

使用する接頭辞は、

| Prefix     | 用途               |
| ---------- | ------------------ |
| `feat`     | 新機能             |
| `fix`      | バグ修正           |
| `refactor` | リファクタリング   |
| `docs`     | ドキュメント       |
| `chore`    | 開発環境・設定など |

---

# 17. 作業開始

Branchへ移動したら、GitHub ProjectsのStatusを、

```text
Ready
↓
In Progress
```

へ変更します。

現在のBranchは、

```bash
git branch
```

で確認できます。

例えば、

```text
* docs/6-development-guide
  main
```

となっていれば、`docs/6-development-guide`で作業しています。

## 仕様を調べて変更するには

正式設計の入口は[Product Spec](product-spec.md)（何を保証するか）と[Architecture](architecture.md)（どう実現するか）の2本です。要件・Scope・技術選定・Deployment・Decision Logを別の正式文書へ分散させず、調査資料やPoCは補助成果物として区別します。

1. [対応表](change-map.md)から対象の機能・ページ・基盤を探し、仕様を読みます。どんな目的・操作・条件・状態を持つかを確認してから、関連コード・設定・テストを読みます。
2. 呼び出し元・参照元も検索し、影響する範囲、実際に変更する範囲、確認だけの範囲を分けます。文書と実装が違えば、現在の動作を無条件に仕様へ転記せず、不一致として記録します。
3. [共通の文書執筆・保守手順](../CONTRIBUTING.md#文書を書く手順)に沿って、変更した仕様・説明・対応表・参照を同じ作業で更新します。初心者向けとAI向けに仕様を別々に複製しません。
4. 対象の検証を行い、PRに文書への影響と更新内容、更新不要ならその理由を記載します。必要な文書更新が残っている間は完了にしません。

AIへ依頼する場合は、Issue番号、変えたい挙動、関連仕様、完了条件、変更しない範囲を渡します。例えば「対象Issueの仕様を確認し、対応表とコードから影響を調べ、必要な仕様文書・関連参照も同じ作業で更新し、検証結果と未確認事項を報告してください」と依頼できます。
AIは[AGENTS.md](../AGENTS.md)から共通ルールを確認します。人間も、必要な詳しい手順は上記Skillを参照できます。

---

# 18. Commitとは

Commitは、

「変更内容をGitの履歴として保存すること」

です。

変更内容が分かる単位でCommitします。

例：

```text
feat: 検索フォームを追加
fix: 保存時のエラーを修正
refactor: パーサーの責務を整理
docs: 開発運用ガイドを追加
chore: Issueテンプレートを追加
```

---

# 19. Commitする手順

リポジトリのルート、対象Issueの作業Branchで実行します。以下はREADMEを変更した場合の操作例です。ファイル名・コミット文・Branch名は実際の作業に合わせます。
まず変更を確認します。

```bash
git status
git diff
```

変更内容をCommit対象へ追加します。

```bash
git add README.md
```

`git status`は変更一覧、`git diff`は未ステージの差分を表示します。`git add README.md`は指定したファイルだけを次のコミット対象（ステージ）へ入れます。無関係な変更を混ぜないよう、対象ファイルを明示してください。
ステージした後にファイルを編集した場合は、追加の差分を確認してから必要なものを再度ステージします。

コミットされる内容と空白エラーを確認します。

```bash
git diff --staged
git diff --cached --check
```

1行目はステージ済みの内容を表示します。2行目はその差分の空白エラーを検査し、成功時は何も表示せず終了します。`--staged`と`--cached`は同じ比較対象を指します。新しいファイルの内容も1行目で確認できます。

Commitします。

```bash
git commit -m "docs: 初心者向け開発運用ガイドを追加"
```

これはステージした内容を説明付きで履歴へ保存します。成功時はコミットIDと変更概要が表示されます。Hookで失敗した場合は対象差分を直して確認し、Hookを無効化して通さないでください。

GitHubへ送ります。

```bash
git push
```

初回Push時に設定を求められた場合：

```bash
git push -u origin docs/6-development-guide
```

`git push`はコミットを送信先へ送り、初回の`-u origin <Branch名>`は対応する送信先Branchも設定します。対象Branchと送信範囲を確認してください。送信に失敗した場合は[Gitで困ったとき](#35-gitで困ったとき)も参照し、force pushで解消しないでください。

---

# 20. Pull Requestとは

Pull Request、略してPRは、

「作業Branchの変更をmainへ取り込んでもらうための申請」

です。

PRでは、

- 何を変更したか
- なぜ変更したか
- どのように確認したか
- どこをレビューしてほしいか

を共有します。

---

# 21. Pull Requestを作る

実装と動作確認が終わったらPRを作成します。

PR Templateに沿って、

- 概要
- 関連Issue
- 変更内容
- 動作確認
- レビューしてほしい点
- スクリーンショット
- 補足

を記載します。

PRを作成したらProjectを、

```text
In Progress
↓
In Review
```

に変更します。

---

# 22. IssueとPRを紐付ける

担当者はPR作成後、Issue本文の「開発情報」にPRのURLまたは `#<PR番号>` を追記します。
Branch名・リンクも記載済みか確認してください。未作成の間は「未作成」としておきます。
記載例は [CONTRIBUTINGの紐付けルール](../CONTRIBUTING.md#issueとbranch--pull-requestの紐付け) を参照してください。

対象IssueをこのPRで全て解決する場合は、

```text
Closes #12
```

のように記載します。

Issue #12を解決するPRの場合：

```text
Closes #12
```

とします。

`Closes`を指定したPRがmainへMergeされると、対応するIssueもCloseされます。一部対応・管理Issueの参照は`Refs`を使い、[Close前の確認](#closeと製品完成を確認する)に従ってください。

---

# 23. Reviewとは

Reviewは、

「変更内容を他のメンバーが確認すること」

です。

Reviewerは主に、

- Issueの目的を満たしているか
- 完了条件を満たしているか
- バグがないか
- コードが理解しやすいか
- 設計に問題がないか
- 不要な変更が混ざっていないか

を確認します。

---

# 24. Reviewの結果

## Comment

質問・提案・補足などです。

必ずしも修正必須とは限りません。

## Approve

問題なし。

Mergeしてよい状態です。

## Request changes

修正が必要です。

---

# 25. Request changesされた場合

```text
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
```

という流れになります。

`Re-request review`は、

「修正したので、もう一度確認してください」

という意味です。

---

# 26. レビューコメントへの対応

レビューコメントに対応したら、

```text
Resolve conversation
```

で会話を解決します。

指摘内容が理解できない場合は、推測で修正せずReviewerへ確認します。

---

# 27. Merge Conflict

Merge Conflictとは、

複数のBranchで同じ部分が変更され、
Gitが自動でどちらの変更を採用すべきか判断できない状態です。

Conflictが発生したら、まず、

```bash
git status
```

で対象ファイルを確認します。

分からない状態で、

- Conflict markerを適当に削除する
- 相手の変更を全部消す
- force pushする

といった対応はしないでください。

解決方法が分からない場合は、チーム内で確認します。

---

# 28. 作業中にmainが更新された場合

他のメンバーのPRがmainへMergeされることがあります。

自分のBranchへ最新mainを取り込む必要がある場合は、

```bash
git switch main
git pull origin main
```

でmainを最新化します。

その後、自分のBranchへ戻ります。

```bash
git switch feat/12-search
```

mainを取り込みます。

```bash
git merge main
```

Conflictが発生した場合は、内容を確認して解決します。

分からない場合はチーム内で相談します。

---

# 29. Squash Merge

このリポジトリでは、PRをmainへ取り込むときに、

```text
Squash Merge
```

を使用します。

Squash Mergeは、

PR内にある複数のCommitを1つにまとめてmainへ取り込む方法です。

例えば、

```text
fix
fix typo
review fix
```

というCommitがあっても、mainには、

```text
feat: 検索機能を追加
```

という1つのCommitとして残せます。

mainの履歴を読みやすくするために使用します。

---

# 30. Definition of Done

個別の変更を扱う作業Issueは、以下を満たした状態をDoneとします。管理Issueは[Closeと製品完成の確認](#closeと製品完成を確認する)に従います。

- [ ] Issueの完了条件を満たしている
- [ ] 必要な動作確認が完了している
- [ ] Pull Requestが作成されている
- [ ] Reviewが完了している
- [ ] 未解決のレビューコメントがない
- [ ] mainへSquash Mergeされている
- [ ] IssueがCloseされている
- [ ] ProjectがDoneになっている

「実装が終わった」だけではDoneではありません。

---

# 31. Merge後

PRがMergeされたら、

```text
PR
→ Merged

Issue
→ Closed

Project
→ Done
```

になっていることを確認します。

---

# 32. Merge済みBranch

PRがMergeされた作業Branchは、原則として削除します。

対象：

```text
feat/*
fix/*
refactor/*
docs/*
chore/*
```

Merge済みBranchを次のIssueで再利用しません。

次のIssueでは、最新のmainから新しいBranchを作成します。

---

# 33. 秘密情報をCommitしない

このRepositoryはPublicです。

以下のような情報は絶対にCommitしないでください。

- APIキー
- アクセストークン
- パスワード
- DB接続情報
- 秘密鍵
- Webhook URL
- `.env`の実値

秘密情報は環境変数などで管理します。

`.env`などは`.gitignore`でGit管理対象から除外します。

GitHubのSecret ProtectionやPush Protectionも有効にしていますが、
これらは最後の防御です。

秘密情報をCommitしてよいという意味ではありません。

誤ってSecretを公開した場合は、
Commitを削除するだけではなく、そのSecret自体を無効化・再発行します。

---

# 34. Branch運用でやってはいけないこと

以下は行わないでください。

```text
mainへ直接Pushする

main上で直接実装する

1つのBranchに無関係な複数Issueを混ぜる

Merge済みBranchを使い回す

Review前にMergeする

Review指摘を無視してMergeする

理由なくforce pushする

秘密情報をCommitする
```

---

# 35. Gitで困ったとき

まず以下を確認します。

現在の状態：

```bash
git status
```

現在のBranch：

```bash
git branch
```

最近のCommit：

```bash
git log --oneline
```

接続しているGitHub Repository：

```bash
git remote -v
```

分からないまま、

```text
reset
rebase
force push
```

などを実行しないようにしてください。

特に、

```bash
git push --force
```

は、他人の変更を壊す可能性があります。

---

# 36. 開発の基本サイクル

基本的には毎回この流れです。

```text
Issueを作る
↓
目的・完了条件を整理
↓
Assignee設定
↓
Scope設定
↓
Ready
↓
最新mainからBranch作成
↓
In Progress
↓
実装
↓
Commit
↓
Push
↓
Pull Request
↓
Closes #Issue番号
↓
In Review
↓
Review
↓
必要なら修正
↓
Approve
↓
Squash Merge
↓
Issue Close
↓
Done
↓
Branch削除
```

---

# 37. 具体例

「検索機能を追加する」というIssue #12を例にします。

## Issue作成

```text
[Feature] 検索機能を追加
```

完了条件：

```text
- キーワードを入力できる
- 検索結果が表示される
- 結果が0件の場合の表示がある
```

Scope：

```text
Must
```

Assignee：

```text
自分
```

## Ready

仕様・完了条件が決まったら、

```text
Backlog
↓
Ready
```

にします。

## Branch

作業を開始するとき、

```text
Ready
↓
In Progress
```

にします。

Branch：

```text
feat/12-search
```

## 実装

Commit例：

```text
feat: 検索フォームを追加

feat: 検索処理を実装

fix: 検索結果0件時の表示を修正
```

## Pull Request

関連Issue：

```text
Closes #12
```

Project：

```text
In Progress
↓
In Review
```

## Review

修正が必要：

```text
Request changes
↓
修正
↓
Re-request review
```

問題なし：

```text
Approve
```

## Merge

```text
Squash and merge
```

その後、

```text
PR → Merged
Issue #12 → Closed
Project → Done
```

を確認します。

---

# 38. 最低限覚えておくこと

全部を一度に覚える必要はありません。

まず、

```text
Issue
↓
Branch
↓
実装
↓
Pull Request
↓
Review
↓
Merge
```

を覚えてください。

Issueは、

「何をするか」

Branchは、

「作業場所」

Commitは、

「変更履歴」

Pull Requestは、

「mainへ変更を取り込むための申請」

Reviewは、

「変更内容の確認」

Mergeは、

「変更をmainへ取り込むこと」

です。

迷った場合は勝手に進めず、チーム内で確認してください。
