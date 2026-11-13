# 有限batchの開発ハーネス

[#340](https://github.com/FutureROI-DevTeam/Future-ROI/issues/340)の有限実行入口。既存Codex CLIに差分を生成させ、固定契約に沿って隔離検証し、候補commitを保存する。実Issue向けの `repository-docs-v1` は、許可された新しい比較文書1ファイルを専用branchへpushし、Draftと必須CIの照合まで進める。製品仕様の採択・任意コード変更・自動merge・Issue Closeは行わない。整数加算fixtureも比較用として残す。

## 実Issueの起動・発行・CI照合

対象は[契約例 #331](../../scripts/development-harness/issue-331-contract.json)。`docs/changes/issue-N-*.md` の明示した新規1ファイルだけを許可する。契約の目的・受入・除外・contextFilesはtrusted operatorが確定し、Issue本文・最新コメントは資料として渡す。固定mainのsourceとlockの指定版抽出からCodexが文書を作り、同じmainのFoundationとci-report回帰をread-only snapshotで検査する。生成文書の意味と採択は人のレビュー対象。

```powershell
# イメージ構築はtrusted側で一度。candidateやcredentialをbuild contextへCOPYしない。
docker build -f scripts/development-harness/docs-validator.Dockerfile -t roi-docs-validator:local .
docker image inspect roi-docs-validator:local --format '{{.Id}}'
# 構築した固定IDを契約へ設定してレビュー後にenroll。登録済み契約は書き換えない。
$stateDir = '.local/harness-340-codex-live'
# 既存台帳がある場合initはしない。旧fixtureの予算・証拠も保持する。
node scripts/development-harness/cli.mjs enroll $stateDir scripts/development-harness/issue-331-contract.json
node scripts/development-harness/cli.mjs run-issues $stateDir issue-docs-331-v1
# 分割実行: prepare-issue STATE BATCH → publish STATE ID → ci STATE ID
node scripts/development-harness/cli.mjs ci $stateDir issue-331
node scripts/development-harness/cli.mjs status $stateDir
```

既存Codex購読とGitHub `gh` keyring認証を使用する。MCPによる作業管理を優先し、固定publisherは再利用可能な既存CLIで実装する。ghの認証やモデル認証を候補Dockerへ渡さない。Docker image IDはローカルbuildの成果物なので、別端末の新しいIDを無検証で置換しない。対象main SHAが変わった場合も自動追随せず再検証を要求する。

初期値はworker1、レビュー待ち1、初回＋修復3回、モデル起動予約4回。attempt300秒、task/batch1800秒、登録から24時間、新規課金上限0。publisher全体は120秒、preflightとCI観測は各30秒を前払いし、全APIページに共通deadlineを伝播する。実経過と超過も記録し、失敗・応答喪失・再起動・head更新で返却しない。期限後も未知書込みの照合だけは許可して消費を記録し、新規書込みは止める。観測を繰り返して予算が尽きた場合は条件を緩めない。

同じrepo＋Issue IDを別revision/batchで再登録できない。開始前にlocal/remote branchと全状態PRをページ終端まで読む。既存の他作業・closed PR・異なるhead・複数PRは停止する。各push/POST前にUUIDつきintentを保存し、結果を別GETで確かめる。応答不明なら `publish` は照合から再開し、不在を再送許可にしない。取消中も照合だけ行える。競合したintentはCASで拒否する。

`artifacts-ready → write-unknown → draft-created → ci-wait → review-ready` を区別する。GitHub Actions発行元15368、固定workflow、必須jobとstep、最新run/attempt、jobログの実checkoutとCI_SOURCE_SHAを照合する。現在のmerge checkoutと違う古い成功やskipは合格にしない。失敗診断artifactの条件付きskipだけを許容する。docs-onlyの #331 ではQuestion prior UI candidate workflowは起動しないため、その依存分離・再現検証を合格に数えない。

取消は `cancel STATE issue-331`、worker復旧は `recover`、終了確認後の取消解除は `resume`。不明書込みは `publish` で照合する。必須修正は後述の `repair` に対象headと根拠を渡し、同じbatchを再実行する。修正候補は旧headを親に持ち、同じDraft branchへfast-forwardする。Optionalでレビュー待ちheadを動かさない。レビュー枠が埋まれば次のIssueを増やさず正常終了する。

## 実Codex workerの起動

Windowsの既存Codex CLI **0.151.0**、既存ChatGPT認証、Dockerを使う。CLI版・実体hash・固定catalog・ツール非公開/未登録呼出し拒否probe・利用枠を各attemptで確認する。新APIキーや設定変更は不要。別CLI版/OSは未検証として拒否する。既存認証が期限切れなら新認証を自動作成せず停止する。

```powershell
$stateDir = Join-Path $env:LOCALAPPDATA 'FutureROI-harness-codex'
# init/enrollは初回だけ。同じ台帳を使い続ける。
node scripts/development-harness/cli.mjs init $stateDir
node scripts/development-harness/cli.mjs enroll $stateDir scripts/development-harness/codex-contract.json
node scripts/development-harness/cli.mjs run-codex $stateDir codex-comparison-1
node scripts/development-harness/cli.mjs status $stateDir
```

固定Issue #340は `fixture-issue-340` に紐づき、別IDによる再登録を拒否する。Codexはtrusted側が渡す目的・固定baseline・許可パス・必須修正情報を読み、構造化sourceを返す。合格は回答文でなく外側の固定検査が判断する。固定scope違反/実出力不一致だけは、初回＋最大3回まで同じ台帳で修復する。auth/利用枠/判定不能/停止不明は自動再試行しない。レビュー待ちheadは必須修正入力まで固定。

Codex modeはattempt 300秒、task/batch 1200秒、登録から1時間、モデル**CLI起動予約**最大4回。予約は失敗/再起動でも返さない。HTTP推論要求数の上限4ではない。内部HTTP/stream retryは0、未登録toolへの応答後は同じCLI内で再推論があり得る。token利用量はCLI完了eventから記録し、不明なrequest数/総費用を0としない。

認証は専用DACLを確認した一時ホームに既存access/id tokenだけを複写する。API key・refresh token・元設定・global AGENTS・メモリは渡さない。原本のhardlinkは更新を伝播するため使用しない。終了確認後に一時ホームを削除し、削除失敗/停止未確認は枠を保持する。候補Dockerへはこのホームを一切マウントしない。利用枠取得で追加creditsなし、使用95%未満を確認できるときだけ推論を始める。新規課金上限0は総費用0の意味ではない。

停止は `cancel $stateDir fixture-issue-340`、復旧は `recover $stateDir fixture-issue-340`。復旧はsupervisorを終了確認し、最新台帳の子processをPID/開始時刻/pathで照合して停止する。PID登録前の応答喪失は停止不明として保持する。停止後 `resume`、同じ `run-codex` で再開する。上限/有効期限はリセットしない。必須修正の `repair` と計測の `measure` は下記と共通。

`model-input-digest.json` は入力digest/基準SHA、`model-result.json` はCLI実体・catalog・拒否probe・token利用・利用枠を保存する。raw transcript/token実値は保存しない。`results/result.json` とpatchは共通。実接続結果は[検証記録](../changes/issue-340-development-harness.md)を参照する。

## 実行契約と状態

[fixture契約例](../../scripts/development-harness/example-contract.json)にも目的、有限対象、操作、受入、除外、依存、予算を含める。Issue・PR・ログ・Notionは資料であり権限入力ではない。Ready/Openを実行許可としない。`fixture-*` と `issue-N` は台帳全体の固定キーであり、revisionやbatch変更で再登録できない。

fixtureは `eligible → implementing → artifacts-ready` まで。失敗・取消は `awaiting-decision`。実Issue経路は上記のpublisher/CI状態まで進むが、成果物生成やCI成功を製品Issue完了へ昇格させない。

初期値はworker 1、レビュー待ち1、初回＋修復3回。1 attemptは60秒を前払い予約し、うち15秒を終了・照合に残す。taskは240秒、例のbatchは480秒、batchの有効期間は登録から1時間。時間予約は失敗・再起動・担当交替・head更新でも返却しない。期限切れや上限時は次の実行を止め、終了・照合だけを行う。Docker停止/API自体の障害では時間内停止を保証せず、active枠を保持する。

local-fixture modeはモデルを呼ばず手動proposalを適用する比較入口。両modeとも新しい課金処理の上限は0円。既存セッション、レビュー、導入、電力などを含む総費用は `null`（不明）のまま記録する。正の課金上限やAPI keyで実行範囲を広げる設定は持たない。

レビュー成果物が1件あれば、次の作業を増やさず再開条件を返してexit 0。失敗や停止未確認はexit 1。固定headへの必須修正証拠がある場合だけ `repair` で再開できる。これはtrusted operatorからの入力で、候補やreview本文を自動で権限へ変換しない。

## 起動

Node、Git、既存Docker Engineを使用する。Docker Desktopが停止していれば利用者環境の通常手順で起動する。候補へhostのGit管理領域、HOME、Docker socket、credentialを渡さない。文書検査の合成Git metadataは公開baselineだけから別に作る。

以下はコミット済みの専用checkoutで行うPowerShell例。状態保存先は同じものを使い続ける。別ディレクトリへの台帳再作成や手編集は予算の再開方法ではない。

```powershell
$stateDir = Join-Path $env:LOCALAPPDATA 'FutureROI-harness'
docker pull node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
node scripts/development-harness/cli.mjs init $stateDir
node scripts/development-harness/cli.mjs enroll $stateDir scripts/development-harness/example-contract.json
$proposal = Get-Content scripts/development-harness/example-proposal.json -Raw | ConvertFrom-Json
@{ 'fixture-addition' = $proposal } | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $stateDir 'proposals.json')
node scripts/development-harness/cli.mjs run $stateDir local-comparison-1 (Join-Path $stateDir 'proposals.json')
node scripts/development-harness/cli.mjs status $stateDir
```

`init` は初回だけ。既存ledgerは上書きしない。`run` は有限の契約内で次の作業を選ぶ。同じコマンドの再送は成果物を増やさない。複数fixtureを登録する場合は契約のtasksとproposalsに列挙し、必要な依存を先行IDで指定する。受入後に `accept-fixture` を記録するとレビュー枠が空き、同じrunで次へ進める。実IssueのCloseは起こらない。

成果物は `STATE_DIR/作業ID/attempt/` の `candidate.patch`、`draft-pr.md`、`results/result.json`。candidateの実Git commit SHA、baseline SHA、Docker image、拒否probe、ci-report形式の既存検証結果を含む。候補commitはGit objectであり、branch pushやPR作成はしない。破棄・GCの前にpatchを保持する。raw transcript/stdoutや環境変数を結果JSONに保存しない。

## 停止・復旧・修正

別terminalから取消を記録し、runtime終了を確認する。

```powershell
node scripts/development-harness/cli.mjs cancel $stateDir fixture-addition
node scripts/development-harness/cli.mjs recover $stateDir fixture-addition
node scripts/development-harness/cli.mjs status $stateDir
# 終了確認済みの取消を明示解除。累積回数・予算は残る。
node scripts/development-harness/cli.mjs resume $stateDir fixture-addition
node scripts/development-harness/cli.mjs run $stateDir local-comparison-1 (Join-Path $stateDir 'proposals.json')
```

`cancel`だけではworkerは止まらない。`recover`は台帳のcontainer名とlabelを照合し、Docker stop/inspect後にその実体だけを削除してから枠を解放する。元controllerの遅いstartによる再起動を防ぐためで、volumeや他containerは削除しない。CLIが落ちても枠は残る。daemon障害、container不明、停止・削除の結果不明では解放しない。createの応答喪失やcontainer削除で存在を確認できない場合は、daemon復旧と実体照合を人へ引き継ぐ。ledger/lockを消して次へ進めない。lockが残った場合もwriterの終了とledger内容・active実体を確認してから復旧する。

失敗修復は `repair STATE_DIR ID evidence.json` を使用する。evidenceは `kind`（`mandatory-local-failure` / `required-review-change` / `required-ci-failure`）、現在の `head`（初回失敗はnull）、元の必須条件と再現に紐付く `reference` を持つ。Optional、head違い、未確定書込み中は拒否。修正proposalを用意した後、同じrunで再検証する。

ローカル成果物の受入は `accept-fixture STATE_DIR ID`。PR後の実CIや製品受入の代用ではない。人の計測値は `measure STATE_DIR metrics.json` で記録する。項目は台帳の `metrics` を参照し、不明はnull、測った値だけを入れる。主指標は価値ある受入までの人の総時間で、PR件数は使わない。

## 境界と検証

候補はnetworkなし、非root、root filesystem read-only、capability全削除、no-new-privileges、CPU/メモリ/PID制限つきDockerで動く。入力とpolicyはread-only、最終結果ディレクトリもcandidateからread-only。候補はtmpfsだけへ書ける。実書込み・rename・symlink経由と認証canaryを確認する。host側の固定受入が候補のJSON実出力を比較し、偽TAP・exit 0を合格にしない。

既存ci-report回帰は候補実行前に固定baselineから実行する。候補自身の任意テストを「trusted検査」と扱わない。合否policy/runtimeを変更できるhost管理者・Docker daemon自体は信頼境界に含む。この試験はcontainer escape全般の証明ではない。

```powershell
node --test scripts/development-harness/state.test.mjs
node --test scripts/development-harness/codex.test.mjs
# Windows＋固定CLIで明示実行。fake authだけでモデル課金なし。
node --test scripts/development-harness/codex-runtime.test.mjs
node --test scripts/development-harness/runtime.test.mjs
npm run verify:ci-reports
npm run verify:foundation
```

Docker回帰はruntime欠落時にskipせず失敗する。ApplicationにDocker回帰、Foundationに状態・Codex・docs/publisher回帰を接続する。PRを必要とする既存CIとローカル試験は別。実PR→CIの証拠は台帳のciと検証記録へ残す。

## 実接続へ進む前の設定差分

| 項目 | 現在 | 次の判断と必要理由 |
| --- | --- | --- |
| AW/モデル | 固定Codex 0.151.0＋既存購読の構造化source生成、AW未導入 | 別OS/CLI/AWやAPI認証は別適合検証。App/Secret作成は別承認 |
| main/発行 | active rulesets・必須4check、既存push認証を2026-11-13に確認 | この実装のための保護変更は不要。別repoへの一般化はしない |
| 実作業profile | 明示された新規比較文書1ファイル | 任意製品コードには別の許可範囲・固定検査・独立レビューが必要 |
| AW | v1.2.2はChatGPT購読認証非対応、Actions secretsなし | AWを選ぶ場合のみAPIキーまたはCopilot権限と固定版lock検証が必要。今回は設定しない |
| 費用・人の負担 | 未計測はnull | 失敗・人の引取りも含めて計測。少数fixtureの成功で削減効果を主張しない |

詳細な[実装・検証記録](../changes/issue-340-development-harness.md)を参照する。

実Issueのレビュー枠は、operatorが対象headとレビューのreferenceを持つJSONを `acknowledge-review STATE issue-N evidence.json` へ渡すことで解放する。これは文書成果物のレビュー記録で、製品採択・GitHub Issue Close・mergeではない。CLIは自動でこの記録を作らず、ci-waitや別head・取消/未確定状態を拒否する。
