# 主要操作の実ブラウザ・API・DB継続検証（#334）

Supporting Artifact / Not a Source of Truth。

- Issue: [#334](https://github.com/FutureROI-DevTeam/Future-ROI/issues/334)
- 調査日: 2026-11-07 JST。基準main: `ff954f9aebc1c3194e4a3000331ffc30e03fc9ed`。
- 正本: [Product](../product-spec.md)、[Architecture / Test Strategy](../architecture.md#test-strategy)。実行手順は[開発ガイド](../DEVELOPMENT_GUIDE.md#検証)。
- 本番配備、main merge、外部設定変更は行わない。ここでの合成データの成功は公開環境の受入ではない。

## 既存検証の境界

| 既存入口 | 実際に通る範囲 | 今回補う部分 |
| --- | --- | --- |
| `session-cache.browser-check.mjs` | 実Chrome・React・Router・認証SDK。HTTP/sessionは合成。owner、draft、失敗、日付変化を広く検査 | 製品SPAから実認証Cookie・HTTP・DBへの接続 |
| `apps/api/tests/*.test.ts` | 実PostgreSQLとFastify inject。所有者、設定/履歴CAS、transaction、snapshot、再送 | 実TCPとブラウザのイベント・保存後のDOM |
| container/Compose smoke | 実HTTP・認証・DB・SPA配信、再起動と保存保持 | ブラウザ操作 |
| `issue148-browser.mjs`、`scripts/local-319/` | 個別作業用の実ブラウザ・API・DB確認 | 固定port/fixtureや外部Playwrightの前提を持たない継続入口 |
| Engine・`verify:r11` | 独立オラクル、固定例、Engine→API変換→FE表示変換 | 実入力・保存・読取・画面との接続。数値群をE2Eへ重複移植しない |

未完Issue35件とopen PR検索を確認した時点でopen PRは0件。#83は公開環境での主要操作・端末受入、#155はowner/cache境界、#117はR-11の受入、#275はCDの本番受入を含み、今回の隔離検証だけでCloseしない。#322/#331の認証更新・旧比較環境整理も別作業として保持する。#83の[公開記録](https://github.com/FutureROI-DevTeam/Future-ROI/issues/83#issuecomment-6126326171)と古い本文の公開待ち表現を区別した。

## 優先順位と選択

これは今回の検証の優先順位であり、ProductのMust/Should/Could変更ではない。

| 候補 | 判断・根拠 | 分担 |
| --- | --- | --- |
| Goal作成→記録→Today→再表示 | 最優先。R-01〜R-08/R-11の中心で、保存成功なのに画面/累計が古い失敗を横断して検出 | 追加E2EでUIから作成、設定と違うDONE量、SKIPPED訂正、達成、再読込を検査 |
| logout・別ownerアクセス | 最優先。私的Goal/履歴の漏えい・他人の更新を防ぐ境界 | 実認証でA→B→A、他人のGET/PATCH/DELETE/PUT拒否とDB不変を検査。短いowner変化・遅延cacheは既存合成回帰 |
| 保存応答喪失・競合 | 優先。見かけの失敗による二重Goal作成、古い設定での上書きは正常系では見えない | DB確定済みPOSTの応答だけ遮断→明示再試行・同key replay、実設定変更による409→明示回復 |
| 計算結果 | 小さな独立固定例を選択。合計の二重加算・API/表示の接続を確認 | 初期量5・総量25・1回10・回答MID/MID。未記録時はg50=1/g80=3、完了P50=1/P80=3。Beta(2,2)で将来1回のDONEが残り、未到達確率は1/2、3/10、1/5。既存Engineオラクルを保持 |
| 日跨ぎ・同時transaction・破損DB | 重要だが細かな組合せは既存実DB/合成ブラウザ回帰が効率的 | `logs`、`record-concurrency`、`history-edit-concurrency`、`prediction-snapshot`等を維持。E2Eは開始時のドメイン時刻を固定 |
| resetメール・任意評価/個人補正 | 現行は停止/既定OFFまたは受入未確定 | 認証/機能の既存回帰を保持。再開や製品採択を行わない |

## 構造・安全性・限界

既存`node:test`、Chrome/CDP launcher、API stack/migration/専用DB helperを使う。追加依存なし。API test helperへの変更は`webDist`を渡す任意設定だけ。製品のAPI、DB schema、認証、計算式は変更しない。

接続先ガードはアプリの`DATABASE_URL`継承を拒否する。既定は新規embeddedクラスタ、CIは固定された合成credentialのloopback serviceに限定。`.env`を読み込まない。ブラウザprofile・DBは実行ごとに独立し、獲得資源は失敗時にも閉じる。既存DBや他のprofileを削除しない。API loggerは無効、Cookie・password・保存body・storageを診断へ出さず、CI artifactは既存の件数・所要時間allowlistを維持する。

全ケースの自動再試行・skip・assertion緩和を追加しない。応答遮断はChromeのHTTP response interceptionによる人工故障であり、実インターネット障害の再現ではない。UI操作に加えてブラウザ内の実fetchとDB読取で不変条件を確認するため、全assertionがDOMだけを観測しているわけではない。

## main保護とCIの現状

GitHub MCPに保護設定取得の機能がないため、読み取り専用`gh api`で次を確認した。

| API | 結果 |
| --- | --- |
| `repos/FutureROI-DevTeam/Future-ROI/branches/main` | 基準SHA、`protected:false` |
| `repos/FutureROI-DevTeam/Future-ROI/branches/main/protection` | 404 `Branch not protected` |
| `repos/FutureROI-DevTeam/Future-ROI/rulesets` | `[]` |
| `repos/FutureROI-DevTeam/Future-ROI/rules/branches/main` | `[]` |

[CONTRIBUTING](../../CONTRIBUTING.md#条件付きセルフマージ2026-10-11)は承認数の一時解除を認めるが、現在はPR・必須CI・履歴保護も強制されていない。mainへのPR必須、force push/削除禁止、下記4jobの必須化を推奨する。承認1件への復帰はチーム判断。設定は変更していない。CD gateはmerge後の同SHA検査であり、事前のmain保護を代替しない。

| 既存job | 基準mainの所要時間 |
| --- | ---: |
| Install, typecheck, test, build | 303秒（Test 255秒） |
| Container build and smoke test | 120秒 |
| Production install and Vercel bundle smoke | 32秒 |
| Repository checks | 17秒 |

出典: [Application](https://github.com/FutureROI-DevTeam/Future-ROI/actions/runs/41746887280)、[Foundation](https://github.com/FutureROI-DevTeam/Future-ROI/actions/runs/41746887294)。直近20 Application run（11/02〜11/04）は成功19・取消1・失敗0、attemptは全て1。成功runの作成→更新は197〜352秒、中央値274秒。異なるSHAの標本で、flake率や本変更の速度比較の証拠にはしない。

新E2Eは既存Application jobのbuild直後へ追加し、CDが要求するjob名を増やさない。集計の`browser-e2e`層は欠落・0件・CI skipを失敗として扱い、既存チェックはすべて残す。

## 実行記録

実行環境はWindows、Node 24.22.1、npm 11.19.0。初回の依存導入はPATHの既存npmがNode 22を使ったため、正しいNode/npmで`npm ci --ignore-scripts --no-audit --no-fund`を再実行した。依存/lockfile変更なし。型検査・全workspace buildは成功し、既存の500kB chunk警告は残った。

初回push `fcda8f4` の追加E2Eはローカルで3回連続成功（各回4/4、親test＋3導線、失敗・取消・skip・todo 0）。process wallは26.225秒、23.383秒、22.709秒（中央値23.383秒）。ただし、次のLinux CIで待機条件の欠陥を検出したため、この反復を最終修正の安定性の証拠にはしない。

初期試行の失敗はテスト側のUI期待値（時間/分の整形、ChoiceButtonの不可視区切り文字）とDELETEの余分なJSON Content-Typeだった。表示契約と実HTTPに合わせてテストを訂正し、製品のassertion・実装は弱めていない。

初回[Application CI](https://github.com/FutureROI-DevTeam/Future-ROI/actions/runs/42289448182)では、既存R11 32/32・Engine 77/77・API 317/317・Web 230/230が成功し、新E2Eの3導線目が登録email入力待ちで失敗した。E2E stepは約20秒。実session応答を保留する調査用プローブで、URLは`/register`でも旧ログイン欄が残り、フォーカス後のフォーム置換で入力先を失う欠陥を再現した。元CIにDOM記録はなく、同じ失敗を起こすdriver欠陥の再現である。製品不具合と断定しない。

修正はURLだけでなく目的の認証見出し・active tab・password autocompleteの描画を待つもの。timeout延長・自動再試行なし。修正後の同じ応答遅延では、旧画面に入力せず描画後に全4件が成功（26.303秒）。入力失敗時の診断も固定field名と真偽値だけとし、入力値・Cookie・DOM本文を出さない。

修正後の通常E2Eは3回連続成功（各4/4、失敗・取消・skip・todo 0、再試行なし）。Node test durationは22.075秒、22.159秒、16.262秒（中央値22.075秒）。後2回のprocess wallは22.264秒、16.321秒。各回の新規DB/profileはcleanup成功。既存APIテストと重なる開発端末の測定であり、無負荷benchmarkでも長期flake率の推定でもない。実session応答を保留した対照実験と合わせて、URL先行時の待機条件を確認した。

型検査・全workspace build成功、CI集計/配備gate/DB接続先ガード30/30成功。CI skip拒否を追加後の集計回帰6/6成功。Foundationは123文書等・2851相対リンク、差分空白を確認した。ローカルの既存全workspace回帰はembedded起動の所要時間のため一度中断。次に専用クラスタを共有した一括実行はR11 32/32・Engine 77/77・Web 230/230が成功したが、APIは308成功・1失敗だった。既存Milestone安全策が固定CI接続先以外の`DATABASE_URL`を拒否したためで、検証用実行方法の不適合である。安全策は変更しない。この中断・失敗した一括実行を成功として数えない。

該当Milestoneは`DATABASE_URL`・`GITHUB_ACTIONS`を外し、新規embeddedクラスタを使う既存の正規入口で個別実行して9/9成功（113.496秒、skip/取消0）。元の一括実行とは別結果として扱う。認証待機修正後の集計/配備gate/DB接続先ガードも30/30成功した。

独立レビューでは、他人のGoal確認がloading中に成功し得る判定と、Chrome停止未確認でのprofile削除を指摘され修正した。同一SPA内のA logout→B登録、数値のDOM反映も強化。最終確認で未解決Blocking/Should Fixなし。Human Reviewの代替ではない。

認証待機修正も別担当がコードと対照プローブを独立レビューし、native入力・同一SPA切替・既存assertion・時間上限が保たれ、未解決Blocking/Should Fixがないことを確認した。

修正後のGitHub CI・同一SHAの最終結果と所要時間は[PR #335](https://github.com/FutureROI-DevTeam/Future-ROI/pull/335)へ記録する。未実行は成功扱いにしない。

## 残る受入

- 公開URL、HTTPS/proxy、Neon休止からの復帰、Vercel runtimeでの認証と保存は未検証。
- Safari/iOS、実スクリーンリーダー、実利用者の理解・継続効果・予測精度は未検証。
- #319の履歴機能は基準mainに存在するが、正本文書にローカル/未統合の履歴表現が残る。実装の存在をチーム採択や本番migrationの証拠にせず、このE2Eでその判断を変更しない。
- main保護の復帰、必須check設定、Human Reviewは人間の確認が必要。merge・配備は実施しない。
