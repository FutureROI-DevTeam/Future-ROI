# リリース・デモ・提出の手順

初めてリリースを担当する人は、[日本語リリース手順書](release-guide.md)から操作場所・準備・実施順・成功確認・停止条件を確認してください。同書は本書の公開受入条件を説明する補助ガイドです。文書／CIの成功は実デプロイ・一般公開の完了ではありません。

HTML §16–17に基づく最小運用。ProductはFuture ROI（[Product Spec](../product-spec.md#現行状態2026-09-30)）。基本構成は[D-23](../architecture.md#d-23)にFE側の依頼者報告とBE本人の了承記録に基づく採用として記録。2026-10-08の公開第一候補は**FE・BEともVercel Hobby、DBはNeon Free、ローカル開発はDocker**（[D-25](../architecture.md#d-25)）。本人アカウント・厳密に費用0円を前提とし、採用確定・配備済みではない。一般公開・外部作成・課金の許可ではなく、公開先の最終受入、運用担当者、URLは未定。1〜2年の継続を視野に置くが、無料条件が変わらないことや稼働継続を保証しない。
migrationは`npm run db:migrate`（認証→アプリの順。コンテナ内は`node apps/api/dist/db/migrate-cli.js all`。[手順](../DEVELOPMENT_GUIDE.md#起動)）。[Demo Seed](demo-seed.md)は認証作成済みuserIdとtimezoneを明示し、専用2Goalだけを作成・resetする。deployコマンドは未定で、存在しないコマンドは掲載しない。migration後の履歴・checksum・認証table／column欠落（暗黙の`id`を含む）の読み取り専用確認は`npm run db:check`（[使い方・有限の上限設定・限界](../DEVELOPMENT_GUIDE.md#起動)、#179）で行い、exit 0だけで公開・業務E2E完了としない。

## 統合版のデプロイ準備（#205）

[Task #205](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/205)は#83の配備前準備を扱う文書Task。初回はmain `041f24c`と、UI [#202](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/202) `f3c4a3a`・新Engine [#204](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/204) `5b479e6`の未merge時点のローカル併用を確認した。2026-10-10の追確認では#202・#204とVercel候補の[#209](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/209)がmerge済みで、統合後mainは`22aa0dab79135b0913d4056129ab28624bed38a4`。配備対象はその時点のcleanなSHAとtree（ファイル内容の識別）で改めて固定し、差分があれば影響する確認をやり直す。Cloud Runの履歴を現在の配備手順として使わない。

### Secret不要のローカル確認

新しい専用checkoutのrepository rootで、Node 24.22.1・npm 11.19.0を使う。`.env`を持ち込まず、既存DB・container・previewを使わない。以下は既存コマンドで、依存取得とbuild生成物の書込みを行うが、アプリserver・DB CLI・公開先を起動しない。

```powershell
& {
  $ErrorActionPreference = 'Stop'
  $PSNativeCommandUseErrorActionPreference = $false
  function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE)" }
  }
  function Get-CleanRevision {
    $changes = @(Invoke-Checked git @('status', '--porcelain=v1', '--untracked-files=all'))
    if ($changes.Count -ne 0) { throw 'Tracked/untracked changes exist; preserve them and stop.' }
    [pscustomobject]@{
      Head = (Invoke-Checked git @('rev-parse', '--verify', 'HEAD')).Trim()
      Tree = (Invoke-Checked git @('rev-parse', '--verify', 'HEAD^{tree}')).Trim()
    }
  }
  $before = Get-CleanRevision
  try {
    Invoke-Checked npm @('ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund')
    Invoke-Checked npm @('run', 'typecheck')
    Invoke-Checked npm @('run', 'test', '--workspace=@futureroi/prediction')
    Invoke-Checked npm @('run', 'test', '--workspace=@futureroi/web')
    Invoke-Checked npm @('run', 'build')
    Invoke-Checked pwsh @('-NoProfile', '-File', './scripts/check-foundation.ps1')
    foreach ($path in @('packages/prediction/dist/src/index.js', 'apps/api/dist/server.js', 'apps/web/dist/index.html')) {
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing build output: $path" }
    }
    Invoke-Checked node @('--input-type=module', '-e', "await import('@futureroi/prediction');")
  } finally {
    $after = Get-CleanRevision
    if ($before.Head -ne $after.Head -or $before.Tree -ne $after.Tree) { throw 'HEAD/tree changed during verification; stop.' }
  }
  Write-Output "Verified HEAD=$($before.Head) TREE=$($before.Tree)"
}
```

PowerShell 7でブロック全体を一度に実行する（保存した`.ps1`を`pwsh -NoProfile -File`で実行してもよい）。各native commandは[`$LASTEXITCODE`](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_automatic_variables#lastexitcode)を直後に確認し、非0なら後続の検証へ進まない。検証開始前と終了時（コマンド失敗時も）にindex／未stageのtracked変更とuntrackedを検出し、HEAD／treeの不変性も照合する。すべて成功して初めて`Verified`を出力する。`.gitignore`対象の`node_modules`／`dist`等はclean判定から除く。dirtyな差分を自動削除・resetせず保全し、修正をcommitした新SHAか別のclean checkoutでやり直す。

順に対象SHAの固定、lockfileどおりの依存取得、型、Engine回帰、Web回帰、Prediction→API→Webのbuild、文書・リンクを確認する。全exit 0に加え、`packages/prediction/dist/src/index.js`・`apps/api/dist/server.js`・`apps/web/dist/index.html`が生成され、Predictionのworkspace exportsを解決できることを確かめる。失敗時は依存固定・exports/build順・該当型／文書参照を修正する対象として記録し、公開準備を止める。環境だけを直した場合は同じSHA、ソースを直した場合は修正後の新SHA／treeを固定し、未commit差分を混ぜず再確認する。`npm test`全体はDBを使うためこのSecret不要の列へ混ぜない。Webの既定回帰だけで実ブラウザ・認証HTTP E2E完了にしない。必要なブラウザ／隔離DB確認は[開発ガイド](../DEVELOPMENT_GUIDE.md)の前提と対象を確認して別に行う。

ローカル併用SHA `d776e0f`（旧#202 `2160ac7`＋#204）では型・Engine 77件・Web 112件成功／既存browser入口1件skip・別実行のChrome 14件・build・Foundationに加え、隔離DBのAPI重点7件と実Engine→API serializer→FE変換／表示の12状態を確認した。#202追修正を併用したSHA `27b762e`（tree `0267acb`）では型・Web 112件成功／既存browser入口1件skip・build、3生成物とworkspace exportsを追確認した。API・Engine・配置は旧組合せから差分なし。対象、件数、実行結果は[#205](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/205)の検証記録に残し、旧SHAの結果を新SHAの全試験成功へ読み替えない。CIとlocal成功はVercel bundle、公開負荷・認証・復旧の証明ではない。

### 配備前に照合する環境変数

実値をこの表・Issue・ログに記録しない。名前と必要条件は[config.ts](../../apps/api/src/config.ts)・[schema-check-cli.ts](../../apps/api/src/db/schema-check-cli.ts)・[空値だけの例](../../.env.example)に照合した。Providerの環境別Secret設定・実値・接続先は未確認で、今回変更しない。Webは相対`/api`と`credentials: same-origin`を使い、公開API URLの新しいFE環境変数は現実装にない。

| 名前 | 用途・必要条件 | 未決／停止条件 |
| --- | --- | --- |
| `NODE_ENV` | 公開runtimeはproductionとしてSecret／HTTPSの検査を有効にする | 実際のbuild/runtime適用を確認。開発用Secretの自動生成へ依存しない |
| `DATABASE_URL` | API必須。通常HTTPはNeon pooled接続を候補にし、TLS・対象DB・role・timeoutの実設定を確認 | migration／将来の`pg_dump`は別processで同じ変数へ**直結URL**を渡す計画。新しい`DIRECT_DATABASE_URL`を現CLIが読むと仮定しない。値の表示・本番CLI実行は行わない |
| `BETTER_AUTH_SECRET`／`BETTER_AUTH_URL` | production必須。Secretは32文字以上、URLは実際の公開HTTPS originと一致 | PreviewとProductionのorigin・DB・資格情報の分離方法は未決。任意Preview domainを一括許可しない |
| `MAIL_TRANSPORT`／`RESEND_API_KEY`／`MAIL_FROM` | production既定は`resend`。起動時はAPIキーと送信元の存在・形式だけを検証する（ドメイン未認証でも起動し、送信時にResendが拒否する）。パスワード再設定メール（#256）に使う | Resendのアカウント・送信元ドメインの認証・無料枠と、一般宛先への配信成功は起動とは別に受入れる。`MAIL_TRANSPORT=log`は再設定URL（有効期間中は秘密）をログへ出すため、隔離したローカル確認だけに使い、公開先では使わない |
| `BETTER_AUTH_ALLOW_HTTP`／`AUTH_TRUSTED_ORIGINS` | HTTP例外はlocal container確認用。追加originは認証と状態変更業務APIの許可先になる | 公開でHTTP例外を有効にしない。CORS設定の代用ではなく、originを増やす必要があるなら同一origin設計を再確認 |
| `TRUST_PROXY_HOPS` | 既定0。実際の転送経路・header形式・client IPを確認して決める | Vercelという名前だけでhop数を推測しない。設定変更・公開検証は別の作業 |
| `AUTH_SIGN_IN_MAX`／`AUTH_SIGN_UP_MAX` | 1接続元60秒の試行上限、各既定5 | 共有会場回線のQAと認証防御を照合。業務API・予測のCPU予算とは別。今回上限を変更しない |
| `WEB_DIST` | Docker／常駐serverでFastifyからSPA配信する場合にbuild済みWeb directoryを指定 | 常駐serverは未指定ならSPAを配信しない。Vercel専用entryはこの外部値を使わずbundle内のWeb directoryを解決する（[候補手順](vercel-bundle.md)）。公開先でのassetsと同一origin経路は未確認 |
| `HOST`／`PORT`／`LOG_LEVEL`／`SHUTDOWN_TIMEOUT_MS` | 常駐Nodeのbind・port・log・終了待ち。host既定127.0.0.1、port既定3000、終了待ち既定10秒 | Functionの起動・休止と同じと仮定せずadapterで確認。既存SIGTERM処理だけでidle解放成功にしない |
| `SCHEMA_CHECK_TIMEOUT_MS`／`SCHEMA_CHECK_QUERY_TIMEOUT_MS` | `db:check`専用の有限上限。既定30秒／5秒、各1000〜600000 ms | [I/O限界を含む手順](../DEVELOPMENT_GUIDE.md#起動)に従う。timeout・不完全JSONを成功とせず、今回DBへ接続しない |
| `LOCAL_DB_PASSWORD`／`LOCAL_APP_PORT`／`LOCAL_DB_PORT` | local Compose専用 | 公開Functionの必須設定としてコピーしない |

### 設定変更が必要になり得る箇所と順序

公式[Fastify起動点](https://vercel.com/docs/frameworks/backend/fastify)にはnative検出もあるが、merge済み#209の候補はrepository rootの[`vercel.json`](../../vercel.json)と[`apps/api/src/vercel.ts`](../../apps/api/src/vercel.ts)からBuild Outputを明示する。[候補手順](vercel-bundle.md)のroot・Install/Build Command・起動点・assets・同一Function routingは実装とローカル検証済み。`app.ts`はfactoryで、常駐用`server.ts`とVercel専用entryを区別する。**Provider Project設定・実Secret・公開経路・実DB休止復帰は未確認**で、ローカル成功を公開配備成功へ読み替えない。FE/BEを別originに分けるだけでは現HTTP clientの認証条件を満たさない。公開側の受入は#83で行い、この文書Taskから設定／APIコードを変更しない。

1. 配置・用途・本人運用の条件と¥0停止方針を確認する。実アカウントのplan・追加機能・commit作者／Login Connections・public Organization接続／fork承認・regionと運用担当を記録する。ハッカソン賞金の非商用適否は資料だけでは断定せず未決として残す。他2人の公開URL QAをVercelの3人管理共有にしない。
2. 上記のローカル確認とbundleの検査を行う。公式ではFastifyは単一Fluid Function、標準Node bundle上限250 MB。[Node 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)の実minor／patchは固定できないため公開側の版・bundleサイズ・Prediction両入口を再確認する。既存local buildをVercel buildとしない。
3. 認証・DB・資源の公開適合を下の[採用前検証](#公開候補の採用前に行う最小検証)へ渡す。[HTTP client](../../apps/web/src/api/http.ts)と[guard](../../apps/api/src/http/guards.ts)は同一origin Cookie・変更要求のOrigin確認を使い、API側に別origin用CORS配信設定はない。CSRF／Origin拒否を弱めず、全Set-Cookie・HTTPS・proxy IPを実経路で確認する。Vercel専用entryはapp／authの2 poolへ[公式pool lifecycle](https://vercel.com/kb/guide/connection-pooling-with-functions)のhookを登録し、ローカルで登録境界を確認済みだが、公開Functionの実idle解放／復帰は未確認。既定app 5＋auth 2に多instance数を掛け、migration等の別接続も加えてDB上限と比較する。
4. 新Engine #204は通常の完了分布を数値積分し、条件外ではsamplingへ戻る。標準入力だけの低CPU結果から最大入力・fallback・同時要求の上限を保証しない。両入口、T-14既定入力、fallback／資源上限拒否、予測＋保存／session混合を条件別に確認し、500ms条件・CPU／wall time・p95・失敗・メモリ・月間仮定を残す。旧mixed FAILを保持し、Node wall timeをVercel Active CPUへ換算しない。
5. migrationは公開server起動と別の承認された実行にし、`db:check`と合成業務往復の結果を確認してから公開受入を判断する。health 200だけで先へ進まない。backup・復元方式／費用・削除再適用・旧認証失効・RPO/RTO・証拠退避・代替デモ担当は下の[運用gate](#公開前のgateと証拠)で決める。担当や中止条件が未定なら配備開始しない。

1〜5の公開側作業は**すべて未実施**。採用、外部作成、Secret／権限／ネットワーク設定、実migration・backup／復元・配備はこの準備文書から実行しない。承認後も各gateの期待値／停止条件・秘匿済証拠・未確認範囲を残し、#83の完了条件は維持する。

## 公開候補の採用前に行う最小検証

root・entry・配備物のローカル準備は[#208のVercel候補手順](vercel-bundle.md)を参照する。下表の公開受入とは別に記録する。

全項目は未実施で、[#83](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/83)の既存公開受入へ紐付ける。#70→#75→#83のhealth／SPA・DB・Cookie／proxy・休止後応答・メモリ／遅延の移管を保全する。実行コード・CI・環境設定・アカウント・請求・権限・Secretはこの候補記録では変更しない。検証先の作成と試験範囲は別途承認後。負荷試験は[Vercel Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)で許可された範囲・事前許可を確認する。

| 確認対象 | 最小の確認と合格の根拠 |
| --- | --- |
| 無料条件・本人運用 | [無料運用の条件](../architecture.md#無料運用の条件)と実プラン・利用量・追加機能を照合し、非商用適合、公開Organization接続、commit作者と自動配備条件、管理共有の制限、上限時の停止／再開方法を記録する。非商用は無収益だけで判定しない。費用が生じる条件なら採用せず再検討 |
| monorepo root・起動点 | [候補手順](vercel-bundle.md)どおりrepository rootの`package.json`／`package-lock.json`で3 workspaceの依存を解決し、実Projectのroot・build設定と生成物を照合する。[`app.ts`](../../apps/api/src/app.ts)は`buildApp` factory、[`server.ts`](../../apps/api/src/server.ts)は常駐用、[`vercel.ts`](../../apps/api/src/vercel.ts)は専用Function entry。指定したentryが実Functionに含まれ、`GET /api/health`がDB到達時200／到達不可時503を返すことを確認 |
| Prediction build・exports・Node | `packages/prediction`→API／Webの順でbuildし、[`exports`](../../packages/prediction/package.json)の`dist/src/index.js`等とworkspace依存が公開bundleで解決することを確認。`predict`／`predictWithQuestionPrior`の両入口を実行する。公開Node 24.xの実minor／patchを記録し、ローカル24.22.1との互換性を確認 |
| SPA assets・`/api` | Webのbuild済みassetsが配信bundleへ入り、`/`・`/goals`・GoalのTodayへ直アクセス／再読込できる。hash付きassetsのcacheとindexの再検証を確認。存在しないassets・保護hook通過後の未知API／対象外methodはJSON 404になり、`/api`をSPA HTMLへfallbackしない。同一originでWebとAPIへ到達する。既に開いた旧SPAがある更新では、[SPA/API更新の互換境界](#spaapi更新の互換境界192)も確認する |
| HTTPS・認証・全Set-Cookie | 公開HTTPSの`BETTER_AUTH_URL`と実URLを一致させ、登録→ログイン→再読込→ログアウト→再ログインを3人の端末で確認。全Set-Cookieが欠落・結合されず転送され、Secure・`__Secure-`・HttpOnly・SameSite=Lax、Origin拒否と他userのGoal／記録の分離が保たれる |
| IP・認証レート制限 | proxyの転送ヘッダーの実形式とhop数を記録し、`TRUST_PROXY_HOPS`とクライアントIPの一致を確認。偽装ヘッダーで回数制限を回避できず、複数Function instance／再起動でもDB上の制限・Retry-Afterが整合すること、共有回線で3人が正当に使えることを確認 |
| DB接続・migration・休止復帰 | アプリ用5＋認証用2のpoolをinstance数込みでNeonの上限と比較し、idle接続解放・取得待ち・接続切断・既存5秒timeoutを確認。認証用bigint parserとapp側の文字列型を保全。migrationは別実行で直結URLを使い、session advisory lockをtransaction poolerへ流さない。認証→アプリの順、反復・失敗時rollbackを確認。Neonが休止した後のhealth・再ログイン・読込／保存を確認し、初回応答・DB／Functionのメモリ・region間遅延とエラー回復を記録。常時pingで休止を避けない |
| Goal・記録・再計算の整合 | 再ログイン後のGoal作成／編集／削除、今日／昨日のDONE・SKIPPED、日付境界・保存失敗、R-11回答の保存／訂正後の予測を確認。画面・DB・両予測入口の値とrevisionが整合し、他人の値や古い応答を採用しない。R-04/P-14の既存文書不一致は#80で追跡し、この記録で解消済みにしない |
| CPU・混合負荷・無料枠 | 両予測入口でT-14の既定入力・seed／configと500ms未満を保全し、FunctionのActive CPUとwall timeを別記録。3人の主要Flowと予測＋CRUD／sessionの混合時に計算最大・p95・待ち行列・失敗・メモリ・DB接続数を測り、月間利用仮定と無料枠を照合。旧216.01／227.02msはNode wall timeで、Vercel CPUへ換算しない。[旧mixed-load](../../experiments/architecture-verification/REAL-ENGINE-2026-10-07.md)の546.83ms FAIL・overallExitCode=1・CRUD p95 5秒超は未解消。新しい成功で過去結果を書き換えず、比較条件と解消できた範囲を記録。[#161の計測ハーネス](../../experiments/api-mixed-load/README.md)は負荷モデルとローカル参考手順で、localhost専用（embedded PostgreSQLと`127.0.0.1`のserver）のため公開先URLを指定できない。#175後のGoal POSTのUUID Idempotency-Keyとclosed/open両Log PUTのexpectedGoalSettingsRevisionへの追従は[PR #184](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/184)でmainへ実装済み。作者HEAD `5c4a05a` のM5再実行、独立レビューのWindows adapter機能smoke、Windows原本の`--import`残件は[Architectureの記録](../architecture.md#d-28)で区別する。保存JSONのrepositoryHeadは旧 `bb8aa2a` のままで、作者の新結果JSONは未commit。過去JSONを現main `36430e04` や公開runtimeの測定値へ読み替えない。**公開先への送信手順と公開先側の計測経路（同期ブロック最長・CPU）は未提供・未検証で、本受入条件として残す。** 経路が整った時点で、T-14既定入力（`120,400,1095`）と`MIXED_LOAD_SIZES=548,700,800`相当の追加条件を区別して3人closed loopの各p95・同期ブロック最長を記録し、[D-28](../architecture.md#d-28)の再検討条件（採択した再検討の目安であり公開SLOではない：同期ブロック500ms以上、他操作p95 1秒以上、process単位で重いToday 4 req/s相当以上）と照合する。それまで公開受入は未検証のまま扱う |

各項目の結果にはcommit SHA・CI・URL・実runtime／region・日時・担当・試験条件・期待値／実測・未確認／Known Limitationsを残す。ローカルDocker／CIの成功から公開成功へ昇格しない。機能QAは開発者3人で行い、UX改善・初見理解確認は後続（#81）として分ける。公開確認・復旧・デモ・提出の既存完了条件はこの検証表だけでは完了しない。

## 運用盲点の受入手順（#83）

上の公開受入を具体化する文書・机上演習（tabletop）の計画。[文書Task #150](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/150)の完了を#83の公開・復旧完了にしない。以下の演習・測定・snapshot保存・録画は**すべて未実行**、担当・期限・数値予算・再開判断は未定。将来の試験は対象・合成データ・中止方法の承認後に行い、実backup／復元・公開負荷・デプロイ・課金・権限・設定変更をこの文書から自動実行しない。

### 外部条件の根拠と製品への推論

2026-10-10 UTCに再確認した公式資料の条件。本人アカウントの実プラン・設定・残量は未確認で、採用前と条件変更時に再確認する。

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)はRuntime Logs 1時間、月間Active CPU 4 CPU-hours・Provisioned Memory 360 GB-hours・100万Function呼出し。多くの上限では30日待ちで再開条件を実planで確認する。[Fair Use](https://vercel.com/docs/limits/fair-use-guidelines)は個人・非商用用途に限定し、制作への報酬等も判定対象。本人運用と他2人の機能QAを管理共有と区別し、[無料運用の条件](../architecture.md#無料運用の条件)と照合する。無許可の負荷試験は行わない。
- [Neonの2026-10-02更新](https://neon.com/blog/neon-free-plan-1-gb-per-project)と[公式plansソース](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md)ではFreeはPostgres 1 GB/project・全project合計20 GB、100 CU-hours/project/月、egress 5 GB/project/月、Monitoring履歴1日、復元履歴6時間・最大1 GBの変更。CPU／通信枠を使い切るとcompute停止、storage上限では容量を増やす操作が失敗し、これらの上限でデータは削除されない。FreeもOrganization member数は無制限だが、Neonの共有条件をVercelへ転用しない。FreeにはSLAがなく、将来の規約／稼働保証ではない。PITRは独立backupの代わりや復旧保証にはしない。
- manual snapshotはplansのFree 1個という枠と[backup／restore公式ソース](https://github.com/neondatabase/website/blob/main/content/docs/guides/backup-restore.md)の保存費用 $0.09/GB-monthが併存し、無料例外は未確認。¥0方針では自動的に作成手順へ組み込まず、実課金表示と条件を確認して方式を決める。直結接続の`pg_dump`を別保管する案も、保存先費用・暗号化・保持／削除・RPO/RTO・責任者・復元試験の採択待ちで、今回実dump／snapshotは作成しない。
- [公式scale-to-zeroソース](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md)はFreeの5分無活動後の休止を説明する。**本製品への推論**：翌朝まで待つとログ／復元可能な時点を失う場合がある。またhealthの頻回queryで休止を妨げる可能性がある。0.25 CUが30日間常時稼働する仮定なら `0.25 × 24 × 30 = 180 CU-hours` で100を超える。実測利用量・請求額の断定や将来の無料保証ではない。

### 公開前のgateと証拠

各行は未実行。期待結果・停止条件を机上で合意してから隔離試験を計画し、承認された公開先で再確認する。証拠は既存のリリース記録へ一度だけ残す。

現行の[Dockerfile](../../Dockerfile)のCMDは`server.js`だけを起動する。自動migrationは[local Compose](../../compose.yaml)が`container-start.js`へ起動点を上書きした経路に限られ、production imageやVercelに同じgateがあるとは扱わない。

| gate | 手順 | 期待結果／停止条件 | 残す証拠・未決判断 |
| --- | --- | --- | --- |
| Schemaと業務往復 | 対象SHAのmigrationファイル名・SHA-256と`schema_migrations`を照合し、認証DDLの差分も確認。隔離したempty／latest／old schemaの3条件で別実行のmigration→合成userのGoal作成・取得→今日保存→Today再取得を順に確認する。oldは適用版と合成データ有無を明記する | 期待版・checksumと保存量／日付／Todayが一致。空・旧schemaのままhealthが200でも公開成功にしない。履歴不一致・必要列欠落・認証／業務失敗なら配備gate停止。既存Goalを含む0002が拒否する場合も自動補完せず停止 | 3条件ごとの適用前後版・checksum・exit・秘匿したstatus／期待値／実測。対象SHAの一覧を固定し、将来の新migrationを0004等の固定末尾で見落とさない |
| Migration中断・戻し | 直結URLの隔離先で認証→アプリ、反復、途中DDL失敗、advisory lock待ち中の中止を計画。開始前にoperatorの中止時刻と当該CLI／DB接続の識別を決め、期限でそのCLIを止め、接続終了・lock解放・適用履歴を確認してから再試行する | [runner](../../apps/api/src/db/migrate.ts)は各SQLファイルが別transactionで全体atomicではない。[migration pool](../../apps/api/src/db/pool.ts)はquery期限とstatement timeoutを解除しlock待ちも無期限。中断で未commit分だけrollbackし、既commit版は残る。解放・COMMIT成否不明なら再実行／配信を止める。session lockをtransaction poolerへ流さない | CLI終了時刻・接続／lock解放の確認・残った版。アプリRollbackとDBRollbackを別記録にし、戻すSHAと残schemaの互換性、失敗ファイルからの前進／隔離復元の選択を未定の担当が採択する。履歴行削除・既存checksum変更で回避しない |
| 障害証拠の退避 | 障害を認知した時点で、下記の秘匿済snapshotを採取する担当・保存先・採取期限を机上で決める。夜間不在→翌朝対応の例で保持窓内に誰が取れるか確認する | 発生時刻と最終成功の範囲を追跡できる。保持窓を超え証拠が消えたら原因／損失を確認済みにせず未確認と記録。Secretを含む取得結果は共有停止・秘匿してから再確認 | 発生／認知／採取時刻とtimezone、SHA、request ID（提供なしなら未取得）、routeのパターン、status、安全なerror分類、migration版、Provider利用量／残量、最終成功時刻。password・Cookie・token・DB URL、認証ヘッダー・body原文を保存しない。保存権限・保持期限・削除担当は未定 |
| 休止と無料枠の監視 | Provider利用量、静的ページ到達、実利用時のエラーを主体に確認し、DB readinessは配備／復旧／障害切分けで必要な時に限定。無利用→休止→初回の合成Flowでcold／warmを別記録する | [`/api/health`](../../apps/api/src/app.ts)は毎回`select 1`する。[Composeの2秒probe](../../compose.yaml)を外部常時監視へ転用しない。高頻度pingでcold startを隠さない。休止阻害・枠超過見込み・有料条件なら公開判断を停止／再検討 | 監視頻度／手段・CU-hoursと呼出し数・DB接続数・初回／後続応答・月間利用仮定。確認頻度、残量の停止閾値、不在時の停止／代替デモ担当は未定。通知を費用の強制上限としない |
| 同期予測と業務API | 隔離localで3合成userが保存＋Today＋session確認を同時に行う条件を定め、両予測入口のCPU／wall time、業務API別p95、待ち行列／event-loop待ち、DB接続数、失敗率を測る。予測回数・同時数・間隔と月間予算を検討する | 認証の既存rate limitを予測×業務APIの予算として流用しない。同期処理が業務要求を詰まらせるかを確認。T-14の500ms未満と旧546.83ms FAIL／CRUD p95 5秒超を保全し、未合意のp95や予算を合格基準にしない。予算未決・既存性能未達なら公開受入を止める | 測定環境／入力／seed／config／件数と各実測、観測できないqueueは未取得、localと公開の差。Node wall timeをVercel Active CPUへ換算しない。公開負荷はProviderの許可と別承認後。新rate limit・worker等はこの文書で採択しない |
| 復元と再開 | 下の[復旧tabletop](#復旧tabletop削除認証正常更新の巻戻し)を行い、隔離復元・削除再適用・認証無効化・データ損失の扱いを決める | session失効だけで復旧完了にしない。削除A・旧password復活、正常更新Bの巻戻し、schema／業務／認証の不一致が残れば再開停止 | 復元時点・対象範囲・RPO／RTO・再開条件・承認者の未定を解消する。机上合意と将来の実試験を別記録 |
| デモ・引継ぎ・公開資料 | [Demo Seedの当日受入](demo-seed.md#当日受入と代替デモの引継ぎ83)から相対日と新Goal IDを確認し、主要Flowの代替録画／資料と同一SHAを揃える。担当交代と通信障害を机上で試す | 代替デモの入口・日付・担当が不明なら「準備済み」にしない。実公開URLの機能QAと録画を区別する。Freezeの締切時刻／timezone／提出先は#19で確認し、10/12という日付だけで提出可としない | 説明／操作／代替担当・リハーサル記録は未定。license選択、依存Notice・配布物のSBOM（依存部品一覧）確認も未完で、責任者が対象版／配布形態／必要表示を確認する。未確認から法違反を断定しない |

### SPA/API更新の互換境界（#192）

R-11 Today contextの必須`answerRevision`追加は、旧SPA／新APIでは追加項目、新SPA／旧APIでは必須項目欠落としてstrict schemaに拒否される。SPA/APIを同じbuildで配備しても、既に開いている旧SPAのコードは更新されない。画面内の「再読み込み」（queryの再取得）では回復せず、**新APIと新assetsがそろった後のブラウザ全体reload**が必要。API schemaを緩めたり版を0に補完して混在を受け入れない。

公開先の次の確認は**未実行**。初回公開で旧clientが存在しない場合はその根拠を記録して更新試験を適用外とし、初回の主要Flow確認は残す。旧clientがある運用では、承認された合成Goalだけで旧SPAのタブを保持→新SPA/APIのSHAを確認→旧タブのToday再取得が契約不一致を拒否し画面内再取得だけでは直らないことを確認→ブラウザ全体reload→新assetsと新APIでGoal/Todayの回答版が一致し主要Flowへ戻ることを確認する。新SPA／旧APIも拒否したままで、API更新が確認できるまで成功扱いにしない。

期待SHAと実際のAPI／assetが違う、全体reload後も旧assetまたは契約不一致が残る、混在版の予測を表示する場合は公開更新の受入を停止する。証拠には旧／新SHA、日時、asset URL、両版の組合せ・schema拒否、全体reload後の合成Goal/Today整合、適用外の理由を残す。担当・公開操作は未定で、この手順からデプロイを実行しない。

### 復旧tabletop：削除・認証・正常更新の巻戻し

現存する[復元後session失効手順](../../experiments/architecture-verification/candidate-1.7.7/RESTORE-PROCEDURE.md)は隔離候補1.7.7のSupporting Artifactで、本番採択・Neon PITR試験ではない。そのCLIを本番へ転用しない。[Goal DELETE](../../apps/api/src/goals/store.ts)はhard DELETEで、[記録とuser参照](../../apps/api/migrations/0001_goal_action_log.sql)・[demo marker](../../apps/api/migrations/0004_demo_seed_goal.sql)はCASCADEする。通常の削除とbackup内の寿命は別に確認する。

演習では紙上の時系列 `t0 backup → t1 Goal A削除／password変更／Goal B正常更新 → t2 障害 → t0へ復元` を使う。user削除も別例にする。古いbackupからAと旧認証行が再出現し、Bの成功済み更新が失われ得るという仮説を扱い、実データを復元しない。

| 順序 | 手順と受入／停止条件 | 証拠・決めること（すべて未実行・未定） |
| --- | --- | --- |
| 1 隔離と復元点 | 外部受付停止・drainの方針を決め、元DBを保存したまま新しい隔離先に復元する計画を立てる。接続先／時点／対象範囲が確定しないなら進めない | backup方式・頻度・暗号化・保存先・閲覧権限・寿命／廃棄、元DBと隔離先の識別。Neonの保持窓だけに依存せず、削除・復元担当と中止期限を指名する |
| 2 削除と認証 | 復元外の削除記録をどう保管・照合するか、A／userの削除再適用、全旧sessionの失効、旧password／accountの無効化と本人確認・再設定を決める。手段が未実装／未採択なら再開しない | 削除の合成ID・時刻・再適用結果、旧Cookieは401、旧passwordが認証できず正当な再設定後だけ新login可能という将来の期待値。秘密値は記録しない。MVPのpassword再設定の有無と公開範囲は採択待ち |
| 3 正常更新の損失 | Bの最終成功と復元点を比較し、復元点以後に失われるGoal／記録／回答を列挙。再入力／救済の可否と利用者への説明を決め、黙って復活・消失させない | RPO＝許容するデータ損失の時間、RTO＝復旧までの許容時間、その目標と実際の時系列を分ける。許容損失・通知対象／担当・保存期間終了時の削除方針が未定なら停止 |
| 4 再開判定 | 期待migration版／checksum・合成Goal／Today往復・権限分離・旧認証拒否を確認し、アプリRollback先とDBの互換性・損失処理を照合して再開を判断する | 採択者・実施者・確認者、合格／停止の記録、再開時点、未回復の範囲。担当／保証は創作せず、机上で決めた条件を隔離実試験で満たすまで復旧確認済みにしない |

## リリース担当者が行うこと

1. MVP → Feature Complete → Release Candidate → Code Freezeの順に、対象Issueの完了条件と未完了Mustを確認する。GitHub Milestoneの旧検討記録は[履歴](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/archive/music-exploration/docs/operations/development-foundation-status.md#外部操作の引き継ぎと承認待ち)を参照し、次案で必要性を確認する。
2. 対象PRの別メンバーのApprove、CI結果、実機確認、仕様・ADRの更新を確認する。文書チェックのみの成功をアプリ検証済みと扱わない。
3. DB実装ではSchema変更をGit管理したMigrationとしてレビューする。Development Seed、Demo Seed、Test Fixtureを区別し、デモ用データに実在ユーザーのSecretや個人情報を混ぜない。
4. 公開先決定後、Deploy成功・Environment・Migration・Demo Seed・主要Flow・エラー表示・Responsive表示を確認する。Productionの手動変更は理由と手順を記録し、承認を受ける。
5. 正常動作したcommit SHA、検証結果、既知の制約、使用URLと提出資料をリリース記録へ残す。Tag名はチームで決める。HTMLの`v0.1.0`等は例であり予約済みではない。
6. Tag / GitHub Releaseの作成・公開は対象SHAと内容を示して承認を受けてから行う。最終版は2026-10-12のFreezeまでに固定する。Freezeの締切時刻・提出条件は[Issue #19](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/19)で確認する。

## デモ担当者が記入・確認すること

| 項目 | 現在 | 完了確認 |
| --- | --- | --- |
| 担当者・所要時間・説明順 | 未定 | 説明担当と操作担当で通し練習 |
| 使用URL・対象Release SHA | 未定 | 別メンバーの端末から到達 |
| Demo Account | メール＋パスワード認証（[R-01](../product-spec.md#requirementsmvp)、#75でローカル実装済み）。公開環境のアカウントは未作成 | 利用権限を確認。資格情報は承認済みの手段で共有。認証の試行上限（既定: 1接続元60秒に5回）はデモ会場の共有回線に合わせて`AUTH_SIGN_IN_MAX`で調整する |
| Demo Data・初期状態への戻し方 | 再開が早いGoalと遅いGoalの合成記録（[R-09](../product-spec.md#requirementsmvp)）。[Demo Seedとreset](demo-seed.md)で認証済みuserIdの専用2Goalだけを作成・置換する | 開発データと分け、手順を再実行できる。公開環境・恒久Demo Account・Webの通し確認は未実施 |
| 操作手順・期待結果 | [Core User Flow](../product-spec.md#core-user-flow)。期待結果は実装後に記入 | 主要Flowを順番どおりに再現 |
| 通信・アプリのAPI（`/api`）障害時の説明 | 未確認（アプリ実装後に確認） | タイムアウト・エラー表示と代替デモを事前確認。MVPにない外部APIの採用を前提にしない |
| Backup Plan | 未定 | 許可された録画・画面資料などをチームで決める |

MVP完成後に主要デモFlowをPlaywright CLI＋SkillによるE2E対象にする。実装前に空の成功テストを作らない。

## 障害時

直前の正常Releaseと対象commitを特定し、公開先に合った復旧方法を確認する。
アプリを戻してもDBのMigrationが自動的に戻るとは限らないため、互換性とバックアップ・復元手順を確認してから実行する。
問題PRのRevertは通常のPRでレビューする。Production操作、Tag移動、データ削除を無断で行わない。
障害時に別のSecret管理サービスへ切り替えたり、Secret実値を画面共有したりしない。
依存更新は対象Issueで必要なものに限り、固定版・変更内容・既存検証への影響を確認する。認証依存の更新とDB復旧の担当・手順は公開前に確認し、未定の担当を推測しない。Migrationの互換性・適用順・バックアップと復旧結果は既存のリリース記録へ残す。
障害調査に必要なログでもパスワード・Cookie・Token・DB接続文字列を出力せず、共有前に秘匿を確認する。
