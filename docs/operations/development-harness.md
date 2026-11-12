# 有限batchの開発ハーネス

[#340](https://github.com/FutureROI-DevTeam/Future-ROI/issues/340)の有限実行入口。既存Codex CLIに実装差分を生成させ、固定契約に沿って隔離検証し、候補commit・patch・Draft本文を保存する。最初の対象は同Issueの無害な整数加算fixture。実backlogの製品Issueを実装・完了したとは扱わない。任意Issueへの汎用実行、自動push/PR/merge/Closeは無効。

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

`model-input-digest.json` は入力digest/基準SHA、`model-result.json` はCLI実体・catalog・拒否probe・token利用・利用枠を保存する。raw transcript/token実値は保存しない。`results/result.json` とpatch/Draftは従来と共通。実認証でのPR→CI確認は未接続。

## 実行契約と状態

[契約例](../../scripts/development-harness/example-contract.json)には目的、有限対象、操作、受入、除外、依存、予算を含める。Issue・PR・ログ・Notionは資料であり権限入力ではない。Ready/Openを実行許可としない。`fixture-*` IDを台帳全体の固定キーとし、revisionやbatch変更で再登録できない。実Issue profileは未実装で、既存branch/PRの実照合が整うまで有効化しない。

`eligible → implementing → artifacts-ready` が現在の実行経路。失敗・取消は `awaiting-decision`。`draft-created / ci-wait / review-ready / write-unknown` の照合関数は負の回帰用であり、実GitHub接続済みではない。成果物生成をCI完了・Issue完了へ昇格させない。

初期値はworker 1、レビュー待ち1、初回＋修復3回。1 attemptは60秒を前払い予約し、うち15秒を終了・照合に残す。taskは240秒、例のbatchは480秒、batchの有効期間は登録から1時間。時間予約は失敗・再起動・担当交替・head更新でも返却しない。期限切れや上限時は次の実行を止め、終了・照合だけを行う。Docker停止/API自体の障害では時間内停止を保証せず、active枠を保持する。

local-fixture modeはモデルを呼ばず手動proposalを適用する比較入口。両modeとも新しい課金処理の上限は0円。既存セッション、レビュー、導入、電力などを含む総費用は `null`（不明）のまま記録する。正の課金上限やAPI keyで実行範囲を広げる設定は持たない。

レビュー成果物が1件あれば、次の作業を増やさず再開条件を返してexit 0。失敗や停止未確認はexit 1。固定headへの必須修正証拠がある場合だけ `repair` で再開できる。これはtrusted operatorからの入力で、候補やreview本文を自動で権限へ変換しない。

## 起動

Node、Git、既存Docker Engineを使用する。Docker Desktopが停止していれば利用者環境の通常手順で起動する。候補へGit管理領域、host HOME、Docker socket、credentialを渡さない。

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

Docker回帰はruntime欠落時にskipせず失敗する。ApplicationにDocker回帰、Foundationに状態回帰を接続する。PRを必要とする既存CIとローカル試験は別。実GitHubの検査発行元・run/attempt・head/merge checkout照合は未接続。

## 実接続へ進む前の設定差分

| 項目 | 現在 | 次の判断と必要理由 |
| --- | --- | --- |
| AW/モデル | 固定Codex 0.151.0＋既存購読の構造化source生成、AW未導入 | 別OS/CLI/AWやAPI認証は別適合検証。App/Secret作成は別承認 |
| main/発行 | main保護未確認ではなく取得時false、publisherなし | direct push・bypass・必須check省略をGitHub側で拒否する具体設定と権限を別途承認・検証 |
| 実作業profile | fixtureのみ | 対象Issueの契約、既存branch/PR/未確定操作照合、変更に応じた固定検査を追加レビュー |
| CI | 状態照合のローカル回帰のみ | 実認証Draft→CI開始・承認待ち→出所と最新attemptの取得を通す |
| 費用・人の負担 | 未計測はnull | 失敗・人の引取りも含めて計測。少数fixtureの成功で削減効果を主張しない |

詳細な[実装・検証記録](../changes/issue-340-development-harness.md)を参照する。
