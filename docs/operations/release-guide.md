# Future ROI リリース手順書（初めて担当する人向け）

**現行のパスワード再設定は停止中です（2026-10-24、main `2eef996` のコード確認）。** [停止方針](../../apps/api/src/auth/password-reset-policy.ts)は`PASSWORD_RESET_ENABLED=false`で、[メール設定](../../apps/api/src/config.ts)は環境変数を読む前に`disabled`を返します。停止版の起動に`RESEND_API_KEY`・`MAIL_FROM`は不要で、`MAIL_TRANSPORT=log`を残したり変更したりしても再設定は再開しません。[送信処理](../../apps/api/src/auth/mail-transport.ts)もlog/resendの送信関数を作りません。以下の「#258版」のメール準備・配送確認は、[Architectureの再開条件](../architecture.md#パスワード再設定256)と[#295](https://github.com/FutureROI-DevTeam/Future-ROI/issues/295)配下の別作業で再開が承認された版にだけ適用します。

冒頭の2026-10-12のPR状態と12-Bの2026-10-13のメール例外は当時の記録です。この追補は文書とコードの照合であり、本番の稼働SHA・環境変数・過去ログ・配送を確認した記録ではありません。既発行トークンや過去ログの削除・失効も完了扱いにしません。文書不具合は[#310](https://github.com/FutureROI-DevTeam/Future-ROI/issues/310)、現行仕様は[Architecture](../architecture.md#パスワード再設定256)を参照します。

> Supporting Artifact / Not a Source of Truth。文書作業は [#268](https://github.com/FutureROI-DevTeam/Future-ROI/issues/268)、関連する公開受入は [#83](https://github.com/FutureROI-DevTeam/Future-ROI/issues/83)。製品仕様は [Product Spec](../product-spec.md)、採択と条件は [Architecture](../architecture.md#deployment)、公開受入の正本は [release-demo.md](release-demo.md)。この文書は、既存の条件を実施順に説明する補助ガイドです。

**いまは文書準備の段階です。工程0〜2の確認を行い、工程3以降のクラウド作成・設定・実DB操作・配備は、対象と差分が承認されるまで実行しないでください。** 本書の作成では実デプロイ、アカウント作成、Secret入力、実DBのmigration／backup／復元を行っていません。公式資料を確認した日：2026-10-12 UTC。管理画面の操作は公式資料に基づく未実施の手順で、画面名や利用条件が変わったらそこで止めて確認します。

照合した main は `28fc34a453e417036ff4d1f09ebecff8c1a8445a`（tree `79c485e087480c5a3e43020d28e5682dea684ee7`）。このSHAの [Application CI](https://github.com/FutureROI-DevTeam/Future-ROI/actions/runs/38245810303) は型・テスト・build、container smoke、Vercel bundle smokeが成功、[Foundation CI](https://github.com/FutureROI-DevTeam/Future-ROI/actions/runs/38245810313) も成功しています。**実公開URL／HTTPS、実proxy、Neonの休止復帰、公開混合負荷、backupと隔離復元は未完了**です。新SHAを配備する場合はそのSHAのCIと受入を確認し直します。

同日の追確認で main は `34d749745a4493541ac1279dfd32921b1ec27c4d` へ進み、#267のREADME／構成図等が統合されています。上記基点とのアプリ・環境変数・SQL・build設定・Product Specの差分はなく、ArchitectureのD-24／D-25も維持されています。これは静的比較で、最新mainの配備・実URL受入を行ったという意味ではありません。

最終の追確認は main `55325dee7570d496d9f35f4a23e17a830dfad6cb`（#270のFE整理を含む）です。基点からAPI・環境変数・SQL・build設定・Product Spec・初期質問の必須判定関数に変更はなく、関連フォーム差分も静的照合しました。FE整理後の実画面・配備は今回確認していません。リリース時はその対象SHAのCIと実URL受入を改めて行います。

[PR #258](https://github.com/FutureROI-DevTeam/Future-ROI/pull/258) のメール再設定は、2026-10-12の再照合時HEAD `e492e55fef072d9fe317c3b6d6f869616813ebf5`、Open・未マージです。GitHub上の競合は解消され、レビュー指摘の再受入は別タスクで確認中です。返信や修正コードの存在をHuman Review完了と扱いません。照合したmainにメール再設定の実装はありません。以下の「#258を含む版」は条件付きの準備であり、PRを配備対象へ混ぜる指示ではありません。リリース当日は最新のレビュー・統合状態を確認し、修正が統合された**対象SHAの受入**を満たすまで、その機能の公開を進めません。当時のPR状態だけで公開可否を決めません。#264／#265の提出後に延期したUXは、この手順の公開停止条件へ追加しません。

## 読み方と全体の順番

「デプロイ」はコードを公開先へ置くこと、「リリース」は受入を終えて利用者が使える状態にすることです。「migration」はDBの表・列・制約の変更、「SHA」はコードの版を識別する40桁の値です。「origin」は `https://ホスト名` の組合せで、末尾の画面パスを含みません。

後半の「合成fixture」は、架空のQA入力と期待結果を用意した試験です。実利用者のアカウントや入力を使う意味ではありません。

| 今回の種類 | 進める順番 |
| --- | --- |
| 初回リリース | 0 担当・承認 → 1 無料条件 → 2 SHA・ローカル確認 → 3 環境の分離 → 4 設定／メール準備 → 5 復旧方式の準備 → stagingの6・7・8 → 5の隔離復元試験を完了 → 本番の6・7・8 → 9 公開・引継ぎ |
| 更新リリース | 0〜2を新SHAで再確認 → 10 差分と旧版互換性確認 → stagingで6〜8 → 本番の5〜8 → 9。既存Project／DBを作り直さない |
| 失敗したとき | 後続工程を止める → 11 原因別対応。アプリの旧版への切替と、DBデータの復旧を区別する |
| CD有効化後の更新 | PRをmainへSquash Merge → 12の自動配備がCI成功後に実行 → migrationがあれば12-Cで承認 → 12-Bの結果を確認。手動の工程7は使わない |

以下のURL・Project名・メールアドレスは説明用です。`example.com`・`example.invalid`・`<...>`を実設定へコピーしません。成功欄が空、未確認、判定不能なら完了にしません。1人で判断しにくい箇所は担当者と一緒に進めます。

### 初回担当は、まずこの順に開く

1. ブラウザで [GitHub #83](https://github.com/FutureROI-DevTeam/Future-ROI/issues/83) を開き、工程0の担当者と、今回公開するSHAを確認します。自分が行う操作が未承認なら、ここでは記録の準備までです。
2. 自分の端末でPowerShell 7を開きます。工程2に従って新しい専用checkoutを用意し、版・CI・ローカル確認を終えます。まだVercelのDeployは押しません。
3. 外部作成が承認されたら、DB担当と [Neon Console](https://console.neon.tech/) を開き、最初は**staging用の空DB**を作ります。接続先と直結／pooled URLの使い分けを工程3・4で確認します。
4. [Vercel Dashboard](https://vercel.com/dashboard) を開き、stagingのImport設定を準備します。工程7の正式な配備／Redeployの前に工程4の設定、5の復旧方式の準備、6のDB移行を済ませます。URL割当てのための準備用配備が必要なら、工程3の例外手順を担当者と確認します。
5. stagingを工程7で配備し、工程8で実URLから操作します。その合成データで工程5のbackup／隔離復元試験を完了してから、同じSHAで本番の設定・DB移行・配備・受入を繰り返し、責任者が工程9で一般公開を許可します。

DB・proxy・復旧の専門確認はAPI／DB担当が行います。初回担当は結果を受け取り、成功欄が埋まるまで次へ進みません。先に全文を暗記する必要はありません。

## 0. 誰が何を用意するかを決める

**操作場所：** GitHubの #83 とチームのリリース打合せ。**担当：** リリース責任者。

| 役割 | 用意するもの・責任 |
| --- | --- |
| リリース責任者 | 対象SHA、公開用途、実施日時、一般公開の承認、Known Limitations、停止・再開の判断、費用0円方針 |
| 本人アカウントの運用担当 | Vercel Hobby／Neon Freeの実プラン・権限・残量、URL、接続先、Secret管理、配備とアプリ切戻し。パスワードを3人で共有しない |
| API／DB担当 | schema差分、migration対象と互換性、TLS・pool・proxy・認証、backup方式、隔離復元、削除再適用、セッション失効、認証依存の更新担当 |
| メール／DNS担当（#258を含む版） | Resend Free、所有する送信ドメインとDNS編集権限、送信用APIキー、受信可能な同意済みQA宛先、配信障害の確認 |
| QA担当（開発者3人） | 合成専用アカウント、PC／スマートフォン、工程8の期待値と結果。本人以外の2人はURLでQAする役割と管理権限を区別する |

同じ人が複数役割を兼ねても、名前と連絡方法を埋めます。承認記録には対象Vercel Project、Neon Project／branch、URL、環境変数の**名前**、操作（作成／設定／移行／配備／復旧）、想定費用、データ範囲を記載します。Secret実値は記載しません。

**成功の確かめ方：** 全役割と対象、停止方法、公開承認者、実施範囲が記録されている。**停止条件：** 担当不在、対象不明、公開先／費用／復旧判断が未承認。文書を作ったことはこれらの承認ではありません。

## 1. 無料プランと用途を確認する

**操作場所：** 本人のVercel／Neon／Resendのプラン・Usage画面と下記公式資料。未作成なら資料の確認だけを行い、工程0の承認後に本人が登録します。

| サービス | 2026-10-12に確認した条件 | 具体的操作・成功の確認 | 停止条件 |
| --- | --- | --- | --- |
| Vercel Hobby | 個人・非商用限定。月間Active CPU 4 CPU-hours、Provisioned Memory 360 GB-hours、100万Function呼出し等。管理チーム共有はPro相当にならない。多くの上限では30日待ち。Runtime Logsは1時間 | [Hobby](https://vercel.com/docs/plans/hobby) と [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines) を用途と照合し、実プランがHobby、追加有料機能なし、利用量の残りを確認する | 賞金・制作報酬を含む非商用適合が判断できない、Pro trial／有料要求、無料枠不足。無収益だけで適合と断定しない |
| Neon Free | Postgres 1 GB/project・全体20 GB、100 CU-hours/project/月、egress 5 GB/project/月。5分無活動後に休止。履歴復元6時間・変更履歴上限あり、Monitoringは1日、SLAなし | [Plans](https://neon.com/docs/introduction/plans) で再確認し、ConsoleのPlan／UsageでFreeと残量、Settings → Postgresでhistory windowを確認する | 有料upgrade要求、復元したい時点が窓外、容量／計算／通信不足。枠不足を課金で回避しない |
| Resend Free（#258を含む版） | Transactionalは100通/日・3,000通/月、送受信が枠を消費。認証ドメインは3個まで。メール本文等の保持は30日 | [Quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) と実Usageを確認し、QA送信分も含めて残量を記録する | 送信停止・quota不足・有料機能が必要・本文内トークンの閲覧権限／保持が扱えない |

GitHub接続では、対象が `FutureROI-DevTeam/Future-ROI` であることと実際の公開範囲を確認します。[Vercel Git](https://vercel.com/docs/git) のpublic Organization対応とprivate OrganizationのHobby制限を区別します。接続できない場合、勝手なfork・リポジトリ公開範囲変更・権限拡張・Proへの切替は行いません。commit作者のLogin Connectionやfork承認による配備待ちも運用担当が確認します。

Neonのmanual snapshotはFreeの「1個」と保存費用 `$0.09/GB-month` の記載が併存します。無料例外は確認できていません。**snapshot作成を無料と決めつけず**、工程5で0円を満たす復旧方式を決めます。将来も無料・1〜2年稼働する保証はありません。通知は費用の強制上限ではありません。

## 2. 配備するコードの版を固定する

**操作場所：** 自分の端末のPowerShell 7、リポジトリroot（`package.json`と`vercel.json`がある場所）。**担当：** 実装担当。既存作業を上書きしない新しいcheckoutで行います。

端末に作業場所がない場合は、エクスプローラーで自分の作業用フォルダーを開き、その場所でPowerShell 7を開きます。次の例は新しい `Future-ROI-release` フォルダーへコードを取得する操作です。同名フォルダーがあれば止め、削除せず別名を選びます。Git／PowerShell／Nodeが使えない場合は環境担当に準備を依頼します。

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $PSNativeCommandUseErrorActionPreference = $false
  git clone https://github.com/FutureROI-DevTeam/Future-ROI.git Future-ROI-release
  if ($LASTEXITCODE -ne 0) { throw 'Clone failed; stop.' }
  Set-Location -LiteralPath ./Future-ROI-release
  $releaseSha = Read-Host 'Approved 40-character commit SHA'
  if ($releaseSha -notmatch '^[0-9a-fA-F]{40}$') { throw 'Invalid SHA; stop.' }
  git switch --detach $releaseSha
  if ($LASTEXITCODE -ne 0) { throw 'Checkout failed; stop.' }
}
```

cloneはコードの取得、Set-Locationはそのrootへの移動、switchは承認された版への固定です。`Read-Host`には工程0で確認した実SHAを入力します。読み取り用のdetached HEAD（branchに属さない状態）で問題ありません。今後の修正作業は開発運用に従う別branchで行います。

最初に `git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git rev-parse 'HEAD^{tree}'` を確認します。差分がある場合は保全して止め、別checkoutを使います。配備対象の新しいSHAは人間レビューを終えたmainから選び、PR HEADや古いSHAを自動採用しません。GitHub → Actionsで**同じSHA**のApplication／Foundationがsuccessであることを確認します。skip／pending／旧SHAの成功で代替しません。

ローカルの必要版は [package.json](../../package.json)／[mise.toml](../../mise.toml) のNode **24.22.1**、npm **11.19.0**。`node --version`、`npm.cmd --version` で確認し、異なるなら環境担当へ相談します。Vercelは24.xのmajorを選び、minor／patchを固定できないため実build版も別に記録します。[公式Node対応](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)

次は実行可能なローカル確認例です。**専用checkoutに `.env`・`.env.*`・`.local`・本番Secretを持ち込まず**、端末の環境変数にも実Secretがない新しいシェルでブロック全体を実行します。依存取得と生成物の書込みはありますが、DB CLI／cloud deployは呼びません。`npm.cmd` はWindowsのnpm入口です。

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $PSNativeCommandUseErrorActionPreference = $false
  function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)" }
  }
  function Get-CleanRevision {
    $changes = @(Invoke-Checked git @('status', '--porcelain=v1', '--untracked-files=all'))
    if ($changes.Count -ne 0) { throw 'Changes exist; preserve them and stop.' }
    [pscustomobject]@{
      Head = (Invoke-Checked git @('rev-parse', '--verify', 'HEAD')).Trim()
      Tree = (Invoke-Checked git @('rev-parse', '--verify', 'HEAD^{tree}')).Trim()
    }
  }
  $before = Get-CleanRevision
  try {
    Invoke-Checked npm.cmd @('ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund')
    Invoke-Checked npm.cmd @('run', 'typecheck')
    Invoke-Checked npm.cmd @('run', 'test', '--workspace=@futureroi/prediction')
    Invoke-Checked npm.cmd @('run', 'test', '--workspace=@futureroi/web')
    Invoke-Checked npm.cmd @('run', 'build:vercel')
    Invoke-Checked npm.cmd @('run', 'verify:vercel')
    Invoke-Checked pwsh @('-NoProfile', '-File', 'scripts/check-foundation.ps1')
    foreach ($path in @('.vercel/output/config.json', '.vercel/output/bundle-manifest.json',
      '.vercel/output/functions/server.func/.vc-config.json',
      '.vercel/output/functions/server.func/apps/api/dist/vercel.js',
      '.vercel/output/functions/server.func/apps/web/dist/index.html')) {
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing: $path" }
    }
  } finally {
    $after = Get-CleanRevision
    if ($before.Head -ne $after.Head -or $before.Tree -ne $after.Tree) { throw 'HEAD/tree changed; stop.' }
  }
  Write-Output "Local verification passed HEAD=$($before.Head) TREE=$($before.Tree)"
}
```

`ci`はlockfileどおりに依存を取得、`typecheck`は型確認、2つの`test`はEngine／Webの回帰、`build:vercel`はPrediction→API→Web→配備物の組立て、`verify:vercel`は合成fixture・loopbackで配備物を確認、Foundationは文書とリンクを確認します。APIテスト全体はDBを使うのでこの列には入れません。`verify:vercel`の一時HTTP確認は実公開先の試験ではありません。[bundle詳細](vercel-bundle.md)

配備物は現在の [Build Output API v3](https://vercel.com/docs/build-output-api/configuration) と [Function形式](https://vercel.com/docs/build-output-api/primitives) に合わせた単一Functionです。全pathをFastifyへ渡し、SPAも同じFunction内で配信します。公式の [Fastify自動検出](https://vercel.com/docs/frameworks/backend/fastify) の別設定へ置き換えず、リポジトリのentryを維持します。2 poolの [attachDatabasePool](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool) は実idle復帰の検証を代替しません。

**成功の確かめ方：** 全コマンドexit 0、最後のメッセージのSHA／treeが開始時と一致、生成物がある。manifestのruntime／bytesと `.vc-config.json` の `nodejs24.x`／handlerを確認する。**停止条件：** 非0、欠落、dirty状態、別SHA、250 MiB上限超過、Secret混入。失敗後に後続コマンドへ進まず、原因を修正した新SHAで再確認します。既存差分をreset／cleanで消しません。この文書作成では上記アプリbuild／testを再実行していません。

## 3. 初回だけ：stagingと本番を分けて用意する

**操作場所：** 本人のNeon ConsoleとVercel Dashboard。**担当：** 運用担当＋API／DB担当。**実施前提：** 工程0の外部作成・権限変更・接続の承認。

stagingは公開前の合成データ確認環境、Productionは利用者向け環境です。PreviewはGit branch等の確認用配備で、Productionと同じDBに接続しません。

1. 運用担当が環境対応表を用意します。記入例は `staging: Vercel future-roi-staging / Neon future-roi-staging`、`本番: Vercel future-roi / Neon future-roi-production`。**安定したURLを持つ2 Projectと別DBを用いる運用案**で、未採択・未作成です。既存環境があるならその分離方式を使い、異なる方式はAPI担当がURL・Cookie・DB・Secretの分離を説明して承認を得ます。
2. NeonでCreate projectから、承認された名前・region・PostgreSQL版・database／roleを選びます。名前例 `future-roi-staging`、DB名例 `futureroi`。ローカル／CIはPostgreSQL 18系ですが、実Neonの提供版と互換性は作成前に確認します。VercelとNeonのregionの組合せも記録します。Neon Auth／Functions等はこのアプリの設定に追加しません。認証はAPI内のBetter Authです。
3. VercelでAdd New → Project → Import Git Repositoryから対象リポジトリを選びます。Root Directoryはrepository root（`apps/web`や`apps/api`へ変更しない）、Framework Presetは **Other**。Install Commandは `npm ci --include=dev --ignore-scripts --no-audit --no-fund`、Build Commandは `npm run build:vercel`。`vercel.json`との重複設定が違わないことを確認し、Output Directoryの独自overrideを追加しません。Node.js Versionは24.x、regionは承認値です。
4. **新Projectで実URLがまだ分からない場合の初期化：** 運用担当が、対象Projectの作成と「Secret・DB接続を渡さない準備用配備」を承認記録に含めます。**Deployを押す前に**、新Projectへ適用されるDeployment Protectionのdefaultを、Vercel Authenticationの **All Deployments** とする承認済み設定を確認します。default設定の場所は本人の管理領域のSettings → Deployment Protectionです。設定が見つからない／適用を確認できない場合はDeployを押さず停止します。[公式の初回保護とdefault](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)。Import画面へ実値を入力せず、上記のroot／build設定でDeployを押してProjectを作ります。Project OverviewのDomains、またはSettings → Domainsで安定したHTTPS originを記録します。設定不足の起動失敗やReady表示は、アプリ受入成功ではありません。
5. 作成後、対象ProjectのSecurity／Settings → Deployment Protectionで、Vercel Authenticationが **All Deployments** に保存され、**production domainを含む**ことを再確認します。**Standard Protectionはproduction domainを除外するため代用できません。** 2026-10-12の[公式保護](https://vercel.com/docs/deployment-protection)と[料金表](https://vercel.com/docs/deployment-protection/usage-and-pricing)ではAll DeploymentsはHobbyを含む全プランで追加保護料金なしですが、実アカウントでの利用は未確認です。upgrade／課金が求められる、選べない、保護範囲が不明なら、本番Secret／DBを渡さず停止し、既存Projectは11-AのPauseを維持します。未許可のシークレットウィンドウで**実origin**がVercel認証等に拒否され、許可したQA担当だけが通ることを確認してから工程4・6・7へ進みます。Vercel保護画面はアプリhealthの成功ではありません。
6. 上の準備用初期化はstagingでも新しい本番Projectでも同じです。実値・本番DBを渡さない状態だけで行い、staging用Projectと本番用Projectを取り違えません。本番の実設定・DB移行・正式配備は、staging受入と工程5の復元試験完了後です。既存Projectなら準備用配備は行わず、実originと設定入口を読むだけにします。任意のPreviewへ本番Secretを配る設定にしません。

**成功の確かめ方：** 環境対応表に実Project／DB／branch／role／region／安定したHTTPS originがあり、staging・Previewと本番のデータ・資格情報が分離されている。**停止条件：** 本番DBの複製を合成データ扱いする、URLや接続先が不明、許可外の権限・課金が必要、QA前の公開を防ぐ方法が不明。初期DeployのReady表示だけで一般公開しません。

QA担当へのVercel閲覧許可も運用担当が準備します。[公式Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)ではHobbyの外部ユーザー許可は1人/accountで、3人への同時許可を仮定できません。必要なQAアクセスを費用0円内で用意する方法・許可対象・取り消し方が未定なら停止します。保護を外す／アプリのログインだけで代用する／Secretを共有する方法で通しません。保護された非本番URLでの試験は、そのURLに`BETTER_AUTH_URL`等を合わせて行い、本番実originの受入とは別に記録します。

## 4. 設定を入れる（環境ごとに別々に）

**操作場所：** NeonのConnect、Vercel Project → Settings → Environment Variables。**担当：** 運用担当＋API／DB担当。設定する**ProjectとEnvironment**を毎回読み上げます。staging用ProjectのProduction欄はstagingの設定です。

NeonのConnectで対象branch・database・roleを選び、Pooled connectionのON／OFFで2種類のURLを確認します。通常APIは**pooled**、migration／dumpは**direct（直結）**です。直結をそのCLI実行だけの `DATABASE_URL` へ渡します。現CLIは `DIRECT_DATABASE_URL` を読みません。TLSのprovider推奨パラメータを保持し、証明書検証を無効にする回避策は使いません。[公式pooling](https://neon.com/docs/connect/connection-pooling)

| 名前 | 入力値の安全な例・意味 | 成功の確認／停止条件 |
| --- | --- | --- |
| `NODE_ENV` | `production`（公開runtime必須） | Projectのbuildとruntimeを確認。developmentのSecret自動生成へ落ちるなら停止 |
| `DATABASE_URL` | 書式だけ：`postgresql://<role>:<password>@<pooled-host>/<db>?sslmode=require`。実値はNeonから、staging／本番別に取得 | branch・DB・role・TLSを担当者2人で照合。URLを画面共有・Issue・ログへ出さない。書式例で接続しない |
| `BETTER_AUTH_SECRET` | 安全な例は値を記載しない。32文字以上の暗号学的乱数を承認済みSecret管理経路で準備 | 環境別のSecret。値を標準出力やGitへ保存しない。既存本番値を理由なく変更しない |
| `BETTER_AUTH_URL` | 書式例 `https://future-roi.example.com`。実際に利用する安定したHTTPS origin | `/api`／`/login`／queryを含めない。Previewでもその実originへ合わせる。別origin・HTTPなら停止 |
| `BETTER_AUTH_ALLOW_HTTP` | 公開ではunset（設定しない） | `1`が残っていたら停止。local Composeの例外をコピーしない |
| `AUTH_TRUSTED_ORIGINS` | 通常unset／空。必要時だけ承認された**完全一致origin** | 追加先は認証と状態変更APIの許可先になる。wildcardや全Preview許可を加えない。CORSの代用品にしない |
| `TRUST_PROXY_HOPS` | 既定`0`、許容0〜10。**実測前の公開用推奨値は未定** | Vercelだから`1`と推測しない。工程8で転送経路とclient IP、偽装耐性を確認できなければ公開停止 |
| `AUTH_SIGN_IN_MAX`／`AUTH_SIGN_UP_MAX` | 未設定なら各`5`（1接続元60秒） | 会場共有回線の3人QAと防御を確認。無制限化で通さない |
| `EVALUATION_ENABLED`／`MILESTONE_CALIBRATION_ENABLED` | 公開は両方unsetまたは`0` | 既定OFFを維持。OFFでも全migrationは適用する。`1`なら別承認と下記運用が必要 |
| `LOG_LEVEL` | 既定`info`。公開前にログの秘匿を確認 | debugで本文等を取得しない。レベル変更だけでトークン除外済みにしない |

`HOST`／`PORT`／`WEB_DIST`／`SHUTDOWN_TIMEOUT_MS`は常駐server側の設定です。Vercel entryはbundle内Webを使い、外部`WEB_DIST`に依存しません。`LOCAL_DB_PASSWORD`／`LOCAL_APP_PORT`／`LOCAL_DB_PORT`はlocal Compose専用で、公開先へコピーしません。Webは相対 `/api` とsame-origin Cookieを使い、公開API URLを入れる新しいFE変数はありません。Secretを `VITE_*` へ入れません。[実config](../../apps/api/src/config.ts)・[Vercel entry](../../apps/api/src/vercel.ts)・[Web HTTP](../../apps/web/src/api/http.ts)

### #258を含む版のメール準備

**適用条件：再設定の再開が承認された版だけ。** 現行停止版ではこのメール準備を起動条件にせず、メールサービス・Secret・DNSを本書だけを根拠に追加しません。配送準備は[#300](https://github.com/FutureROI-DevTeam/Future-ROI/issues/300)、停止解除は[#302](https://github.com/FutureROI-DevTeam/Future-ROI/issues/302)の受入・承認を別に追います。

**操作場所：** Resend Dashboard → Domains／API Keys、所有ドメインのDNS管理画面、Vercelの対象環境。**担当：** メール／DNS担当＋運用担当。実施はPR統合後の承認済みSHAだけで行います。

1. Domains → Add Domainで所有するドメイン／サブドメインを登録します。書式例 `account.example.com`。Resendに表示されたSPF／DKIM等のDNSレコードを、その画面の値どおりにDNS担当が設定します。既存MXを上書きせず、表示された用途を確認します。[認証ドメイン](https://resend.com/docs/dashboard/domains/introduction)
2. Resend上で送信用ドメインがVerifiedになったことを確認します。送信用APIキーを承認された範囲で発行し、Vercelへ `MAIL_TRANSPORT=resend`、`RESEND_API_KEY`、`MAIL_FROM` を環境別に設定します。送信元の書式例は `Future ROI <no-reply@account.example.com>`。実所有・認証済みドメインへ置換します。`AUTH_RESET_MAX`は未設定なら5/60秒です。
3. 工程8で、Resendアカウント本人以外の**受信に同意したQA宛先**へ実配送を確認します。宛先欄の例 `qa-a@example.invalid` は説明用で、架空アドレスに送信しません。`onboarding@resend.dev`はResendアカウント本人宛ての試験に制限され、一般宛先の受入を代替しません。[resend.dev制限](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)

**起動成功と配信成功は別です。** #258の [loadMailConfig](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/config.ts) はキーの非空と送信元の存在・形式を検査します。キーの有効性、ドメイン認証、一般宛先配送を検査しません。未認証でも起動する場合があります。同HEADの [release-demo.md](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/docs/operations/release-demo.md) は、旧版にあった「認証済みドメインがないと起動しない」という説明を修正済みです。

`MAIL_TRANSPORT=log`は**隔離ローカル確認専用**で、公開／共有Preview／staging／本番では使用しません。#258ではproductionでも`log`を選べてしまうため、起動が拒否してくれると期待しないでください。本文に再設定トークンを含むURLを出力します。URLは本人確認の資格情報として扱い、ログ・スクリーンショットを共有しません。Resendのtracking・本文保存・閲覧権限も再設定リンクの取扱いとして確認します。

**この設定工程の成功：** 対象環境の変数名と設定条件を2人で照合し、実値を含めない記録を残す。再開が承認された#258版だけキー・送信元・Verifiedの準備まで確認する。停止版ではメール資格情報や配送の未準備だけをアプリ全体の起動停止条件にしない。**設定時の停止条件：** URL／DB／Secretの環境取り違え、公開HTTP例外、再開版での`log`／未認証ドメイン、未マージPRを含む配備。再開版の実配送は配備後の工程8-Cで行い、配送未確認は**再設定の一般公開への停止条件**です。設定済みでも配信済みとは扱いません。

### 既定OFFの2機能を有効化したい場合

`EVALUATION_ENABLED`と`MILESTONE_CALIBRATION_ENABLED`は通常リリースで有効化しません。有効化にはそれぞれ目的・対象・本人の明示参加・公開受入・運用担当・削除方法の別承認が必要です。評価参加と途中到達補正参加は別同意です。build版（専用build変数または `VERCEL_GIT_COMMIT_SHA`）、保有期限、撤回／Goal・user削除、期限切れデータの**物理削除**、backup内の保持と復元後の再削除を確認します。read時の期限filterは物理削除ではありません。既存purge CLIには明示確認引数がありますが、定期実行・担当・backup削除の運用は未採択です。今回の公開コマンドにpurgeを混ぜません。[評価policy](../../apps/api/src/evaluation/policy.ts)・[補正policy](../../apps/api/src/milestone/policy.ts)・[評価purge](../../apps/api/src/evaluation/purge-cli.ts)・[補正purge](../../apps/api/src/milestone/purge-cli.ts)

## 5. 復旧方式を準備し、stagingで隔離復元を試す

**操作場所：** #83の復旧記録、Neon Console、承認済みの隔離復元環境と保管先。**担当：** API／DB担当＋責任者。

初回は、まず下記1〜2で**方式・担当・費用・試験の承認を準備**します。合成専用の空staging DBへ工程6のmigration、工程7の配備、工程8-Aの業務確認を行ってから、その合成データを使って下記3〜4のbackup／隔離復元試験を完了します。**本番の工程6へ進む前に3〜4まで完了**させます。更新版は、本番migration前に現版のbackupと復元確認も必要です。

1. 「どの時点までの損失を許すか（RPO）」「何時間で戻す必要があるか（RTO）」、backup方式・取得頻度・暗号化・閲覧者・保管先費用・保持／削除期限を決めます。値の例 `RPO: 未定、RTO: 未定` は未完了です。勝手に数値保証を置きません。
2. Freeの6時間のhistory windowだけで要件を満たすか確認します。Neon Consoleで保持窓と対象branchの復元可能時刻を読む操作は、backup取得とは別です。manual snapshotの費用確認なしにCreateを押しません。直結の`pg_dump`を別保管する案も、実施・保管先・復元試験が承認されるまで実行しません。[Neon Plans](https://neon.com/docs/introduction/plans)
3. 採択した方法で合成データをbackupし、**本番とは異なる隔離先へ**復元する試験を別承認で行います。担当者は採択方法・接続先を確認した手順を用意します。PITRならNeonのBranches → Create branchの過去時点指定による**新branch**を候補にします。親branch、UTC時刻（書式例 `2026-10-12T00:00:00Z`）、新branch名例 `restore-drill-20261012`、費用・保持窓を確認します。現在のConsoleで過去時点指定ができない場合は停止し、公式手順を再確認します。[Branching](https://neon.com/docs/introduction/branching)
4. 隔離先で `db:check` と合成Goal保存→Today再取得を確認し、復元前後の件数・保存量・削除済みデータ・認証の扱いを記録します。具体的な復元コマンドは方式未採択のため本書では確定できません。[既存復旧の受入](release-demo.md#運用盲点の受入手順83) へ担当・手順・実測を残します。

**成功の確かめ方：** 初回stagingへ進む時点では1〜2と試験承認、本番へ進む時点ではbackupの取得時刻、保存先、対象schema、隔離先、復元結果、採択RPO／RTOと実測、工程11の再開条件が記録されている。**本番への停止条件：** backup未取得、復元未試験、0円が確認できない、旧認証失効／削除再適用を行う手段が未整備。初回も利用者のデータを預かる前に復旧準備を完了します。本書の机上手順は復元成功の証拠ではありません。

## 6. DBを確認してからmigrationを行う

**操作場所：** 承認済みの専用端末・新PowerShell 7、工程2と同じSHAのリポジトリroot。**担当：** API／DB担当。Node／locked dependencies／Prediction buildを工程2で準備済み。`.env`を置かず、画面共有・transcript・shell録画なしで行います。

DB変更の前に、Neon ConsoleでProject／branch／DB／roleを担当者2人で確認します。migration用は直結URLです。次は**将来の承認済み実操作用**の例で、今回実行していません。接続URLをコマンド文字列に貼らず、伏せ字の入力からそのchild processだけに渡します。端末の管理者はprocess環境を読めるため、承認済み端末だけを使います。

最初にこの関数を1回だけ貼り付けます。`check`は読取り、`migrate`はDBを書き換えます。未知のmodeは拒否し、接続値は終了時に解除します。既存`DATABASE_URL`を持つシェルなら止め、新しい専用シェルへ移ります。

```powershell
function Invoke-ReleaseDbCommand {
  param([Parameter(Mandatory = $true)][ValidateSet('check', 'migrate')][string]$Mode)
  $ErrorActionPreference = 'Stop'
  $PSNativeCommandUseErrorActionPreference = $false
  if (Test-Path Env:DATABASE_URL) { throw 'Use a fresh shell without DATABASE_URL.' }
  $secret = Read-Host 'Approved DIRECT database URL (hidden)' -AsSecureString
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) { throw 'Empty database URL.' }
    if ($Mode -eq 'check') {
      $env:SCHEMA_CHECK_TIMEOUT_MS = '30000'
      $env:SCHEMA_CHECK_QUERY_TIMEOUT_MS = '5000'
      npm.cmd run db:check
      $code = $LASTEXITCODE
      Write-Output "db:check exit=$code"
      if ($code -notin @(0, 1)) { throw 'Schema result unavailable; stop.' }
    } elseif ($Mode -eq 'migrate') {
      npm.cmd run db:migrate
      if ($LASTEXITCODE -ne 0) { throw 'Migration failed; stop.' }
    } else {
      throw 'Unknown mode; stop.'
    }
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:SCHEMA_CHECK_TIMEOUT_MS -ErrorAction SilentlyContinue
    Remove-Item Env:SCHEMA_CHECK_QUERY_TIMEOUT_MS -ErrorAction SilentlyContinue
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $secret.Dispose()
  }
}
```

### 6-A. 読取りだけの事前確認

```powershell
Invoke-ReleaseDbCommand check
```

入力はNeonから確認した**対象環境の直結URL**。結果の完全なJSONと `db:check exit=...` を確認します。

| 結果 | 次の操作 |
| --- | --- |
| exit 0／`status: ok` | 対象checkoutの履歴・認証schemaの検査範囲内で差分なし。更新でmigration差分がなければ6-Cへ。業務の実受入は未完了 |
| exit 1／`status: drift`、初回の空DB | `empty_database`・未適用SQL・認証table不足が**予定どおり**かAPI担当が確認して6-Bを承認。exit 1を無条件に成功としない |
| exit 1／更新DB | `app.pending`が承認された追加SQLと一致するか確認。`checksumMismatch`・`unknownHistory`・想定外の認証差分なら停止 |
| exit 2 | 引数・設定誤り。接続先／準備を直して6-Aをやり直す |
| exit 3／`unavailable`、timeout、JSON欠落 | 判定不能。接続・TLS・権限・出力経路を調べ、完全な結果が得られるまで停止 |

`db:check`は読取り専用で、全業務表・型・制約・index・全データの完全監査ではありません。healthは`select 1`なので空DBでも200になり得ます。どちらもGoalの保存成功を証明しません。[schema-check](../../apps/api/src/db/schema-check-cli.ts) と [限界](../DEVELOPMENT_GUIDE.md#起動)

### 6-B. 承認された差分だけを移行

**実行前に6-Aと、工程5の該当する前提を確認します。** 初回の空stagingは5の1〜2と試験承認、本番は5の隔離復元試験まで完了している必要があります。更新では書込み停止・実行時間帯・旧アプリとの互換性を工程10で決めます。

```powershell
Invoke-ReleaseDbCommand migrate
```

これは既存の `npm run db:migrate` を呼び、**認証 → アプリ**の順に実行します。認証は固定Better Auth 1.7.7のschemaから、アプリは [migrations](../../apps/api/migrations/) の名前順・1ファイル1transactionで適用し、`schema_migrations`へ名前とSHA-256を記録します。2つの0005や番号の飛びを理由に改名しません。Vercel entry／buildではmigrationを行わないので、この別実行を省略しません。[runner](../../apps/api/src/db/migrate.ts)

**成功の確かめ方：** exit 0、結果JSONの `target: all`、`auth.tablesCreated`／`columnsAdded`、`app.applied`が予定差分と一致。**停止条件：** 非0、checksum不一致、想定外のDDL、長時間のlock待ち。接続は5秒上限ですがmigrationのlock／DDLにはHTTPの5秒上限を使わず無期限待ちになり得ます。担当者が承認した最大待ち時間で中止し、原因と適用履歴を確認します。無条件の再実行や他processの強制終了はしません。

[0002](../../apps/api/migrations/0002_goal_record_start_date.sql) は未適用DBに既存Goalがあると拒否します。削除や日付の自動補完で通さず、既存データの移行判断へ戻ります。1ファイル失敗時のtransaction rollbackは、それ以前に成功した認証DDLやSQLまで戻す意味ではありません。自動down migrationはありません。

### 6-C. 移行後の確認

もう一度 `Invoke-ReleaseDbCommand check` を実行し、**exit 0＋完全なJSONの`status: ok`**、`app.pending`／`checksumMismatch`／`unknownHistory`が空、認証の必要table／columnがそろうことを確認します。警告は固定版の既知警告かAPI担当が照合します。繰返しmigrationのno-op確認はstagingの合成DBで行い、本番に試験目的の反復を足しません。

**停止条件：** 判定不能・履歴／schema不一致。配備へ進まず保全します。出力はSecret・SQL例外原文・個人入力を除いた要約だけを共有し、専用シェルを閉じます。

## 7. 配備する（まずstaging、その後に本番）

**操作場所：** Vercel Dashboardの対象Project → Deployments。**担当：** 運用担当。初回は工程3で承認したImport、設定後の再配備は対象deploymentの `… → Redeploy` を使います。[公式配備管理](https://vercel.com/docs/deployments/managing-deployments)

1. 直前に対象Project／Environment／commit SHA、工程6-C、工程5の復旧記録と、工程3の**実production domainを覆う保護・QAアクセス**を照合します。Standard Protectionだけなら配備／Resumeを進めず停止します。初回の空stagingは方式準備と試験承認を前提に配備し、合成データができてから隔離復元を完了します。本番は復元試験完了が前提です。初回はDeploy、本番更新は工程10の公開開始タイミングを確認します。Git接続ではproduction branchへのpush／mergeが**自動本番配備の引金**になり得ます。試験のためにmainへpushしません。
2. `vercel.json`のInstall／Build Commandが使われ、3 workspaceとFunctionがbuildされることをBuild Logsで確認します。設定だけ直した場合のRedeployは、そのdeploymentのソース版を使う操作です。**新しいコードへ切り替わると推測せず**、SourceのSHAを確認します。環境変数変更は次のdeploymentへ適用されるため、保存だけで終えません。
3. Readyになったdeploymentの詳細でSourceのSHA、Environment、domain、実Node版、bundle情報を記録します。実URLは詳細画面のDomainsから取得し、推測した `project.vercel.app` を使いません。generated deployment URLと安定した公開originを区別し、認証受入は `BETTER_AUTH_URL` と一致する実originで行います。[生成URL](https://vercel.com/docs/deployments/generated-urls)
4. 工程8をstagingで完了します。同じSHAを本番DB・本番Secret・本番originで別配備し、本番でも工程8の必要項目を再確認します。staging用のDB／Secret／URLを持つPreviewをそのままPromoteしません。一般利用を許可するアクセス設定変更は工程9です。

**成功の確かめ方：** Ready＋承認したSHA／環境一致＋実URLで工程8成功。**停止条件：** build失敗、runtime初期化500、別SHA、DB違い、origin違い、QA前に一般利用へ開く、保護画面で判定不能。Ready／build成功だけで公開成功にしません。画面名が公式説明と異なる場合も操作を止めます。

## 8. 実URLで受け入れる

**操作場所：** staging／本番それぞれの実HTTPS URL、ブラウザ開発者ツール（F12 → Network／Application）、Vercel Logs／Usage、Neon Monitoring。**担当：** QA3人＋API／DB担当。**この工程は未実施です。** 本番へのアカウント・Goal作成や試験要求も、合成QA範囲を工程0で承認してから行います。

共通記録は「環境、SHA、実URL、日時、担当、操作、期待値、結果、停止理由」です。Cookie値・password・token・メール本文・DB接続値を記録しません。Networkの全体HARやCopy as cURLは資格情報を含み得るので共有しません。

### 8-A. 画面とAPI

| 順 | 具体的操作・入力例 | 成功の確かめ方 | 失敗時の停止条件 |
| --- | --- | --- | --- |
| 1 | 実originの `/` と `/api/health` を別タブで開く | HTTPS証明書エラーなし。healthは200で`{"status":"ok","database":"ok"}`。トップは登録・ログインの入口 | 503、HTMLがAPIに返る、HTTP、証明書エラー、Vercel保護画面をアプリ成功と誤認する |
| 2 | ログイン前に `/goals` を開く。同じブラウザで `/api/goals` を開く | 画面はログインへ、APIは401 JSON。私的APIは`Cache-Control: no-store` | 未認証でGoalが読める、HTMLの200、私的応答の保存許可 |
| 3 | 「登録してはじめる」。受信可能な合成QA専用アドレス、管理した8文字以上の別passwordを入力 | 登録後は `/goals`。再読込後もログイン状態。Networkの認証CookieはSecure／HttpOnly／SameSite等が実HTTPS経路で適切 | ログインloop、別originへ送信、Set-Cookieが欠落。Cookie値を証拠へ貼らない |
| 4-A 負例 | Goal作成画面でタイトル`QA 学習`、単位`回`、必要量`10`、1回量`1`、初期量`0`を入力し、初期質問2問を未選択のまま保存を押す。次に初期質問1だけ「回答しない」を選んで、質問2を未選択のまま保存を押す | どちらも**想定された保存拒否**。未選択の問にエラーが出て、最初の未選択の問へ移る。Goalは作成されず、入力は保持される。これはリリース障害ではない | 未選択でも作成される、入力が消える、未保存を保存済み表示する |
| 4-B 正例 | 同じ量の入力と実timezoneを確認し、**初期質問1＝「回答しない」、初期質問2＝「回答しない」**をそれぞれ明示的に選択してから保存する。「回答しない」以外の選択肢を選ぶ場合も両問に1つずつ必要 | **両問選択後に保存成功 → Goal一覧／対象GoalのTodayへ到達**。再読込・再ログイン後も同じGoalと設定。「回答しない」は有効な選択で、予測材料の不足表示を妨げない。回答を選ぶ別ケースでは保存／訂正と出所表示も確認 | 両問選択後も保存できない、保存量・timezone・revision不一致、他人の値が見える |
| 5 | 今日DONEを量`1`で保存、Todayを再取得。SKIPPEDへ変更し量が加算されないことも確認 | 保存結果と表示・再読込が一致。材料不足時は不足表示を維持 | 保存失敗、二重加算、古い応答の採用、根拠のない予測成功判定 |
| 6 | 昨日補完は開始日が昨日以前の**合成専用Goal**で行う。初回の今日作成Goalへ過去日を無理に書かない | 昨日未記録→補完→明示的訂正→Todayが一致。日付境界はGoal timezoneに従う | 不正な過去日書込みで試験を通す、今日／昨日を端末UTCだけで判定する |
| 7 | 上のQA用Goalのタイトルを`QA 学習（編集）`へ変更。保存済み回答がnullなので、**初期質問1と2で「回答しない」をそれぞれ選び直してから保存**し、一覧／Todayを確認。その後QA用Goalを削除する。PCとスマートフォンで同じ実URLから操作 | 両問選択後の編集保存が成功し、再取得・一覧／Todayで反映。削除後の旧Goalは404。編集で未選択の問が残る場合も保存拒否が正常 | 選択済みの編集が保存できない、未選択のまま保存される、所有者混同・操作不能。延期UXを新たなMustとして追加しない |
| 8 | アカウントメニューからログアウト。API担当が隔離fixtureで古いCookie・期限切れも確認 | UIはログインへ、元セッションで保護API401。新ログインは成功 | 古いセッション再利用、DB故障時のlogoutを成功扱い。runtime／DBの実故障注入は別承認 |

初期質問は [P-24](../product-spec.md#p-24-初期質問の必須化とtodayの編集入口259) により作成・編集の両方で選択が必須です。「回答しない」を押すことと、何も選ばないことは異なります。保存値がnullの問は編集時に未選択で始まるため、再び選びます。単位／1回量の変更により回答欄が操作できない間の例外は正本に従い、QAのために勝手に値を補いません。[priorChoiceError](../../apps/web/src/features/goals/goal-form.ts) は未選択の保存を止めます。所有者分離・隔離復元・切戻しの確認で**ブラウザから**Goalを作成／編集するときも、4-B／7の両問選択を含めます。API／DB fixtureやSeedへ新たな必須API値を追加する指示ではありません。この受入は未実施で、今回の修正は仕様・コードの静的照合です。

昨日用データが必要なら [Demo Seed](demo-seed.md) を**合成専用アカウント**だけに別承認で使用します。認証済み `GET /api/auth/get-session` の `user.id` を担当者が確認してから、rootで `npm run db:seed:demo -- --user-id '<確認したID>' --timezone Asia/Tokyo` を実行する既存入口があります。**これは呼出し形の紹介で、単独では接続値を準備しません。** 工程6の関数は終了時に`DATABASE_URL`を解除するため、そのまま実行できません。DB担当が承認した接続先を伏せ字入力から一時的に渡し、終了時に必ず解除する安全な専用実行手順を用意するまで、このコマンドを実行しません。`.env`へ本番値を持ち込まないでください。

Seedの成功はexit 0・専用2Goal／60履歴と当日の基準日、その後のWeb往復で確認します。再実行はその2Goalと記録を削除・新IDへ置換するので、通常データのresetやDB復旧には使いません。

### 8-B. 認証・HTTPS・proxy・ログ

| 項目 | 操作・確認場所と具体的確認 | 成功の確かめ方／停止条件 |
| --- | --- | --- |
| 所有者分離 | QA A／Bの別アカウント・別ブラウザで、8-Aの4-Bと同じく初期質問2問をそれぞれ選んでGoalを作成。API担当がstagingの合成fixtureでBからAのGoal GET／変更を要求 | 各本人の作成は両問選択後に保存・一覧／Today到達。他人のGoal要求は404、Aの値・存在を漏らさず変更なし。失敗なら停止。Cookieを共有端末ファイルへ保存しない |
| Origin／CSRF | Networkで正規保存が同一originであることを確認。API担当が合成fixtureで認証済み変更要求へ別origin（例 `https://other.example.invalid`）／Origin欠落／same-site別originを与える | 正規保存は成功、業務APIの不正Originは403 `ORIGIN_REJECTED`。認証endpointのOrigin拒否も確認。許可originを増やして回避しない |
| 全Set-Cookie・cache | 登録／ログイン／セッション更新／logoutのNetworkで、複数Set-Cookieを含むfixtureを実経路に通し全件転送をAPI担当が確認 | 個数・属性がfixtureの期待値と一致。private APIは成功・失敗ともno-store、ログアウト後に他人のcacheが出ない。未試験なら停止 |
| proxy・回数制限 | API担当が実hop・header形式・実client IPを機密を出さないfixtureで記録し`TRUST_PROXY_HOPS`を決める。別接続元と偽造X-Forwarded-For／内部IP header、複数instance・再起動を確認。QA3人で会場共有回線を確認 | 偽装で上限回避できず、正当利用を不必要に巻き込まない。既定は60秒6回目等で429、整数の待ち時間と経過後成功。実fixture・測定手段は未整備なら担当が準備して停止を解除する。hop推測で合格にしない |
| トークンとSecretのログ除外 | API担当が配備対象SHAの通常infoログ・例外ログの秘匿と合成回帰の成功証拠を照合。合成文字列`release-qa-token`を `/api/auth/reset-password/release-qa-token` と `/reset-password?token=release-qa-token` で使い、ログを内部検索。POST `/api/auth/reset-password?token=release-qa-token` も確認。Vercelのruntime／requestログ・analytics等の保存先も確認 | **各URLのtokenがログに残らない**。password・Cookie・Authorization・DB URL・再設定本文も残らない。最新#258は [req serializer](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/app.ts) で [redactLogUrl](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/http/log-url.ts) を呼び、パス／queryのtokenを除く実装と [合成ログ回帰](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/tests/password-reset.test.ts) がある（今回の確認は静的読取りのみ）。これは#258候補HEADの確認記録。現行mainにはログ除外実装と#285の停止方針がある。停止中も対象SHAの回帰とhosting側ログ確認を別に行い、過去ログが消えたとは扱わない。再開版はそのSHAで秘匿・配送を確認するまで公開停止。[Fastify Logging](https://fastify.dev/docs/latest/Reference/Logging/) |

現在のコードにこれらの実公開試験用入口がそろっているとは確認していません。API担当が合成fixture・測定経路・中止方法を #83 で準備し、結果がない行は未確認のまま止めます。実ユーザーのtokenを使って漏えいを再現しません。既存header redactや`LOG_LEVEL`の変更だけでログ安全性を合格にしません。

初回担当からの依頼例：「このSHAと実URLについて、8-B・8-Dの試験手順と結果を #83 へ記録してください。未整備なら一般公開を止め、通常の画面QAから先に進めます。」

### 8-C. #258版の再設定メール

**現行停止版では再設定の要求・保存は503 `RESET_PASSWORD_DISABLED`、画面は停止案内が期待値です。** メール配送と再設定成功を要求する下記の手順は、停止解除が承認された版だけに適用します。停止版の503を配送障害と取り違えず、Secret設定や`MAIL_TRANSPORT`の変更で解除しません。公開先に停止版が反映されたかの確認は、対象SHAを特定して別途行います。

**前提：** レビュー・統合後のSHA、工程4のVerified、8-Bのトークン除外が完了している。

1. QA専用アカウントでログアウト → 「パスワードを忘れた方」 → 登録したQAメールを入力 → 要求します。
2. Resendの送信結果とQA受信箱／迷惑メールを確認します。アカウント本人以外の同意済み一般宛先で確認します。画面の「メールを送りました」やAPIの200だけでは成功にしません。最新#258は送信を応答から切り離し、Vercelでは`waitUntil`、常駐serverでは終了時の追跡待ちへ渡します。送信失敗はlogへ出ても要求は200となり得るため、実配送を別に確認します。[固定HEADのauth設定](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/auth/options.ts)
3. メール内リンクから実HTTPS originへ移り、新passwordを保存します。旧passwordでログイン不可、新passwordでログイン成功、使用済み・無効・期限切れリンクで再要求へ誘導されることを確認します。さらに端末Aをログイン状態に保ったまま端末Bで再設定し、Aの旧Cookieでは保護APIが401・セッションが無効になること、ログイン済みブラウザでもメールリンクから再設定フォームへ到達できることを確認します。最新#258には既存session失効設定と対応する回帰がありますが、公開経路の成功証拠は別です。実トークンURL・メール本文は共有証拠へ載せません。

**成功：** 実配送・リンク到達・再設定往復・無効化・ログ秘匿を記録できる。**停止：** 送信403／quota停止／bounce／未着／間違ったorigin／tokenがログや共有資料に残る。配送障害の確認担当・方法がない場合も公開停止。今回はResend実配送・公開リンク到達とも未検証です。

### 8-D. DB休止復帰・負荷・無料予算

1. Neon MonitoringとVercel Usage／Logsを開き、app 5＋auth 2のpoolを**Function instance数**込みで合算し、migration等の別接続も足して実DB上限と照合します。全7接続だけと見積もりません。
2. stagingへの定期pingを止め、Neonが実際にIdle／休止したことを確認してから、最初のhealth・ログイン・Goal読取り／保存を行います。Freeは5分無活動が目安ですが、画面で休止を確認します。poolのidle解放と再接続、5秒timeout時の表示と再操作を記録します。DBを頻回に起こす監視で休止問題を隠しません。
3. API担当が #83 の承認済み公開用測定計画で、3人の保存＋Today＋session混合負荷と両予測入口を確認します。T-14入力 `120,400,1095`、追加条件 `548,700,800` を分け、最大同期ブロック・各p95・CPU・経過時間・メモリ・接続数・失敗率・試行数を記録します。localhost専用の既存mixed-load harnessへ公開URLを入れる手順はありません。測定経路未整備なら試験未完了です。
4. T-14の500ms未満と [D-28](../architecture.md#d-28) の再検討目安（同期ブロック500ms以上、他操作p95 1秒以上等）を照合します。D-28を新しい公開SLOの保証へ変えません。基準外はAPI担当と再検討し、古いwall timeをVercel Active CPUに換算しません。旧mixed-load FAILは新しい実測がない限り解消済みにしません。

**成功：** 休止後の機能・回復、pool収支、混合負荷の実測と採択判断、月間利用仮定が無料枠と整合。**停止：** 復帰失敗、接続飽和、保存不整合、CPU／資源の判定不能、既知FAILの未解消、枠不足。公開負荷試験自体も対象・回数・中止条件を承認してから行います。

## 9. 受入後に公開し、引き継ぐ

**操作場所：** #83のリリース記録、Vercelのアクセス設定、実公開URL。**担当：** 責任者＋運用担当。

1. 工程8の未確認／失敗が残らず、工程5・11の復旧担当と手順があることを確認します。公開承認者が、利用可能な範囲と既知の制約を確認します。#258を含まない版で再設定要件を満たしたとは記録しません。
2. 承認した一般公開の差分だけを運用担当が実施します。Deployment Protectionを変更する場合は対象domain／Environmentを確認し、他2人のシークレットウィンドウ／別端末で公開URLに到達でき、**アプリのログインは引き続き必要**であることを確認します。
3. 対象SHA／tree、CIリンク、Vercel deployment ID／実URL／region／runtime、Neon対象、migration結果、QA結果、backup時点／復元結果、担当、停止方法、残る制約を1つの記録へまとめます。Secret・個人データを除いた証拠だけを残します。Release／Tag／提出は、対象と内容を承認する別工程です。
4. 運用担当はVercel Usage、Neon Usage／Monitoring、#258版のResend Usage／配信失敗を、承認した頻度で確認します。障害時はVercelの短いログ保持／Neonの復元窓内に、日時・SHA・status・request ID等の最小証拠を秘匿して確保します。日次確認だけで6時間の復元窓を守れるとは扱いません。頻度・当番未定なら引継ぎ未完了です。

**成功：** 別メンバーの端末で主要Flowを使え、公開・停止・再開の責任者と記録がそろう。**停止条件：** 一般公開後の挙動がQAと違う、秘密情報・他人のデータ漏えい、利用量超過、運用担当不在。無料枠上限では停止を受け入れ、無断の有料切替で続けません。

## 10. 更新リリースで追加する確認

**操作場所：** GitHubの旧公開SHAと新SHAの差分、staging、本番の配備記録。**担当：** 実装担当＋API／DB担当＋運用担当。

| 順 | 具体的操作 | 成功の確認／停止条件 |
| --- | --- | --- |
| 1 | 旧公開SHA／deploymentを記録し、新SHAとの `apps/api/migrations/`、lockfile、auth／config、build、HTTP契約、Web差分を確認 | 追加SQL・設定・UI影響を説明できる。既存SQLの変更／削除、未知のauth schema変更は停止 |
| 2 | 旧アプリが新schema・新データを読めるか、旧Web cacheからの要求を処理できるか、stagingの合成DBで確認 | 後方互換と切戻し可能範囲が確認済み。`db:check`だけで旧版互換を判断しない。破壊的変更は段階移行または別復旧計画が必要 |
| 3 | 同じ新SHAでstagingの6〜8を実施。新しい設定の実配送・proxy等も再確認 | CIとstaging受入が新SHAに対応。未解決レビュー・競合・別SHAの結果なら停止 |
| 4 | 本番backup・隔離復元確認、最大待ち時間、書込み停止時間帯、main更新の凍結合意、自動配備／domain割当ての制御を決める | migration中に旧アプリが不適合なschemaへ書かない。Git連携の本番自動配備を止める／再開する方法が不明なら停止 |
| 5 | 本番6-A → 必要な6-B → 6-C → 承認された新SHAの本番7 → 8 → 9 | 公開開始タイミングと新旧DB互換を照合。別DB・URL設定のPreviewをPromoteしない。旧deploymentを削除しない |

DBを変えない更新でもschemaの読取り確認と復旧記録を確認します。migrationがないことと、データ／認証／メール／ログへの影響がないことは別です。Secretの変更は旧deploymentが古い値を保持する可能性があるため、工程11の切戻し判定に含めます。

## 11. 失敗時に戻す・止める

### 11-A. まず影響を止める

**操作場所：** Vercelの対象Project → Settings → General → Pause Project。**担当：** 運用担当＋責任者。これも別途承認された障害対応範囲で行います。[公式pause](https://vercel.com/docs/projects/managing-projects#pausing-a-project)

障害発生時刻、現SHA／deployment、症状、最後の成功操作を記録し、秘密値のあるログは共有せず担当者だけで保全します。書込み・認証の安全性が疑わしければ、新規受付を停止します。Pause Projectでは対象名を照合して確認し、production URLが503 `DEPLOYMENT_PAUSED`になることを確かめます。**Pauseはproduction向けであり、Preview／古いgenerated URL／他Project／外部CLIのDBアクセスを止めたとは限りません。** DBに接続可能な全入口を列挙し、API／DB担当が承認済み方法で書込みを止めます。入口が遮断できるまでDB復元を行いません。Delete Projectは復旧手順ではありません。

**停止条件：** 対象を特定できない、全書込みの停止が確認できない、認証情報の漏えいが疑われる。疑われたSecretは担当者が無効化・再発行を判断します。ログやcommitを消すだけで安全としません。

### 11-B. アプリだけを直前の正常版へ戻す

**前提：** 現DBと旧アプリの互換性が確認済み、DBデータの復元が不要、旧deploymentのSecret／URL／外部API設定が現在も安全・有効。**操作場所：** Vercel対象ProjectのOverview → Production Deployment → Instant Rollback、またはDeploymentsの `… → Instant Rollback`。[公式rollback](https://vercel.com/docs/instant-rollback)

1. Hobbyで選べるのは直前のproduction deploymentです。履歴の「正常」と直前が同じか、SHA・domain・環境を確認します。初回で旧正常版がない、直前が不良、旧版を削除済みならこの方法を使いません。受付停止を維持し、修正版の受入へ戻ります。
2. ダイアログの対象domain・旧SHAを確認し、Confirm Rollbackを行います。これは旧buildへdomainを向ける操作で、DBを戻しません。旧deploymentの環境値はProjectの最新値に自動更新されません。漏えい済み／失効済みキーを使う旧版なら停止します。
3. **Pause中のproduction URLは503なので、そのまま受入試験はできません。** Resume前に工程3と同じく、Vercel Authenticationの **All Deployments** が対象Projectへ保存され、実production domainを覆うこと、QA担当のアクセスと他のDB入口の遮断を担当者が確認し、限定QAの再開を承認します。**Standard Protectionは本番ドメインを保護しません。** [公式保護](https://vercel.com/docs/deployment-protection)・[料金表](https://vercel.com/docs/deployment-protection/usage-and-pricing)の記載だけで実設定の成功としません。All Deploymentsが利用不可／課金要求／対象範囲不明、QAアクセス未準備なら、**Pauseを維持してResumeしません**。保護した非本番URLの事前確認は別受入で、旧generated URLを本番実originの代用にしません。
4. Resume後はまず未許可アクセスが拒否されることを確認し、QA担当だけが**実origin**でhealth、ログイン／ログアウト、合成Goal読取り・保存・Todayを確認します。SHAと結果を記録し、失敗なら再び停止します。すべて成功してから、責任者が限定閲覧の解除と全入口の一般受付再開を承認します。Pauseしていない場合も、受付を止めた方法とQA経路を確認して同じ順で受け入れます。Resume自体は即時操作なので、押す前に範囲と担当を確認します。
5. Rollback後はproduction domainの自動割当てが無効になります。修正版を再受入した後、OverviewのUndo Rollback等で承認したdeploymentを選び、domain割当てと自動配備の再開を確認します。別のmergeだけで自動復旧するとは期待しません。

**成功：** 旧版と現DBで業務往復・認証・秘匿が正常。**停止：** schema非互換、旧Secret不適合、直前正常版がない、再受入失敗。アプリ切戻し後も成功済みのmigrationと利用者データは残ります。履歴table削除やSQLの逆実行で戻しません。

### 11-C. DBデータの復旧が必要な場合

**操作場所：** 工程5で採択・試験した隔離復元環境、Neon Console、認証／削除対応記録。**担当：** API／DB担当＋責任者。初心者1人で本番branchのRestoreを押しません。

1. 全書込み・新規認証を停止し、現在DBを保全します。障害直前の復元時点・失う成功更新・削除／password変更の履歴を確認します。復元する対象branch・時刻・データ損失・費用・再開手順を具体的に承認します。
2. 採択したbackup／PITR方式で**隔離先**に復元し、schema、業務往復と時刻を確認します。Neonの `Postgres database → Backup & Restore → Restore from history` は**現在データを上書きし、branch内の全databaseを復元し、接続を中断する**操作です。アプリrollbackと同じ気持ちで押しません。[公式branch restore](https://neon.com/docs/postgres/backup-restore/branch-restore)
3. backup後の成功更新Bは失われ、削除済みGoal／user A・古いpassword／account／sessionが再出現し得ます。担当者が削除要求・撤回・期限切れ派生データの削除を再適用し、**受付再開前に全旧sessionと再設定token等の資格情報を失効**させます。旧password／account巻戻しの本人保護も別に判断します。既存候補の復旧CLIをそのまま本番へ転用しません。実際の失効／削除手段が未整備なら再開しません。
4. `db:check` exit 0、隔離fixtureの旧Cookie401・旧再設定token無効・新ログイン成功、owner分離、合成Goal保存→Today一致、削除再適用、RPO／RTO実測を確認します。確認と承認後に、採択したDB切替／復元と適合するアプリ版を配備し、全入口の再開を行います。

**成功：** schemaと業務だけでなく、古い認証の無効化・削除再適用・失われた更新の扱い・責任者承認まで記録されている。**停止：** backupなし／窓外／復元失敗／失効未確認／削除再適用できない／損失不明。復旧方式・本番用コマンドは現時点で未採択のため、担当者の具体的runbookと隔離試験が公開前に必要です。

### 症状からの戻り先

| 症状 | 戻る工程・操作 | 合格するまで止めること |
| --- | --- | --- |
| build失敗／assets 404 | 2の版・build順、3のroot／command、7のログを照合 | 一般公開・DBの無関係な再移行 |
| runtime初期化500 | 4のproduction設定・URL・Secret存在、6のschema確認。例外原文を共有しない | SecretをGitに書く、HTTP許可を公開で有効にする |
| health 503／保存失敗 | 4の接続先・TLS、6の読取り、8-Dの枠・休止・poolを確認 | DB全消去、無制限retry、有料upgrade |
| checksum不一致／0002拒否 | 6で停止しAPI／DB担当へ。適用済み履歴を保全 | 既存SQL書換え、履歴削除、Goal削除で通す |
| ログインloop／Cookie欠落 | 4の実origin、8-Bの全Set-Cookie・HTTPS・proxyを確認 | 別origin/CORSへの無断変更、trusted originの一括許可 |
| 再設定要求が503 `RESET_PASSWORD_DISABLED` | 現行停止版の期待値。対象SHAと画面の停止案内を確認。公開先への停止版反映は別確認 | メール設定だけでの再開、未承認の停止解除 |
| メール未着／要求200（再開版） | 4のVerified／送信元／キー、8-CのResend結果・quota・受信箱を確認 | 200を配信成功にする、公開でlogへ切替える |
| token／Secret漏えい | 11-Aで受付停止、担当者が失効・rotationとログ取扱いを判断 | 実tokenをIssueへ貼る、隠しただけで再開 |

## 12. 自動配備（CD）

**対象：** [#275](https://github.com/FutureROI-DevTeam/Future-ROI/issues/275)。2026-10-12の初回本番（`34d7497`、#83の公開記録）は工程2〜7をCLIで手動実施した。以後の更新は [Deploy production](../../.github/workflows/deploy-production.yml) が行う。判定ロジックは [deploy-gate.mjs](../../.github/scripts/deploy-gate.mjs)、回帰は [deploy-gate.test.mjs](../../.github/scripts/deploy-gate.test.mjs)（ApplicationのCIで実行）。

### 12-A. 構成と採用理由

Application／FoundationのmainでのCI完了を起床イベントとして、`workflow_run`で起動する。同repoの`workflow_dispatch`完了も最新mainの照合を起こす。配備を許すのは、ロック取得後に選んだSHAの**push由来Application（3 job）とFoundationが全job success**の場合だけで、手動CIの成功はその代わりにならない。

| 順 | 処理 | 止まる条件 |
| --- | --- | --- |
| 1 | `gate`：直列化のロック取得後、**現在のmain先頭**とそのSHAのpush由来の必須4 jobを選び直す | `CD_ENABLED`がtrueでない、push CI失敗・skip・未完了、前回の切替失敗・取消が未確認 |
| 2 | `schema`：Vercelから直結URLを実行中だけ取得し `db:check`（読取り） | 空DB・認証差分・checksum不一致・不明履歴・判定不能（stop） |
| 3 | `migrate`：アプリの追加migrationだけが未適用なら、`production-migration` Environmentの承認後に `db:migrate` → `db:check` exit 0 | 承認なし、migration失敗、事後確認がokでない |
| 4 | `deploy`：本番が既に対象SHAなら何もしない。`vercel deploy --prod --skip-domain` で本番設定のbuildを作り、**本番URLへはまだ割り当てない** | build失敗 |
| 5 | 候補のdeploymentが対象SHA（`meta.cdSha`）・production・READYか確認し、health／`/`／`/api/goals` 401を確認 | どれか不一致・失敗。本番URLは前の版のまま |
| 6 | 専用`switch` jobでmain先頭・実本番ID・既存の切替要求を再確認し、開始記録を残して`vercel promote` | main更新、候補準備以降の本番変更、既存要求がpending、Rolling Release使用時は切替前に停止 |
| 7 | `lastAliasRequest`の時刻・対象ID・種別・終端状態を実本番aliasと照合し、SHA・smokeを確認 | CLI失敗・取消・検証失敗ならpromoteの終端を確認してからrollbackし、その終端・本番alias・smokeも確認。DBは戻さない |

- **CIの前に配備しない：** VercelのGit連携は使わない。連携するとpushと同時にbuildが始まり、CIを待たない。Hobbyではチーム外のコミット作者の配備が止まり得て、初回もLogin Connection不足で連携できなかった。Vercel側の「checksを待つ」機能はHobbyでの可否が未確認のため採用しない。CIのjob内で直接 `--prod` 配備する案は、一部jobの失敗や確認前の本番切替を防げないため採用しない。
- **待機イベントで配備を失わない：** 同repoのmain CI完了は`production-deploy`で直列化し、実行中は中断せず、待機は最新の到着イベント1件。古いAのCI再実行や手動CIの完了が待機Bを置換しても、gateをskipせず現在main BとBのpush CIを照合する。起床元のevent・SHA・成否を配備許可にしない。gateが拒否する別repoのイベントはrunごとの独立groupへ隔離して共通待機を置換させない。選択したSHAは全後続jobへ固定して渡し、migration前・候補作成前・promote前にもmain先頭を再確認する。
- **取消と復旧の境界：** schema・migration・候補作成は通常のCancelで停止する。`switch`だけはjobの`always()`で通常取消後も終了処理を続けるが、promoteと検証stepは`!cancelled()`で停止する。promote要求の前に`attempted`・開始時刻・直前要求の時刻をstep outputへ記録し、専用の`always()`復旧stepが開始時に取消状態を再評価する。取消前に切替を試みていなければ本番操作をしない。開始後は、非同期promoteの終端を待って直前の版へ復旧する。
- **CLI終了を成功の証拠にしない：** [promote](https://vercel.com/docs/cli/promote)と[rollback](https://vercel.com/docs/cli/rollback)のtimeoutはCLI待機だけで、サーバーの要求は継続する。CLI失敗後も[project API](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name)の`lastAliasRequest`を確認する。直前より新しい時刻・候補ID・`promote`・終端状態を確認するまでrollbackを競合させない。`pending`／状態不明は有限待機後に未検証として失敗し、次のCDのgateも停止する。CLIのstatus単体は古い要求や欠損でもexit 0になり得る。Rolling Releaseは非対応で、切替前に拒否する。
- **時間の上限：** HTTPの接続5秒・転送15秒、smoke全体120秒。配備APIは応答body読取りまで15秒、CLI要求全体45秒（CLI待機30秒）、promote照合240秒、rollback照合180秒、alias反映確認30秒。通常検証stepは6分、復旧stepは14分。候補buildは8分、環境変数取得60秒。switchのcheckout・Node setup・CLI導入は各2分、head確認1分、promote step2分に制限し、準備の遅延も予算へ含める。30分のjobに対し全step上限の合計は29分で、検証中の応答停止でも復旧時間を残す。helperの復旧上限は最後のHTTP要求による超過も含め約13分15秒。前提はrunnerが生存しAPIが期限内に終端を報告すること。
- **Secret：** DB接続値・認証Secret・メール設定はVercelのProduction環境変数のまま使う。GitHubに置くのは配備用Tokenとbypass値だけ。接続値は取得直後にmaskし、一時ファイルは即削除する。
- **費用：** 公開repoのGitHub ActionsとVercel HobbyのCLI配備は無料枠内。1回のbuildは約1分。

### 12-B. 初回の有効化（担当者の承認が必要）

| 順 | 操作 | 担当 |
| --- | --- | --- |
| 1 | Vercel → Account Settings → Tokens で、範囲 `jogihuck2026`・期限付きの配備専用Tokenを作る | Vercelの所有者 |
| 2 | Project `future-roi` → Settings → Deployment Protection → Protection Bypass for Automation で値を発行する（Hobbyで使えない場合は止めて相談） | Vercelの所有者 |
| 3 | GitHub → Settings → Environments に `production`（Deployment branchesをmainだけ）と `production-migration`（同じ制限＋Required reviewers）を作る。両方にSecret `VERCEL_TOKEN`、`production` に `VERCEL_AUTOMATION_BYPASS_SECRET` を登録 | repo admin |
| 4 | Repository variables に `VERCEL_ORG_ID`・`VERCEL_PROJECT_ID`・`PRODUCTION_URL`（`https://future-roi.vercel.app`）・`CD_ENABLED`（最初は `false`）を登録 | repo admin |
| 5 | **現行の再設定停止版ではメール資格情報の登録は不要。** `RESEND_API_KEY`・`MAIL_FROM`の未設定でメール設定が起動を拒否することはない（他の必須設定・DB・schemaの確認は必要）。再開が承認された版では、工程4と#300・#302に従い配送準備・受入と停止解除を別に確認する。下記のlog例外は過去の記録で、現在の設定指示ではない | メール担当＋API担当 |
| 6 | `CD_ENABLED` を `true` にし、Actions → Application の最新main実行を Re-run するか次のマージを待つ。Deploy productionのSummaryで候補・本番SHA・health結果を確認する | 運用担当 |

**2026-10-13の一時例外（`MAIL_TRANSPORT=log`、以下は当時の記録）：** 送信用ドメインがなく、公開は同日8:00（JST）までの利用に限るため、配備担当の判断でVercel Productionに `MAIL_TRANSPORT=log` を設定した。工程4の「公開でlogを使わない」に対する、期限付きの例外である。

**現行との区別：** [#284](https://github.com/FutureROI-DevTeam/Future-ROI/issues/284)・[PR #285](https://github.com/FutureROI-DevTeam/Future-ROI/pull/285)の停止版では、メール設定を読まず、再設定APIを拒否し、log送信も行いません。次の影響・終了判断は停止前の例外に関する履歴として保持します。停止版が全instanceへ反映済みか、過去ログや既発行トークンが残るかはこの文書修正では未確認です。`CD_ENABLED`や本番環境変数を変更したり、例外を再承認したりする手順ではありません。

- 影響：パスワード再設定のメールは届かない（画面は送信済みと表示する）。宛先と再設定リンクがVercelのruntimeログに出る。ログはProjectの所有者だけが読め、Hobbyでは1時間保持される。
- 他の案：ドメインを購入してResendを使う案は費用0円の方針に反し、当日中に承認を得られない。無料サブドメイン（is-a.dev等）は、Resendの所有要件を満たすか未確認で、承認待ちの時間もかかる。CDを止めて手動配備を続ける案は、CDを有効化する目的に合わない。
- 終了（自動配備）：2026-10-13 8:00（JST）以降は、担当者が `CD_ENABLED=false` に戻し、Resendとドメインの準備・本番への設定反映を終えるまで自動配備を止める。この設定は以後のCDを止めるだけで、既存の公開アプリ、メール未配送、宛先・再設定リンクのruntimeログ出力は止まらない。
- 終了（公開とメール）：メール例外の期限終了と公開継続の判断は別作業とする。担当者は、工程11-AのPause Projectで公開を止めるか、Resendとドメインを用意して `MAIL_TRANSPORT` を削除し、メール配送を確認して公開を継続するかを別途判断する。準備未了の公開継続には担当者の別承認が必要で、`CD_ENABLED=false` だけではメール例外を終了できない。

### 12-C. migrationがあるリリース

Deploy productionが `Production migration (approval required)` で承認待ちになる。承認者は承認前に、工程10の1・2（追加SQLの内容、旧アプリが新schemaで動くか）を確認する。既存SQLの変更・削除や破壊的変更を含むなら承認せず、Rejectして手動の段階移行を計画する。Summaryに記録されたmigration開始時刻は、Neonの履歴復元（工程11-C）で戻すときの基準になる。

### 12-D. 止める・戻す

| したいこと | 操作 |
| --- | --- |
| 自動配備を一時停止 | Repository variable `CD_ENABLED` を `false` にする（実行中のものは完了まで走る） |
| 特定の実行を止める | Actions → Deploy production → Cancel workflow。promote要求前なら本番は変わらない。開始後はswitchの復旧stepの終了・実aliasを確認する。Force cancelは復旧も止めるため緊急時でも通常Cancelと区別する |
| アプリを直前の版へ | 工程11-B（`vercel rollback` またはDashboardのInstant Rollback）。rollback後はVercelの自動割当てが止まるが、次のCDはpromoteで明示的に割り当てる |
| DBを戻す | 自動では戻さない。工程11-Cに従う |
| schemaがstopになった | 本番DBが想定外の状態。配備は止まっている。API／DB担当が工程6の表で原因を確認する |
| 切替・復旧の失敗／取消、runner消失、状態不明 | 後続CDは`previous-switch-needs-review`で停止する。直前の失敗runの候補ID・旧本番ID・Summaryを参照し、担当者がVercelのpending要求の終端と実aliasを照合する。未完了promoteに競合するrollbackや新promoteを重ねない。終端後に必要な手動復旧・smokeを確認する。運用担当の承認後に**元のrun全体**をRe-runしてgateから最新main・CIを再評価する（新runやgate-only成功は遮断を解除しない）。`switch`単体のRe-runは旧snapshotを再利用するため行わない |

### 12-E. 未確認

この手順は #275 のPR作成時点で、実際のworkflow実行（Token・Environment・bypassを使う部分、`vercel env pull` で直結URLを取得できるか、promote／rollbackの挙動）を確認していない。初回の有効化で12-B 6の結果を #275 に記録してから確認済みとする。

**2026-10-13の担当者報告：** [初回実行記録](https://github.com/FutureROI-DevTeam/Future-ROI/issues/275#issuecomment-6129097041)では、担当者がCDを有効化し、gateと直結URL取得は成功したが、8件のchecksum不一致でschema確認が停止した。本番切替には到達していない。`34d7497`と`e56f208`の8 SQLはGit blobが同一で、GitのLF版と旧Windowsの全CRLF版のhash差は再現できる。[限定互換helper](../../apps/api/src/db/migration-checksum.ts)は、この8全文名の固定pairに現在hash・履歴hashが両方一致する場合だけ許容する。履歴の書換え、SQL再実行、hashや実行SQLの正規化は行わない。未知履歴・その他のchecksum不一致は従来どおり停止し、未適用はdb:checkのdriftとして承認付きmigrationの対象にする。全8件の本番full hashは未取得のため、この修正だけで本番の不一致解消を保証しない。`0001`の関数／`0002`のDO原文はdollar quote内も改行が異なり、DB定義のbyte同一を確認したものではない。属性のLF固定は新しいcheckoutで作用し、既存CRLF作業ファイルやDB履歴を修復しない。再実行・本番照合・切替の受入は担当者の別判断とする。

PR #276のレビュー修正では[切替回帰](../../.github/scripts/production-switch.test.mjs)のmock CLI／API／時計、[shell回帰](../../.github/scripts/smoke-deployment.test.mjs)のlocalhost HTTP server＋実curl、[gate回帰](../../.github/scripts/deploy-gate.test.mjs)をApplication CIへ追加する。成功、CLI通信断後の遅延完了、取消後の復旧、partial alias失敗、rollback失敗、未知状態、HTTP 200途中停止、古いイベントの待機置換を合成で確認する。通常のGitHub Cancelの実runner実行、Hobby上のAPI終端・直前版rollback、Secret・bypass・DB／メールは未実施で、担当者の承認後に有効化前受入として記録する。長時間のAPI障害・force cancel・runner消失で自動復旧を保証しない。CDの有効化／停止・再実行は担当者の別判断とし、本コード修正では実設定を変更しない。

## 実施記録のひな形

以下を #83 またはそのリリース記録へ転記します。未実施を `OK` で埋めません。

```text
種類: 初回 / 更新 / 切戻し / DB復旧
環境・実URL・Vercel Project/deployment ID:
対象SHA / tree・CIリンク:
Neon Project / branch / DB（接続値なし）:
実runtime・region・日時UTC・担当者:
用途/無料条件・対象操作の承認記録:
設定した変数名・環境区分（実値なし、2機能はOFF）:
schema事前確認 / migration対象と結果 / 事後確認:
backup方式・取得時刻・隔離復元証拠・採択RPO/RTOと実測:
8-A～8-Dの各結果・秘匿済み証拠・未確認・Known Limitations:
旧正常deployment・現DBとの互換・停止/再開手順:
運用/認証更新/メール/復旧の担当・確認頻度:
公開または再開の承認・実URLでの別端末確認:
```

## 根拠と保守するときの照合先

操作・料金の出典は各工程に直接付けています。公式資料の記載は現在の実アカウントの適合／配備成功の証拠ではありません。Neon公式Plansは本文を取得して照合し、snapshot無料例外は未確認として残しました。復旧の参考は公式Branching／Branch Restoreで、Consoleでの実操作は未実施です。

| 確認する内容 | リポジトリの開始点 |
| --- | --- |
| 現行仕様と未採択条件 | [Product](../product-spec.md)、[Architecture](../architecture.md#deployment)、[対応表](../change-map.md)、[既存公開受入](release-demo.md) |
| install／build／runtime／routing | [package.json](../../package.json)、[vercel.json](../../vercel.json)、[build-vercel](../../scripts/build-vercel.mjs)、[vercel entry](../../apps/api/src/vercel.ts)、[bundle説明](vercel-bundle.md) |
| env／認証／ログ／所有者・Origin | [config](../../apps/api/src/config.ts)、[auth options](../../apps/api/src/auth/options.ts)、[app](../../apps/api/src/app.ts)、[guards](../../apps/api/src/http/guards.ts)、[Web HTTP](../../apps/web/src/api/http.ts) |
| migration／schema／pool | [migrate](../../apps/api/src/db/migrate.ts)、[migration CLI](../../apps/api/src/db/migrate-cli.ts)、[schema CLI](../../apps/api/src/db/schema-check-cli.ts)、[pool](../../apps/api/src/db/pool.ts)、[SQL](../../apps/api/migrations/) |
| OFF機能と削除運用 | [evaluation](../../apps/api/src/evaluation/policy.ts)、[milestone](../../apps/api/src/milestone/policy.ts)、[.env.example](../../.env.example) |
| #258の条件付き準備 | [固定HEADのconfig](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/config.ts)、[mailer](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/auth/mailer.ts)、[auth設定](https://github.com/FutureROI-DevTeam/Future-ROI/blob/e492e55fef072d9fe317c3b6d6f869616813ebf5/apps/api/src/auth/options.ts)、[PR](https://github.com/FutureROI-DevTeam/Future-ROI/pull/258) |

更新時は新しいmain SHAと設定／SQL／build、未解決PR、公式無料条件を再照合し、実施した検証・静的読取り・未検証を区別します。README／Architectureの公開準備は別担当の作業であり、本書作成では編集していません。
