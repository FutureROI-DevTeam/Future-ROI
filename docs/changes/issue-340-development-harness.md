# #340 開発ハーネスの実装・検証記録

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

残る実接続は[設定差分](../operations/development-harness.md#実接続へ進む前の設定差分)のとおり。AW固定版compile/lock、実モデルworker、実Issue/既存branch/PR照合、publisher、PR後CIの取得は未実装・未検証。ローカルfixture専用の入口を汎用開発workerと呼ばない。実Issueを完了扱いにせず、Issue #340もOpenのままとする。

人の導入・操作・レビュー・復旧時間、受入価値、総費用、実運用の誤完了率は未計測（null）。新規モデル課金呼出し0という性質と、総費用が0円という主張を区別する。基盤が人の負担を減らすという効果はまだ主張できない。
