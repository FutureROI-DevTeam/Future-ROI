# #340 開発ハーネスの実装・検証記録

## 実Codex接続の追加契約

依頼者の続行指示で、前段のfixture-onlyを完成とせず、既存購読認証のCodex 0.151.0を構造化差分生成に接続する。対象は #340 の検証fixture。backlogの未決製品仕様や実人確認へ許可を広げない。変更対象はworker adapter・台帳・CLI・回帰・運用文書。

受入は実モデル生成→固定パス検査→無認証Docker→既存ci-report→候補commit/patch/Draft本文。モデル終了未確認は枠を保持し、初回＋修復3回・モデル呼出し予約4回・attempt 300秒・task/batch 1200秒・有効期間1時間・新規課金0を同じ台帳に保持する。費用総額はnull。失敗修復だけを自動再試行し、レビュー待ちheadは必須修正入力まで固定する。

比較: AWは前段の版/認証適合未確認を残し、新しい基盤を追加しない。既存Codex CLIのツールを固定catalog/configで除去する小さいadapterを選ぶ。shell無効のみ、自然文の禁止、認証付きcandidate containerは要件を満たさない。

事前反証で、shell停止後のapply_patch/子agent残存、global AGENTS自動読込み、CLI内部retry、auth hardlink経由の原本書換えを確認した。fake ChatGPT providerで公開tool 0と未広告shell/patch/image/agentの拒否を検査する。専用ホームには既存access tokenだけを一時複写し、refresh token・設定・Skills・メモリを渡さない。期限切れは新認証を作らず停止する。候補コードは一切そのホームで実行しない。

## 実装前の契約と反証計画

基準mainは `7beba614697ecc3098cde122e2f0305842962812`。2026-11-12の依頼に限定したローカル比較試行であり、製品仕様・AW・無人運用の正式採択ではない。

変更は `scripts/development-harness/`、関連回帰、既存CIへの回帰接続と運用文書。製品コード・予測の意味・保存再送・owner・質問条件を変えない。

既存Codexで準備する差分を受け取り、有限契約→隔離適用→固定受入→既存検証→Draft用成果物を作る。まず無害なfixtureで通す。controller、scheduler、DB、dashboard、一般publisherは作らない。

| 失敗仮説 | 確認方法 |
| --- | --- |
| 成功ログだけで誤合格 | 候補の実出力をhostから照合し、偽TAP成功fixtureを拒否 |
| 候補が採点・結果を書換え | Docker read-only mountとhost専用結果へ実書込みを試す |
| revision・再起動で予算リセット | Issue単位台帳、開始前予約、再起動・別batch・revisionの回帰 |
| 取消だけで枠解放 | containerの終了をinspectし、生存不明では枠を保持 |
| 書込み応答喪失で二重発行 | intentを先に保存、再送禁止・照合の状態遷移回帰。実publisherは無効 |
| 古いSHA・skip・偽producer | CIのhead/checkout/workflow/job/producer/run/attemptの回帰 |
| レビュー中の勝手な更新 | 必須修正証拠がない再開を拒否 |

事前独立診断 PF-01〜PF-06 は上記境界を指摘。正常ログだけでは不十分という反証から、候補外の出力照合と実書込み拒否を実装した。

## 環境・比較

