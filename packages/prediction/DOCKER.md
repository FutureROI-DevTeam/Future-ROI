# Engine単体のDocker検証

**Supporting Doc / Not a Source of Truth.** #73 の既存検証を隔離したLinuxコンテナで再現する。正式な計算・T-14は[Architecture](../../docs/architecture.md#test-strategy)、既存コマンドは[package README](README.md#ローカル検証)を参照する。Web/API/PostgreSQLの起動構成、製品image、#70 の完了を用意したものではない。

## 前提と実行

Docker EngineまたはDocker DesktopのLinux daemonが稼働している環境で、リポジトリのルートから実行する。hostへのNode/npm/TypeScript導入は不要。初回buildは公式Node imageと、lockに固定したTypeScriptを公式npm registryから取得するためネットワークを使う。実行時は通信もSecretも不要。

```sh
docker build --file packages/prediction/Dockerfile.verification --tag futureroi-prediction-verification:local .
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges futureroi-prediction-verification:local
```

build contextはリポジトリのルート。[専用ignore設定](Dockerfile.verification.dockerignore)でroot lockfileとpackage内の検証用ファイルだけを送る。[Dockerfile](Dockerfile.verification)は公式Node 22.23.5 bookworm-slimをmanifest digestで固定し、既存CIの検証版を再現する。製品runtimeの最終採択とは区別する。依存はroot `package-lock.json`からこのworkspace分だけを取得し、lifecycle scriptsを無効にしてコンテナ内だけへinstallする。hostの`.env`、Git、node_modules、distは渡さず、volumeやポートも使わない。既存のDocker context・volumeは変更しない。

[実行スクリプト](scripts/verify-docker.mjs)は版表示 → 型検査 → 全数値テスト → 11接続例 → 統合済みなら30日fixture → 実Engine T-14の順に既存コマンドを呼ぶ。成功時は末尾に`PASS:`が出てexit 0となる。型検査・テスト・例・T-14の失敗は非0で終了する。出力JSONはコンテナ内の`/tmp/prediction-verification/connection.json`と`t14.json`、30日fixtureがある場合は`demo-inputs.json`へ保存する。`--rm`の通常実行では終了後にコンテナごと消える。

## JSONを取り出す場合

次はPowerShell 7で実行する手順。コンテナ名と出力先は今回用の未使用のものを選ぶ。既に同名のコンテナ・ディレクトリがある場合は再利用や削除をせず別名にする。`docker start`のコマンド成功と、検証プロセスのexitを分けて確認する。

```powershell
$predictionEvidence = Join-Path (Get-Location) 'prediction-evidence-20261004'
if (Test-Path -LiteralPath $predictionEvidence) { throw '出力先は未使用のものを選んでください。' }
$predictionContainer = docker create --name prediction-check-20261004 --network none --cap-drop ALL --security-opt no-new-privileges futureroi-prediction-verification:local
if ($LASTEXITCODE -ne 0) { throw '作成失敗。既存コンテナは操作しません。' }
$predictionCopied = $false
try {
    docker start --attach $predictionContainer
    $predictionStartExit = $LASTEXITCODE
    $predictionState = docker inspect --format '{{json .State}}' $predictionContainer | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $predictionState.Status -ne 'exited') { throw '検証プロセスの停止を確認できませんでした。' }
    docker cp "${predictionContainer}:/tmp/prediction-verification" $predictionEvidence
    if ($LASTEXITCODE -ne 0) { throw 'JSONがありません。検証ログを確認してください。' }
    $predictionCopied = $true
    if ($predictionStartExit -ne 0 -or $predictionState.ExitCode -ne 0) { throw "Engine verification failed: exit $($predictionState.ExitCode)" }
} finally {
    if ($predictionCopied) {
        docker rm $predictionContainer
        if ($LASTEXITCODE -ne 0) { Write-Warning "削除失敗。作成したID: $predictionContainer" }
    } else {
        Write-Warning "JSON未取得のためコンテナを保持します。作成したID: $predictionContainer"
    }
}
```

この`rm`は手順で新しく作った停止済みコンテナ1個だけを対象とする。JSON取得に失敗した場合はコンテナを保持し、表示されたIDから原因確認・再取得を行う。テスト前に失敗した場合はJSONが存在せず、`cp`も失敗する。T-14が500ms以上で失敗した場合は測定JSONが残るので、成功と報告せず内容とexitを確認する。

## 性能と未確認事項

T-14は既定K=200/H=1095・必要120/400/1095 DONEについて初回と追加5回をすべて500ms未満とする既存基準を使う。DockerのCPU割当・host負荷・仮想化・architectureによって所要時間が変わる。JSONには実Node版、Linux kernel、CPU/メモリ、全入力、6回の測定を残す。Docker Desktop上の成功を、採用配備先の1 vCPUや予測＋CRUD混合負荷の合格へ読み替えない。正式runtime・配置での再確認と#70 の統合は残る。

[PR #109](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/109)の30日fixtureは、そのファイルがcheckoutに存在する場合に実行して`demo-inputs.json`へ保存する。未統合のcheckoutでは未統合とログへ明示し、11接続例を検証する。fixtureをこの設定へ複製せず、統合後は同じ入口から数値テストと追加例を実行できる。fixtureが存在して実行に失敗した場合は非0となり、成功扱いにしない。

## Docker検証CI

[専用workflow](../../.github/workflows/prediction-docker.yml)はpackageまたはworkflow変更のPR・mainへのpush・手動実行で、同じbuildとコンテナ実行を行う。既存のNode matrix CIとは別で、採用runtime・Application CI・required checksを変更しない。Ubuntu検証runner、read-only権限、checkout認証非保持、10分上限を使い、Secret・host mount・ポートは渡さない。

終了状態と既存2 JSONの存在を確認する。30日fixtureのファイルがcheckoutにあれば、追加の`demo-inputs.json`も必須にする。T-14失敗でも取得できたJSONを14日artifactに保存する。保存できない場合や検証非0はjobを失敗させる。後片付けはjobが新しく作ったコンテナID1個だけを対象とし、volumeや共有contextを変更しない。CIホストの計測も正式配備条件の代わりにはしない。

daemonへ接続できないときはDockerの起動・Linux container modeを利用者が確認する。設定変更・再install・context切替を検証スクリプトから自動実行しない。依存取得が失敗した場合はimage/公式registryへの接続を確認してbuildを再実行する。失敗をstubやskipで成功へ変換しない。

設定の根拠: [Dockerのbuild contextとignore](https://docs.docker.com/build/concepts/context/#dockerignore-files)、[公式Node image](https://github.com/nodejs/docker-node/blob/main/README.md)、[docker run](https://docs.docker.com/engine/containers/run/)。
