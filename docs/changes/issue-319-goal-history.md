# Goal詳細・過去履歴のローカル検証（#319）

Supporting Artifact / Not a Source of Truth

- 対象：[Issue #319](https://github.com/FutureROI-DevTeam/Future-ROI/issues/319)
- 基準：2026-11-01 JST、main `52364c75883315ee228060302be8585c741189c2`
- Branch：`feat/319-goal-history`。専用worktreeのみ。push/PR/merge/deployは実行していない。
- 正本：[P-25](../product-spec.md#p-25-goal詳細と過去記録のローカル改善319)、[D-33](../architecture.md#d-33-過去記録の編集と履歴版319ローカル検証)

## 環境と再現

Node 24.21.0 / npm 11.19.0で実行。checkoutが要求するNode 24.22.1そのものでは未検証。依存関係はlockfileどおりにnpm ciした。新しいチャートlibraryや依存は追加していない。

専用の[server.ts](../../scripts/local-319/server.ts)はDATABASE_URLを破棄し、既存のembedded PostgreSQL helperで新しいローカルDBを作る。本番.envを読まない。英語（整数分、120日）と読書（回）の合成Goalのみ用意する。起動ごとに新DBを作り、既存のDBは再利用しない。テスト用ログイン情報とGoal IDはGit除外の`.local/319/session.json`へ保存する。履歴の変更を保持したまま再起動する用途には使わない。

専用worktreeで次を実行する。Windowsではnpmの代わりにnpm.cmdも使える。

現在のローカル確認DBを保持して再起動する場合は、API terminalで`node scripts/local-319/resume.ts`を使う。Git除外の`.local/319/preserved-runtime.json`で本人確認済みのloopback DBのみ再開し、seed・migration・DB作成・削除はしない。停止済みなら既存data directoryを再開する。開発用認証Secretは再起動で変わるため、再ログインが必要になる。設定ファイルがない別checkoutでは次の新規合成DB用手順を使う。

1. Node 24をPATHへ設定し、`npm run build:prediction`、`node scripts/local-319/server.ts`を起動する（APIは127.0.0.1:4319）。
2. 別terminalでPowerShellの`$env:API_PROXY_TARGET='http://127.0.0.1:4319'`を設定し、`npm run dev:web -- --port 5319 --strictPort`を起動する。
3. [ローカルログイン](http://127.0.0.1:5319/login)を開き、session.jsonの合成アカウントで確認する。Goal IDは起動ごとに変わる。

## 実装と修正

- 保存差分を右側の累計量・進捗率の隣へ移動。比較の整合性、6秒の表示期間、符号、負の訂正、reduced motionと読み上げを維持した。差分のための左側の空白を除いた。
- 過去日PATCH、明示的なDONE/SKIPPED/取消、Goal単位の履歴版、設定版とのCAS、削除後の古い版拒否を実装。0はエラーとし、保存済み実量でフォームを初期化する。全取消後も既存の単位・timezone・初期量の制限を保持する。
- Goal・Today・全ログの内容を照合し、累計不変の履歴変更でも古い予測と組み合わせない。履歴は予測APIの障害中も表示・編集できる。再同期は有界で、失敗は明示的な再読込へ進める。
- 月送り・今月へ戻る・日付選択・編集、最近7日とグラフから履歴への導線、全Goalの足跡の月送りを追加。異なる単位の量は合算しない。
- 累積SVGに30日/90日/全期間、ホバー・touch・左右/Home/End、選択日の実量・状態・累計と編集導線を追加。期間前の累計は引き継ぎ、未来の線は生成しない。
- Chromeで保存中のままになる症状を再現し、Strict Modeでのalive ref再セットアップを修正。session確認中は既存契約どおり私的DOMを取り除き、同一所有者の入力だけ既存のmemory draftで復元する。保存対象日は編集開始時に固定し、日付更新で別の日へ書かない。
- 初回の契約生成の特殊置換トークンによる重複を、生成出力との完全一致・全既存export保持・退避を確認して修復した。旧DTOの応答形は保持し、既存テストの削除・無効化は行っていない。

## 最終検証結果

| 実行 | 結果 | ローカル証跡 |
| --- | --- | --- |
| `node scripts/local-319/test-all.ts` | Prediction 77、API 308（全47ファイル）、Web 200成功。失敗0 | `.local/319/tests-verified.log` |
| `npm run verify:r11` | 固定例32成功 | `.local/319/r11-final.log` |
| `npm run test:browser --workspace=@futureroi/web` | Chrome 22成功、失敗・skip 0 | `.local/319/browser-memory.log` |
| 既存goal-feedback Chrome回帰 | 1成功、38シナリオ、320/390/768/1440px | `.local/319/feedback-reviewed.log` |
| `npm run typecheck` / `npm run build` | 両方exit 0 | `.local/319/typecheck-final.log` / `build-final.log` |
| `npm run verify:foundation` | 文書・リンク・環境例・ignore・diff空白検査成功 | `.local/319/foundation-final.log` |
| Prediction Engine差分 | `git diff --quiet -- packages/prediction` exit 0 | Engineの実装変更なし |

Unit/Integrationは固定例を含め617成功。Web通常実行の既存skip 1件は、ブラウザを別コマンドで実行するための案内であり、上記のChromeテストを別途実行した。test-allは外部DBのURLを破棄し、新規ローカルDBだけを使用する。全47 APIファイルを列挙検査し、既存のmilestoneテストが要求するDATABASE_URL未設定のガードも保持して別実行する。

初回にseedのmigration名一覧で失敗したが、新migrationの初期版0を追加検査し、既存の全seed値比較を維持して修正後に全件再実行した。foundationの初回失敗はCLIが生成した一時snapshotの末尾改行によるものだった。CLIを閉じて証跡を`.local/319/playwright-artifacts`へ移した後に成功した。buildには500KBを超えるbundleの警告が残る。警告を消す目的の無関係な分割は行っていない。

## 実ブラウザの操作確認

専用API・合成DBを実Chromeへつなぎ、[verify-ui.js](../../scripts/local-319/verify-ui.js)、[verify-history-recovery.js](../../scripts/local-319/verify-history-recovery.js)、[verify-achievement.js](../../scripts/local-319/verify-achievement.js)、[verify-day-rollover.js](../../scripts/local-319/verify-day-rollover.js)をPlaywright CLIのrun-codeで実行した。各ファイルはCLIが提供するpageを受け取る関数であり、nodeで直接実行する形式ではない。

- 過去の保存実量30分が初期値となること、0を拒否して書かないこと、55分への訂正、休み、取消、再作成を確認した。
- 実APIによる並行更新後の409、入力保持、明示的再読込、503時の入力保持を確認した。Today保存後の累計+45分と進捗率差分を確認した。
- 予測API失敗時の履歴、履歴fingerprint不一致の有界再同期と再試行、達成済み→未達→未記録への訂正を確認した。
- Goal timezoneの日付境界、記録開始日が今日より先になる場合の空グラフ・書込抑止、日付更新と同一所有者のsession再確認をまたぐ未保存77分の保持・取消時書込0を確認した。LA midnight/DSTはAPI回帰で検証した。
- PCキーボード・hover、mobileの実touchscreen.tap、30/90/全期間、両カレンダーの月送りを確認した。320/390/768/1440pxで横overflowなし、編集フォームの保存・取消操作を確認した。

## スクリーンショット

保存先はこのローカル作業の `C:/Users/kaito/.codex/visualizations/2026/11/01/01a195c8-7658-75d3-8bdb-f0a49ebfb04c`。画像は合成データのみ。

| 対象 | 変更前 | 変更後 |
| --- | --- | --- |
| PC | before-desktop.png | after-desktop.png |
| スマホ | before-mobile.png | after-mobile.png |
| スマホのグラフ・編集・足跡 | — | after-mobile-chart.png / after-mobile-editor.png / after-mobile-footprint.png |

## 変更ファイル

- [apps/api/migrations/0009_record_history_revision.sql](../../apps/api/migrations/0009_record_history_revision.sql)
- [apps/api/src/contracts/index.ts](../../apps/api/src/contracts/index.ts)
- [apps/api/src/contracts/log.ts](../../apps/api/src/contracts/log.ts)
- [apps/api/src/contracts/r11.ts](../../apps/api/src/contracts/r11.ts)
- [apps/api/src/goals/routes.ts](../../apps/api/src/goals/routes.ts)
- [apps/api/src/goals/store.ts](../../apps/api/src/goals/store.ts)
- [apps/api/src/logs/routes.ts](../../apps/api/src/logs/routes.ts)
- [apps/api/src/logs/store.ts](../../apps/api/src/logs/store.ts)
- [apps/api/src/prediction/r11.ts](../../apps/api/src/prediction/r11.ts)
- [apps/api/src/prediction/snapshot.ts](../../apps/api/src/prediction/snapshot.ts)
- [apps/api/src/prediction/store.ts](../../apps/api/src/prediction/store.ts)
- [apps/api/tests/history-edit.test.ts](../../apps/api/tests/history-edit.test.ts)
- [apps/api/tests/question-prior-http.test.ts](../../apps/api/tests/question-prior-http.test.ts)
- [apps/api/tests/seed-r11-compatibility.test.ts](../../apps/api/tests/seed-r11-compatibility.test.ts)
- [apps/web/src/features/goals/GoalFootprint.tsx](../../apps/web/src/features/goals/GoalFootprint.tsx)
- [apps/web/src/features/goals/GoalFormPage.tsx](../../apps/web/src/features/goals/GoalFormPage.tsx)
- [apps/web/src/features/goals/footprint.ts](../../apps/web/src/features/goals/footprint.ts)
- [apps/web/src/features/goals/goal-form.ts](../../apps/web/src/features/goals/goal-form.ts)
- [apps/web/src/features/goals/goals.css](../../apps/web/src/features/goals/goals.css)
- [apps/web/src/features/history/HistoryEditor.tsx](../../apps/web/src/features/history/HistoryEditor.tsx)
- [apps/web/src/features/history/HistoryPage.tsx](../../apps/web/src/features/history/HistoryPage.tsx)
- [apps/web/src/features/history/history-model.ts](../../apps/web/src/features/history/history-model.ts)
- [apps/web/src/features/history/history.css](../../apps/web/src/features/history/history.css)
- [apps/web/src/features/history/useHistoryData.ts](../../apps/web/src/features/history/useHistoryData.ts)
- [apps/web/src/features/logs/SaveFeedback.tsx](../../apps/web/src/features/logs/SaveFeedback.tsx)
- [apps/web/src/features/logs/record-log.ts](../../apps/web/src/features/logs/record-log.ts)
- [apps/web/src/features/logs/save-feedback.ts](../../apps/web/src/features/logs/save-feedback.ts)
- [apps/web/src/features/logs/useSaveLog.ts](../../apps/web/src/features/logs/useSaveLog.ts)
- [apps/web/src/features/today/ProgressSummary.tsx](../../apps/web/src/features/today/ProgressSummary.tsx)
- [apps/web/src/features/today/TodayContent.tsx](../../apps/web/src/features/today/TodayContent.tsx)
- [apps/web/src/features/today/TodayPage.tsx](../../apps/web/src/features/today/TodayPage.tsx)
- [apps/web/src/features/today/snapshot.ts](../../apps/web/src/features/today/snapshot.ts)
- [apps/web/src/features/today/today-dawn.css](../../apps/web/src/features/today/today-dawn.css)
- [apps/web/src/router.tsx](../../apps/web/src/router.tsx)
- [apps/web/tests/history-edit.test.mjs](../../apps/web/tests/history-edit.test.mjs)
- [docs/architecture.md](../../docs/architecture.md)
- [docs/change-map.md](../../docs/change-map.md)
- [docs/changes/issue-319-goal-history.md](../../docs/changes/issue-319-goal-history.md)
- [docs/product-spec.md](../../docs/product-spec.md)
- [scripts/local-319/server.ts](../../scripts/local-319/server.ts)
- [scripts/local-319/test-all.ts](../../scripts/local-319/test-all.ts)
- [scripts/local-319/verify-achievement.js](../../scripts/local-319/verify-achievement.js)
- [scripts/local-319/verify-day-rollover.js](../../scripts/local-319/verify-day-rollover.js)
- [scripts/local-319/verify-history-recovery.js](../../scripts/local-319/verify-history-recovery.js)
- [scripts/local-319/verify-ui.js](../../scripts/local-319/verify-ui.js)

## セルフレビューと未検証境界

review-gateによりIssue、認可、日付、量とNULL、CAS/rollback、session、更新失敗、表示整合性、既存回帰、文書の対応を照合した。ローカル検証で残るBlockingは検出していない。人間の受入を代替するものではない。

正式統合前の判断事項は、旧PUTでhistory版を省略するクライアントの移行・必須化、R-11追加metadataを扱えない旧タブの再読込方針、新migrationの適用と画面操作の受入である。旧クライアントが版を省略する場合、新しい履歴CASの保証はない。長期履歴ではfingerprintが全履歴に比例する通信量を持つ。

Safari/iOS実機、実screen reader、実利用者による理解・受入、Node 24.22.1そのもの、本番データ・本番DB migration・deploy、モデルの実測予測精度は未検証。mainへの変更・push・PR・merge・deploy・大会提出物の編集は行っていない。

## 追補：開始前の合計量の訂正

2026-11-01の精査結果に対する依頼者の「じゃあそうしよう」に基づく。[P-26](../product-spec.md#p-26-開始前の合計量の訂正319)・[D-34](../architecture.md#d-34-開始前の合計量の訂正319)のローカル実装。記録後も開始前の合計を増減・0へ訂正でき、確認dialogで旧値・新値・符号付き差を示す。合計を置換し、日々のログ・開始日・timezone・単位の制限を保つ。追加migration・新API経路・Engine変更はない。

### 検証

- 全48 APIファイル315成功（shared 306＋milestone 9）、Prediction 77、Web 201、固定例32、計625成功。通常Web実行の既存skip 1件はブラウザ別実行の案内であり、既存Chrome 22件と保存差分の38シナリオを別途成功させた。証跡は`.local/319/initial-all-final.log`、`initial-r11-final.log`、`initial-native-final.log`、`initial-feedback-final.log`。
- 追加API 7件は、増減・0、達成／未達・総量超過、同値再送、設定版CASの一勝一敗、日別保存との両立・古い日別入力の拒否、認可・入力・timezone／unit、DB失敗rollbackを検査する。日別行・履歴版・開始日・回答と版・観測遷移・posterior・未達時のg50/g80が不変であることも照合した。
- 旧仕様に依存したテストは、初期量禁止の期待だけを新仕様へ更新した。timezone・単位・要求全体の原子性・private DOM除去・入力保持のassertionは維持し、初期量の送信・検査・取消後・409後の再確認を追加した。
- 実Chrome＋既存の合成Goalで、確認前の書込0、取消時の入力保持、300→600分、0への訂正、409の入力保持と明示的再読込、503の入力保持、同owner session再確認、明示的再保存、日別行不変を確認した。`verify-initial-progress.js`と`verify-initial-failure.js`を使用し、合成Goalの初期量は確認後に元の値へ戻した。320/390/768/1440pxで横overflowなし。
- typecheckとbuild成功。証跡は`.local/319/initial-typecheck-final.log`・`initial-build-final.log`。bundleの既存500KB警告は残る。文書同期後のFoundationも成功（`.local/319/initial-foundation-final.log`）。

### 検証中の失敗と対処

全体テストの初回はCドライブの空き容量0によりPostgreSQLの`No space left on device`で失敗した。テストやtimeoutを緩和せず、この専用worktree内で当日生成された`futureroi_test`所有の停止済み検証クラスタ107件だけを、絶対パス・PID fileなし・利用中クラスタ除外を確認して整理した。空き容量確保後、全件を再実行して成功した。失敗ログは`.local/319/initial-all.log`に保持した。

既存Chrome回帰の初回1失敗は初期量disabledを要求する旧仕様のassertionだった。初期量が訂正可能でtimezoneは固定であることを検査する新契約へ更新し、他のsession/409/入力保持assertionを保ったまま22件を再実行して成功した。実Chromeの503確認スクリプトでは案内文の期待文字列の違いで一度timeoutしたが、実際の画面の案内に合わせ、更新失敗・再確認・再保存を最後まで再検証した。

### 利用中ローカルDBの保全

API更新前に専用クラスタをPID・port・所有者・対象Goalで特定し、全public tableのsnapshotを`.local/319/initial-before.json`へ退避した。現在の確認DBを新しくseedし直さずに再開し、3 Goal・123ログを維持した。ユーザーが作成したGoalとその日別記録が更新前と一致することを読み取りで確認した。利用中のDB directory・退避・ログイン情報はGit除外のままである。

### 画像

専用visualizationsフォルダの`initial-progress-desktop.png`・`initial-progress-mobile.png`に確認dialog、`initial-progress-after.png`に訂正後の累計・グラフ・完了見通しを保存した。画像は合成Goalのみ。

### 追補の変更ファイル

- [apps/api/src/contracts/goal.ts](../../apps/api/src/contracts/goal.ts)
- [apps/api/src/goals/routes.ts](../../apps/api/src/goals/routes.ts)
- [apps/api/src/goals/store.ts](../../apps/api/src/goals/store.ts)
- [apps/api/tests/goals-concurrency.test.ts](../../apps/api/tests/goals-concurrency.test.ts)
- [apps/api/tests/goals.test.ts](../../apps/api/tests/goals.test.ts)
- [apps/api/tests/history-edit.test.ts](../../apps/api/tests/history-edit.test.ts)
- [apps/api/tests/initial-progress.test.ts](../../apps/api/tests/initial-progress.test.ts)
- [apps/api/tests/record-concurrency.test.ts](../../apps/api/tests/record-concurrency.test.ts)
- [apps/web/src/copy/goals.ts](../../apps/web/src/copy/goals.ts)
- [apps/web/src/features/goals/GoalFormPage.tsx](../../apps/web/src/features/goals/GoalFormPage.tsx)
- [apps/web/src/features/goals/form/GoalFormFields.tsx](../../apps/web/src/features/goals/form/GoalFormFields.tsx)
- [apps/web/src/features/goals/goal-form.ts](../../apps/web/src/features/goals/goal-form.ts)
- [apps/web/src/ui/components/ConfirmDialog.tsx](../../apps/web/src/ui/components/ConfirmDialog.tsx)
- [apps/web/tests/goal-form.test.mjs](../../apps/web/tests/goal-form.test.mjs)
- [apps/web/tests/issue185-failure.browser.tsx](../../apps/web/tests/issue185-failure.browser.tsx)
- [docs/architecture.md](../../docs/architecture.md)
- [docs/change-map.md](../../docs/change-map.md)
- [docs/changes/issue-319-goal-history.md](../../docs/changes/issue-319-goal-history.md)
- [docs/product-spec.md](../../docs/product-spec.md)
- [scripts/local-319/resume.ts](../../scripts/local-319/resume.ts)
- [scripts/local-319/verify-initial-failure.js](../../scripts/local-319/verify-initial-failure.js)
- [scripts/local-319/verify-initial-progress.js](../../scripts/local-319/verify-initial-progress.js)

### 残る境界

Safari/iOS実機・実screen reader・実利用者受入・Node 24.22.1そのもの・本番反映は未検証。初期量の変更前後を永続監査する機能と、開始前の日別記録の取り込みは含めない。旧クライアントの履歴版移行など、前段の統合前判断は引き続き残る。push/PR/merge/deployは行っていない。
