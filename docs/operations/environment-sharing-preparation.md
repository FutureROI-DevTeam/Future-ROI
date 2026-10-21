# miseと環境設定共有の準備（#70への案）

**Supporting Doc / Not a Source of Truth.** ユーザー依頼に基づく準備資料。#70 の担当・BLOCKED・Hard、技術採択や共有サービスを変更しない。正式な責務は[Architecture](../architecture.md#deployment)、運用ルールは[CONTRIBUTING](../../CONTRIBUTING.md#秘密情報)、現状は[開発基盤の状態](development-foundation-status.md)を参照する。

## miseはいつ使うか

今は導入済みの環境で、文書・設定チェックの共通コマンドとして使う。リポジトリのルートの[mise.toml](../../mise.toml)には`check`・`check:staged`・`hooks:install`がある。信頼操作とHook導入は[初回セットアップ](../DEVELOPMENT_GUIDE.md#13-初回セットアップ)に従う。今回、新しいtools指定・install・trust・Hook設定は行わない。

```sh
mise run --skip-tools check
mise run --skip-tools check:staged
```

`check`は文書と設定、`check:staged`はcommit対象の空白を検査する。Engineの数値テストやアプリ起動を実行するコマンドではない。miseがなければPowerShell 7で`pwsh -NoProfile -File scripts/check-foundation.ps1`、空白検査は`git diff --cached --check`を直接実行できる。

#70で`mise.toml`にNode 24.22.1と`install`・`typecheck`・`test`・`build`・`dev:api`・`dev:web`のタスクを追加した。Engine CIのNode22.15.1/24系や単体Dockerの検証版を、そのまま製品版の決定にしない。DockerがあればEngine単体の検証にはhostへのmise/Node追加は不要。miseはツール版とタスクの入口を揃える役割で、Secret共有サービスの採択を代替しない。

## 空の環境例と必要になる条件

[.env.example](../../.env.example)は項目名・用途を確認するための空の例。#70以降、`npm run dev:api`だけがrootの`.env`を読む（Nodeの`--env-file-if-exists`）。テスト・CI・コンテナには環境変数を直接渡す。現行Engineの検証とFoundationには、以下の変数を含めて環境設定は不要。

| 項目 | 用途と必要になる条件 | 扱い |
| --- | --- | --- |
| `DATABASE_URL` | APIの接続先。#70で必須にした（未設定なら起動しない）。pool上限等は#74で確定する | password等を含み得るSecret。FE bundleへ渡さない |
| `BETTER_AUTH_SECRET` | Better Authの採択・実装後にAPIが使うSecret。#75で生成・更新・読込の条件を確定する | Secret。例には空欄だけを置く。今回生成しない |
| `BETTER_AUTH_URL` | Better Authの採択・実装後に使う公開base URL。ローカル/staging/productionのorigin整合を確認する | Secretそのものではないが環境ごとに設定する。未作成のURLを成功例として埋めない |

候補技術名と既存Deploymentの記載に合わせた準備であり、新しい必須変数・起動時検証・FE公開prefixを採択していない。現時点でFE専用に必要な環境変数はない。アプリ実装側が確定した項目だけを追加し、用途・利用側・必須条件・例・読込手順を同じ変更で更新する。

## 安全な共有手順の案

1. #70/#74/#75の担当が、local・staging・productionで必要な項目と利用者を整理する。Engine検証だけの担当にDB/認証Secretを配らない。
2. 実値の保管・配布方式と管理担当をチームが決める。ProductionはArchitectureのProvider Secret設定を使う。ローカル共有サービス（Doppler、dotenvx、1Password等）は未決で、旧音楽案の方式を自動継承しない。選定前に新規契約・権限付与・鍵生成を行わない。
3. 承認された共有経路から、必要な環境の値だけをローカルのGit除外ファイルまたは承認済みの実行注入方式へ渡す。読込方法もアプリ基盤の採択後に揃える。Issue/PR/チャットへ実値を書かず、ログや画面共有にも出さない。
4. `.env.example`は空欄のまま共有し、`.env`・`.env.local`等の実値はcommitしない。既存[.gitignore](../../.gitignore)で除外済み。`git check-ignore --no-index .env .env.local nested/.env.production`と`git status --short`で確認する。実値ファイルの`cat`やdiff表示は不要。
5. 共有完了の確認は「担当者が必要な値を取得し、対象環境で接続・認証が成功したか」を結果だけ記録する。方式未決・接続未実施を完了へ変換しない。

環境ごとの値を一つのファイルで混ぜない。productionのSecretをローカルテスト・Docker build・FEへ渡さない。実値を共有する承認が出るまでは、この空例と用途表だけを渡す。漏洩時の無効化・再発行は既存の[Secret運用](../../CONTRIBUTING.md#秘密情報)に従う。

## 今回用意したものと残項目

空の`.env.example`、既存miseタスクの使いどころ、Git除外の確認手順、共有前に決める項目を用意した。既存`.gitignore`は変更不要。Secret実値の読取・出力・commit・送信、サービス接続、鍵生成、アプリのenv読込実装は行っていない。

残りは#74/#75の実際の必須条件、共有方式・管理担当・アクセス範囲の決定と、その後の接続確認。#70 のDone条件を満たしたものではない。miseが未導入の環境では今回のmiseコマンド自体は未実行とし、同じFoundation処理をPowerShellで確認する。

miseのタスク実行仕様は[公式ドキュメント](https://mise.jdx.dev/tasks/running-tasks.html)を参照する。