- GitHub MCPでIssue #340を作成。元checkoutはPR #339の別作業で変更せず、専用worktree/branchを作成。
- Open backlog 33件を確認。#337は専用作業あり、#336は未採択、#244/#261/#291などは判断・実利用者受入が残る。Open/Readyだけを許可とせず、実証はfixtureとする。
- Notion [改訂v3の13〜19節](https://app.notion.com/p/416905b91c7b8119a595cd6745658add)を参照。設計案として扱う。
- AW CLI未導入、Codex CLI 0.151.0はChatGPT認証。[v0.93.5のCodex資料](https://github.com/github/gh-aw/blob/v0.93.5/docs/src/content/docs/reference/engines/codex.md)は購読認証非対応。固定版のcompile/lock生成・認証・利用枠を検証できていないためAWは使わない。
- 将来AW比較時は `continue-on-error: false`、`protected-files: blocked`、task別 `allowed-files` を明記し、固定compilerの生成lockと実拒否を再検証する。設定例だけで有効化しない。
- GitHub mainは取得時 `protected:false`。新規権限・課金・Secrets・保護変更・merge・配備・定期実行を行わない。実装PRと実証PRは別。実証publisherは無効。
- 旧ML runnerは履歴の設計参考だけを確認。旧大会のFreezeを現在の実装依頼の禁止へ読み替えず、旧queueやCLI権限を復活させない。

## 結果

実装の最終検証SHAは `f08a74d94c513ab2d61ed53fa40b641870a0e589`。その後の変更はこの証拠記録と文書配置のみ。専用branchは `chore/340-development-harness`。

| 検証区分 | 実行と結果 | 保証しないこと |
| --- | --- | --- |
| 静的・文書 | `git diff --check`、既存 `npm run verify:foundation` 成功 | アプリの動作・実GitHubの権限 |
| ローカル状態・既存回帰 | `node --test scripts/development-harness/state.test.mjs .github/scripts/ci-report.test.mjs scripts/development-harness/runtime.test.mjs` 24/24成功、skip 0（状態12、既存6、実Docker6） | 実Issueの選定・人の判断・実PRのCI |
| 固定runtime | Docker 29.6.1、Node 24.22.3のdigest固定image。状態11＋既存6もNode 24.22.3で17/17成功（最後の状態追加1件はhost Node 22.15.1で検証） | WindowsホストのNodeは24.22.3ではなく22.15.1。Linux GitHub runner上の全体実行は未確認 |
| 実権限境界 | policy/検査入口/結果へのwrite、rename、symlink経由の6操作を拒否。host認証canary未到達、socket/HOME/.git未mount。正常fixtureは動く | container escape全般、実モデルcredential経路 |
| 偽成功・修復 | 誤った減算、偽TAP＋exit 0を拒否。同じ台帳で修復後に成功、試行3・予約180秒を保持 | 実利用者の理解・予測精度・製品受入 |
| 中断・取消 | 生存containerは枠保持、実CLIをkillしてからの復旧、created→遅いstart拒否、遅い候補を期限停止 | daemon障害時の時間内終了、結果不明の外部書込みの実照合 |
| 実CLIの一件通過 | `init → enroll → run` で `artifacts-ready`、候補Git object・patch・Draft本文・結果を作成 | PR発行・CI完了・Issue Close |
| 実認証PR→CI | 未実施。main保護がfalse、利用枠・publisher認証境界未確認のためpush/Draft発行は見送った | 自律運用完成・費用削減 |

結果保存例は専用worktreeの `.local/harness-340-demo/fixture-addition/1/`。`results/result.json`は数値・固定診断・SHA・imageのみで、raw transcriptや認証情報は保存しない。台帳は `.local/harness-340-demo/ledger.json` に残る。これはfixture実証成果物で、ハーネス実装PRの本文案とは別。

このCLI実証のbaselineは `f08a74d94c513ab2d61ed53fa40b641870a0e589`、候補commitは `032d973127a4f5968caef32ae37f304a9fe98420`。最終確認時に実行中のharness containerは0件。既存図の回帰も34/34成功し、図のsourceは変更していない。

## 敵対的診断・指摘の検証

別コンテキストの事前/途中reviewerと完了前reviewerを使用し、いずれもコード・合否条件は変更させていない。指摘数や全員の同意を合格の根拠にせず、次の元経路と修正後の証拠で確認した。

| ID・重大度・対象 | 成立条件と具体的悪影響、既存防御 | 最小修正・再確認 | 状態・残る不明 |
| --- | --- | --- | --- |
| AR-01 Blocking / `d5fcd32` state cancel/resume | レビュー待ち・受入済みへcancel→resumeすると必須修正なしで再実装できた。authorizeRepairのhead検査を別入口が迂回。reviewerが3状態で再現 | 取消を修正許可とせず、レビュー待ち/受入済みの状態を保持。対象3状態・eligible・実行中取消を回帰。最終SHAで12件の状態回帰をreviewerも独立実行 | 再確認済み |
| AR-02 Blocking / `d5fcd32` state/runtime | lifetime残り1msでも60秒を開始、Docker停止とGitに共通deadlineなし。開始条件は再現、遅いGitはコード確認 | 全試行分の期限残量を要求。実行/終了/Gitのdeadline共有、15秒の終了予約、超過実時間を累積。予約後のgit showも前提確認へ移動。期限直前の状態回帰と実Dockerの遅い候補で確認 | 再確認済み。実Git遅延注入、daemon障害時の時間内終了は未確認で保証しない |
| AR-03 Should Fix / `d5fcd32` runtime create/recover | image欠落など予約後create失敗は実体なしのため復旧が止まる。UNKNOWNを枠解放しない防御は安全側 | daemonと固定digestの前提確認を予約前へ移動。実試験でtag@digest alias差に遭遇し、repo@digestで確認する修正後に正常経路を再検証 | 前提失敗の部分は再確認済み。create応答喪失・実体不明の自動回復は実装せず人へ引継ぎ |
| FR-01 Blocking / `e6fb9ae` runtime recover | createdを停止済みとして枠解放した後、元controllerの遅いstartが起動できた。label照合だけでは防げずreviewerが実Dockerで再現 | stop/inspect→対象実体rm成功→枠解放。rm不明は保持。実Docker回帰で遅いstartを拒否。最終SHAでもreviewerが独立に同経路1/1成功 | 再確認済み |
| FR-02 Should Fix / `e6fb9ae` state resume/reconcile | 取消中にPR照合が成功してもresumeが古いwrite-unknownへ戻す。実publisher無効なので実外部操作はなし | 照合後の現在状態を保持。取消→照合→再開の状態回帰を追加 | 再確認済み。実APIは未接続 |

完了前reviewerは最終SHAで状態12/12とFR-01の実Docker1/1を独立実行し、限定したfixture経路に未解決Blockingなしと報告。実装担当の24/24とは分ける。安全性・費用改善の一般的証明ではない。

## 自己レビュー・未確認・引継ぎ

review-gateの対象はIssue #340、契約・権限・状態・固定検査・回帰・文書同期。製品UIを変更していないため全画面・全端末・実利用者試験は追加しない。Product Specの意味・保存/再送・owner・初期質問は変更不要。新しい操作・予算・復旧は運用文書、限定比較の位置付けはArchitecture D-36、入口はREADME/AIツールガイド/変更対応表へ同期した。

前段の `f08a74d` 時点では、AW固定版compile/lock、実モデルworker、実Issue/既存branch/PR照合、publisher、PR後CIの取得は未実装・未検証だった。続行での実モデル接続は下記に別記する。現在の残項目は[設定差分](../operations/development-harness.md#実接続へ進む前の設定差分)を参照する。fixture限定を汎用開発workerと呼ばず、実Issueを完了扱いにしない。

人の導入・操作・レビュー・復旧時間、受入価値、総費用、実運用の誤完了率は未計測（null）。新規モデル課金呼出し0という性質と、総費用が0円という主張を区別する。基盤が人の負担を減らすという効果はまだ主張できない。

## 続行の診断・修正・再確認

レビュー対象は `e600f285` に対するCodex接続差分。実装担当はportable状態12＋Codex4、実CLI偽認証/停止復旧4、Docker6、既存ci-report6を実行し、いずれもfail/skip 0。Foundationも成功。最初のDocker再試験はimage参照形式の不一致で3件失敗し、固定digestを維持したままtag@digest/名称@digestの照合を修正した後6/6成功。失敗を成功集計へ含めない。

別コンテキストreviewerは元コードと差分を読み、状態/Codex16件と実CLI偽認証/実process4件を独立実行した。実tokenをreviewerへ渡さず、本番攻撃・本番データ・人の模擬回答は使っていない。

| ID・重大度・箇所 | 成立条件・影響・既存防御の不足 | 最小修正・再確認の証拠 | 状態・残る未確認 |
| --- | --- | --- | --- |
| CR-01 Blocking / codex-worker readQuota・runtime recover | quota子の未登録、または古いsnapshot後に推論子が登録された状態で復旧すると、親停止だけで枠を空け得た。既存Docker確認では認証processを追えない | probe/quota/liveのPID/開始時刻/pathを記録。owner停止後に最新台帳を再読し最新子の停止を確認。無害な実processを使うsnapshot切替回帰を実装者・reviewer双方で成功 | 再確認済み。実tokenの異常停止は未注入 |
| CR-02 Blocking / generateProposal・invoke | 取消済みでもquota後に推論を開始する窓、cancel判定例外でtimer前にrejectし子が残る経路。後者をreviewerが無害Nodeで生存再現 | 開始transactionで取消/所有/期限を確認。stdin送信直前も確認し例外ならkill→close待ち。既取消でprobe開始なし、判定throw後PID不存在の回帰成功 | 再確認済み |
| CR-03 Should Fix / state・契約 | modelCallsは実HTTP推論回数ではなくCLI起動予約だった。mock自体が2 requestsであり、誤った費用上限説明になる | maxModelRuns/modelRunsへ変更。HTTP/stream retry0と時間上限、request数未計測を文書化 | 再確認済み。総費用・実request数はnull相当の未計測 |

事前診断のglobal AGENTS読込みとauth hardlink原本更新は固定版ソースで確認し、隔離ホーム＋ACL確認後のaccess/idのみ複写へ変更した。hardlink案は利用枠read-only確認後に破棄・unlink済み。最終adapterは原本を変更しない。CLIの構成は[公式設定リファレンス](https://learn.chatgpt.com/docs/config-file/config-reference)と固定版ソース、実native probeを照合した。最新版のToolPolicy APIを固定0.151.0で使えるとは仮定しない。

## 実Codex接続結果

実装SHA `379a284abb0d612ac07007d1b23ddf0dbffd2957` で、既存ChatGPT認証を使う `run-codex` を1件実行した。基準mainは再読して `7beba614697ecc3098cde122e2f0305842962812` のまま。モデルは固定 `gpt-6.1-sol`、CLI 0.151.0。Codexがfixtureの `a - b` を `a + b` へ修正し、候補commit **`2999517d824c436ffed7896cfde9355fe6e33b8a`** とpatch/Draft本文を生成した。実backlogの製品Issue完了ではない。

- 実行台帳: 専用worktreeの `.local/harness-340-codex-live/ledger.json`
- 実証成果物: `.local/harness-340-codex-live/fixture-issue-340/1/`
- `artifacts-ready`、attempt 1、修復0、時間予約300000ms、実経過15624ms、active null。入力600/output72 tokens。総費用・人の時間はnull。
- 隔離Docker書込み拒否6件、不要認証なし、外側の整数出力照合、固定baselineのci-report回帰6/6成功。PR後CIはnot-run。
- 実行直前の購読利用27%、追加creditsなし。API key/refresh tokenをworkerへ渡さず、終了後に専用authホーム不存在を確認した。再送の `run-codex` は新しいモデル起動・attempt・head変更なしで正常終了した。
- `model-result.json` 初版の `requests:2` は**fake tool-boundary probe**のHTTP件数であり、実推論要求数ではない。混同を防ぐため後続コードでは `toolBoundaryProbe` に分離し、`inferenceRequests:null` と明示する。元の実行証拠を改変しない。

実認証モデル→生成source→隔離検証→候補commit/Draft成果物の経路は実測した。実モデルの初回は成功のため、修復・偽成功・中断の異常系は無害なfixture/偽認証/実process試験の証拠として分ける。publisher、PR→CI取得、任意Issueの自律選定/実装、実利用者受入、費用/人手削減は未検証のまま。Issue #340はOpen、main merge・配備・追加権限/Secrets・定期起動は行っていない。

## 実Issue profileへの拡張計画（2026-11-13）

固定main `7beba614697ecc3098cde122e2f0305842962812` から #331 の比較資料1ファイルを生成する。対象は `repository-docs-v1`、実装は `docs-runtime.mjs` と小さな `github.mjs` publisher。旧runnerの復活、scheduler、DB、queue、自動mergeは追加しない。採択や製品変更を行わない比較資料を選ぶ理由は、Issueの残る判断を具体化でき、履歴や依存を変更せず独立レビューできるため。

mainは現在active rulesetsで保護され、既存GitHub認証にpush権限がある。AW v1.2.2の[固定版Codex仕様](https://github.com/github/gh-aw/blob/v1.2.2/docs/src/content/docs/reference/engines/codex.md)はChatGPT購読認証を非対応とする。Actions secretsは空で、新API/Copilot認証を追加しないため既存ローカルCodex経路を継続する。以前のmain未保護は当時の観測として残す。

受入は、exact new fileの差分のみ、基準mainからの候補commit、実OS権限制御による検査/結果書込み拒否、全状態PR/branch照合、write-ahead外部操作、同じ台帳の累積時間/回数、必須CIのhead/checkout/producer/run/attempt/step照合。製品Issueの受入やCloseを自動化しない。Foundationのリンク解決はrepo外へ出得るため、秘密情報のないread-only Docker snapshot内だけで候補文書を検査する。

事前失敗仮説: 旧Issue本文だけを読んで解消済みalertを再報告する、TypeScript供給元を親実験環境と誤記する、docs-only CIを依存分離の証拠にする、候補branchへハーネス差分が混ざる、応答喪失を再POSTする、古いmerge成功を流用する。固定source/lock抽出/最新コメント、差分制限、隔離検査、台帳CAS、実runログで反証する。モデルの比較文書は独立レビュー対象とする。

途中独立診断IR-01〜04: 古いwrite-intent照合が新Draft intentを消す競合、取消後照合の行き止まり、CI checkout/必須step欠落、観測APIの共通期限欠落を確認。UUIDとCAS、取消中read-only照合、実checkout＋必須step、共通deadlineと観測予約/実測を追加した。無害な交錯・応答喪失・skip・古いSHA・遅いpaginationの回帰で再確認する。修正前はBlocking、最終状態は後続の検証記録を参照。

## 実Issue経路の実接続（2026-11-13）

現在の到達点は実Issue #331 の限定比較資料をCodexが生成し、隔離検査から実Draftへ接続した状態である。上記fixture-only、main未保護、publisher未接続は各時点の履歴。ハーネス実装は[Draft #344](https://github.com/FutureROI-DevTeam/Future-ROI/pull/344)、新ハーネスの実証成果は[Draft #346](https://github.com/FutureROI-DevTeam/Future-ROI/pull/346)。両IssueはOpenのままで、製品判断・採択・merge・配備を行っていない。

### 実接続と検証証拠

- 基準main: `7beba614697ecc3098cde122e2f0305842962812`。候補: `e8e19098bd87f476b8c4cf2893124915d588c2a6`、branch `docs/331-harness`。mainを親とする比較文書1ファイル81行だけの追加であり、ハーネス差分を含まない。
- 生成・隔離検査controller: `8810e4bb648a0157237d5b4df15faf03771eb44c`。publisher: `6c2afbc4cc100e22394e76106f01e52fce6ad6ba`。最初の試行はe62f328＋未commit adapterであり、e62f328単独の実証とはしない。
- 同じ `.local/harness-340-codex-live/ledger.json` を継続使用。過去fixtureのattempt/費用不明/消費を保持し、独立検証済みfixtureのみ受入記録で枠を解放した。#331 はattempt2・モデル起動予約2、生成前の観測を含む予約660000msを発行前に累積保持。以後のpublisher/CI観測も同じtask/batchへ加算する。
- Codexの実入力/outputは初回10349/3424、2回目10406/3300 tokens。総費用、人の操作・レビュー・復旧時間、誤完了率、費用削減は未計測null。成功PR数を成果指標にしない。
- attempt1は生成・隔離拒否5件まで成功したが、Foundationが個別15秒制限を超えて停止。無認証read-onlyの同じ固定検査を単独再実行して成功を確認。attempt全体300秒は維持し、個別commandを残時間内の最大180秒へ修正。attempt2でFoundationと固定ci-report6/6、skip0、policy/検査入口/結果/symlink書込み拒否5件が成功し、Docker停止後にcommitを作成した。
- attempt2のproposal、snapshot文書、candidate commit本文が完全一致することを独立reviewerが確認。manifest・3lock・workflow・runtime・最新Issue commentの元情報から文書の事実と未採択境界を照合し、Blocking/Should Fixなし。
- ローカル全体: 8810e4bで41/41成功、skip/cancel/todo0（状態12、portable4、固定CLI偽認証/実process4、Docker6、docs/publisher9、ci-report6）。先の並列実行では中断試験1件が失敗し、証拠を保持したうえで単独6/6・全体順次41/41を再実行。基準やassertionを緩めていない。6c2afbcの変更境界31/31も成功。Foundationは125文書・2898リンクの検査に成功。
- 外部ファイル負例: hostに無害canaryを置き、snapshot文書からrepo外のcanaryへリンクした検査はmissing linkの1条件だけで失敗。リンクを除いた対照は成功。`.local/docs-outside-probe.log` と `docs-outside-control.log` に保存。候補のリンク解決をhost上では実行しない。
- 実PR作成後のCIは台帳 `tasks.issue-331.ci` にrun/attempt/job/check/発行元/実checkoutを保存する。Foundation run `43363636182`、Application run `43363636257`、どちらもattempt1。実merge checkoutは `bc38b92dc48d2705f847b9e951db5d4e5c042ec8`、source headは上記e8e1909。必須CIの最終照合は後続記録を参照。
- `run-issues` の同batch再送で追加生成・attempt増加・head更新なし。レビュー待ち上限1を維持し、稼働目的で仕事を追加しない。

8810e4b試行receiptの `existingCheck.checkoutSha` は検査ソースの基準mainを格納していた。実際の合成snapshot Git HEADは `2e6bffec0ab70e00d6f2032e5916dee6bfadb9e0` で、候補文書はそのsnapshotの未追跡ファイルだった。6c2afbc以後は実際の `snapshotGitHead` とsnapshot内容の区分を記録する。旧receiptは改変しない。PR後CIの実checkoutはjobログから別に確認しており、基準mainを実checkoutへ読み替えない。

### 今回の独立診断・修正・再確認

| ID・重大度／対象 | 確認した成立条件と影響 | 最小修正と再確認の証拠 | 最終状態・限界 |
| --- | --- | --- | --- |
| IR-01 Blocking／e62f328＋途中github差分 | Aの古いpush照合がBの新Draft intentを消し、POST2回。各transaction lockだけではsnapshot競合を防げない | intent UUID＋CAS。nested controller再現でPOST1回、別intentの上書きを拒否。8810e4b回帰・独立再実行 | 再確認済み。実GitHubへの応答喪失注入はせず無害IOで検証 |
| IR-02 Blocking／同publisher | cancel中の照合拒否とresumeの未確定拒否が両立し復旧不能 | cancel中もread-only照合、新規POST0。取消flag維持、照合後resumeを回帰確認 | 再確認済み |
| IR-03 Blocking／同CI判定 | Set up jobだけでも成功、実runのcheckout未照合で古いmergeを流用し得る | 固定必須step集合、実jobログのcheckout/source、App15368/run/attempt照合。step欠落/skip/旧checkout/旧attemptを拒否 | 再確認済み。文書意味・採択はCIの外でレビュー |
| IR-04 Blocking／同API予算 | 各ページtimeoutだけで総時間が延長され、観測費用が累積されない | 共通deadline、事前予約、実経過/超過記録。遅いpaginationを途中停止しJSON再読でも累積保持 | 再確認済み。20ms実時計試験のI/O依存をfake時計へ修正、条件を維持 |
| IR-05 Blocking／同jobログ取得 | ghがANSI入り実ログを拒否しCI照合不能 | raw取得だけallow-escape-sequences、表示せずANSI除去後SHA抽出。既存実runと#346の完了jobで確認 | 再確認済み。Job/Check ID不一致仮説は実レスポンス一致を根拠に棄却 |
| CR-04 Blocking／e62f328＋途中accounted | 禁止fixture publishでundefined予算を加算し、300000がJSONnullへ破損 | accounting前のmode/権限確認＋正のsafe integer。8810e4bで拒否前後の台帳完全一致、独立9/9 | 再確認済み |
| IR-06 Blocking／e980ad5 | 本文言及だけの#344は偽競合。一方exact pathだけに絞ると同Issue別filenameを見逃す | 全open PRとIssue言及closed PRの実filesを確認。同Issue文書prefix/rename前も拒否、#344の別scopeは許可。6c2afbcで元経路を独立再確認 | 再確認済み。過去PR全件を意味的に理解したとは主張しない |
| SR-01 Blocking／a4bad24のCI再観測 | API例外で以前のreview-ready/ci.passedが残り、受入可能。観測中の必須修復もhead一致だけでreadyへ上書きし得る | 観測・予算確認前にci-waitへ失効、UUID＋head/state/active/write/cancelで完了CAS。旧/新原コードのGitHub I/Oだけを隔離stubにし、旧版の受入true→修正版falseを独立再現。予算切れ/修復競合/別観測/取消を含む12回帰成功 | 再確認済み。通常の実#346 CIを新経路で再観測しreadyへ復帰、head不変 |

実Issueの独立レビューは実装担当とは別コンテキストで行い、reviewerは対象コードを変更していない。文書の内容確認、台帳/commit/Docker照合、指摘の再現を実施した。総意を安全証明にせず、残る範囲は下記へ限定する。

### 残る設定・未確認

- mainは現在protected:true。active rulesets（27171824/27172127）の共通main安全条件・必須4checkを確認済み。Notion改訂v3の13〜19節も再参照したが、未適用という末尾記録は現在のGitHub実状態へ優先しない。
- AW v1.2.2は購読認証非対応。今回のローカルCLI→Draft→CIに追加認証/Secrets/保護変更は不要。将来AWを使う場合のみAPIキーまたはCopilot権限、固定版compiler/lock/拒否probeが別途必要。
- GitHub Projectsは既存gh認証にread:projectがなく、MCPでも対象Projectを取得できなかった。Project Status更新は未実施。必要なら対象Projectへの既存接続を直すか、別途project権限を判断する。Issue/PR本文の開発情報は更新するがProjectsを更新済みとはしない。
- #331の比較対象の採択、依存の移設/更新、旧比較の再現、実人による受入は未実施。docs-onlyでQuestion prior UI candidate workflowは起動しない。製品画面変更はないので全画面/端末/実人試験を追加していない。
- publisherの同じDraftへの必須修正FF経路はローカル検証・コード確認の範囲。今回の実PRに不要な修正を注入して試さない。実本番データ・秘密を使う攻撃試験、一般的なcontainer escape証明、無制限/任意Issue運用、費用や人手削減は未確認。

### 実証Draftの最終CI照合

#346 の必須4件すべて成功。Application `43363636257` とFoundation `43363636182`（各attempt1）のjobログから、checkout `bc38b92dc48d2705f847b9e951db5d4e5c042ec8`／source head `e8e19098bd87f476b8c4cf2893124915d588c2a6` を取得し、App15368・必須step・現在のPR merge SHAと照合した。台帳は `review-ready / ci.passed:true`、active/writeIntentなし。独立reviewerもGitHub APIと各実jobログを直接確認した。headを変更せず、人の文書レビューと#331の採択判断を待つ。

最後に同じDraftへの必須修正FF経路の無害IO回帰を追加し、push1・POST0・旧CI破棄・draft-createdへの復帰を確認した。戻り値が古いartifacts-readyになる表示の不整合を修正した。docs/publisher回帰は10/10成功（既存9件と重複加算しない）。実PRへ不要な修正は加えていない。実装PR #344 の最終headのCIはPR側の実runとIssue開発情報で追跡する。

その後SR-01の必須修正を加え、docs/publisher12/12、隣接状態/Codex/ci-reportを含む34/34、skip0で再確認した。a4bad24の実装PR CI4件も成功済み（Application43364555164/Foundation43364555125、attempt1、checkout97d017016affa7ab0f2b2bac7d96802bfd6e326e）だが、後続修正のCIへ流用しない。新しい最終headをpushし、全必須CIと実checkoutを別に確認する。

## 2026-11-13 コード修正profileの追加計画

ユーザーが #253 指摘2の限定修正を採択した。保存後通知・未保存試算の絶対値1,000以上の整数部を落とさず表示し、1,000未満の3有効桁、計算・保存・owner・他4指摘は維持する。#346の成果物レビュー確認も明示され、同じ台帳のhead・累積予算を保持してレビュー枠だけ解放済み。

- 変更対象: 対象2部品だけを生成できる固定profile、既存Codex/状態/publisherへの接続、immutableな回帰入口、運用記録。候補workerにテスト・CI・policy・依存・ハーネスの変更権限を与えない。
- 採用理由: 文書専用入口を任意コード実行へ一般化せず、既存のJSON source生成とDocker/ci-report/branch照合を再利用する。AWの新認証・常駐controller・新DBは不要。
- 受入: 1234/負値/大きい整数、1,000未満の境界、null/0、既存の保存・試算回帰、実Chromiumの2部品表示、型/build。独立レビュー後に同headのDraft→実CIを確認し、IssueはCloseしない。
- 失敗仮説: 3桁丸めを直して微小値を0にする、負値の符号を壊す、保存ロジックやARIAを変更する、候補が検査を弱める/偽TAPを出す、別branch重複、古いレビュー/CIを流用する。固定mainの検査・依存をread-only imageへ置き、候補はexact2fileのread-only mount、policy/results書込み拒否を実測する。生成・build・publisherは別process/権限とし、候補に認証を渡さない。
- 予算: 新しい作業ID issue-253、同一台帳、worker1/レビュー待ち1、初回1+修復3、attempt300秒/task・batch1800秒/lifetime24時間。追加課金0、総費用/人の時間は未計測null。実装・診断は本セッションの有限作業で、指摘の好みを理由に反復しない。

実装前の独立確認で、未実装・採択済み・重複なしのOpen Issueが見つからなかった。#253指摘2の限定案と#346のレビュー枠を質問し、依頼者の明示回答後だけ進めた。旧mainの実Chromium検査は `+1,230pt` / 期待 `+1,234pt` で失敗、同じ隔離imageの既存保存/試算・ブラウザ・型/buildは成功。readonly直接書込み5対象、rename、symlink経由の7拒否、秘密・host Git/socket不在を実測した。image構築の実行step合計は約264秒（取得265MBを含む）、preflightは75,428ms。準備時間をworker成果の高速化や人の時間へ読み替えない。

| ID / 重大度 / 対象 | 成立条件・悪影響・既存防御 | 根拠と最小修正 | 状態 |
| --- | --- | --- | --- |
| CR-05 / Blocking / 1d5b125 code-browser-check.mjs | 許可TSXがmain worldのObject.fromEntriesを上書きすると、実描画が誤ったままDOMの観測値だけ偽装できる。readonlyはNode/ファイルを守るが同worldのintrinsicsは守らない | 独立reviewerが元の2TSX＋観測shimを隔離Dockerへ入れ、誤表示のままpass1を再現。DOM読取りをCDP isolated world/contextIdへ移し、候補のglobal/prototypeと分離。530e835で同shimを独立再実行し1,230と1,234の不一致でfail1。`.local/independent-code-review-cr05/`へ証拠保存 | 再確認済み |
| CR-06 / 必須経路の阻害 / 1d5b125 github.mjs | #253を参照したmerged #339のSaveFeedback変更を未完了競合と誤判定。生成前に停止する安全側の失敗 | 実照合でmodel0/attempt0の停止を確認。Issue固有branch/markerを持たず、merge commitが固定baseのancestorと確認できる履歴だけを重複判定から除く。未merge・同Issue・判定不能は停止を維持。17件の隣接回帰成功、530e835の実接続で生成前の照合を通過 | 再確認済み |
| CR-07 / 必須経路の阻害 / 530e835 code-runtime.mjs | 全検査後にDocker cpがtmpfsの画像を見つけられず候補commit前に停止。成功を偽らずawaiting-decision/停止確認を保持 | exec lsでは画像2枚が存在しcpだけ失敗することを隔離再現。実行中containerから固定2path/各500KBまでのPNGだけを読み、hostが保存。base64/PNG header/サイズを検査し、candidate選択path・archiveを展開しない。新経路で両PNG取得成功、code回帰6/6成功 | 再確認済み（worker全経路は再実行待ち） |

初回Foundationは追記末尾の空行で失敗し、空行修正後に125 text/2904 links成功。受入条件の弱化や検査削除では解消していない。

実Codex attempt1は入力7060/output842 token、追加creditsなし。対象2 TSXの3つのformat optionsだけを生成し、ci-report6/実Chromium1/保存・試算10/既存ブラウザ1、型/build成功。CR-07によりrun全体は失敗でheadなし。予約390,000ms・実143,936ms、過去の2回の照合を含めて台帳に保持し、失敗を削除/初期化しない。

再実行直前に別作業の#345/#342がmainへ統合され、基準が40ddc510919d85884160d512009abe4e345a1a8fへ進んだため生成前で停止した。このタスクからmain mergeは行っていない。対象2TSX・context・必須workflowは不変、変化は既存E2E終了競合と文書。新imageを固定mainから構築し、未公開/headなしに限定した基準更新を追加。予算・attempt・model回数・期限・receiptを保持する7件のcode回帰を確認し、別batchやrevision変更で迂回しない。追加preflight後の予約420,000msも引き継ぐ。

独立診断BR-01（Blocking、基準更新の実装途中）: 個別の検査path列挙ではregister-contracts.mjsとbrowser-debug-endpoint.mjsを保護できず、将来のloader弱化を見落とす。今回のmainで弱化された事実はない。root tsconfigのextends仮説はWeb設定にextendsがなく棄却した。最小修正として全code/config変更を拒否し、精査済みSHAペアの上記3pathだけ例外にした。loader/契約/config/別SHAを拒否する回帰を追加し、隣接20/20成功。基準更新内のgit/dockerにも共通remaining timeoutを適用し、最終更新直前に期限を再確認する。

作業branchへmainを通常mergeする操作は、自動承認レビューが今回のmerge禁止に反するとして拒否した。mergeは未実行、再試行もしていない。controller branchの履歴は保持し、候補の固定baseとimageだけを最新mainへ更新する経路に限定した。

## #253の実コード生成・再検証

e180a42のoperatorで基準更新を実接続し、旧fingerprint・旧base/imageのevent、attempt1・modelRuns1・期限・失敗receiptを保持した。新imageの構築stepは約285秒。独立reviewerはBR-01の拒否境界8/8と実main差分を再確認し、未解決Blockingなし。

同じ台帳のattempt2でCodexが新main40ddc510から候補 `1094fc65a2f95c19c6f6213be8eb019db3180fc3` を生成。差分はSaveFeedback.tsx/DraftProgressPreview.tsxのformat options 3箇所だけ（3追加/3削除）。ci-report6、実Chromium1（正負・大整数・微小値・999.9・null/0・ARIA・compact・390/1440px）、既存保存/試算10、既存ブラウザ1、型/buildすべて成功、skip0。readonly7拒否、秘密・host Git/socket不在、画像2枚のhost保存、worker停止後のcandidate commitまで成功した。実画面は部品を固定入力で描画したもので、実利用者・screen reader・本番確認ではない。

attempt2の入力7105/output842、2attempt合計input14165/output1684。この時点のtask予約780,000ms・実285,987ms、追加creditsなし、総費用と人の時間はnull。初回の検査成功と成果物保存失敗、main更新による生成前停止を履歴に残す。台帳はartifacts-ready、独立候補レビューとDraft後CIはこの記録時点では待ち。candidate headと結果は `.local/harness-340-codex-live/issue-253/2/` に保存する。

ハーネスの静的・ローカル回帰はe180a42で42/42成功（state12/Codex4/docs12/code8/ci-report6、skip0）、Foundation125 text/2904 links成功。実コード候補の検査とは別集計である。
