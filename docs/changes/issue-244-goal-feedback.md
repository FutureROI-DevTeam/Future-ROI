# Goalの量入力とTodayの保存後増分（#244）

**Supporting Doc / Not a Source of Truth.** 仕様は[Product P-23](../product-spec.md#p-23-goalの量入力と保存後の増分244)、整数分契約は[Architecture](../architecture.md#data-model)、実装への入口は[変更対応表](../change-map.md#goalとtodayの量入力保存後表示244)。

## 範囲と変更

### 2026-10-24 文字サイズの限定修正

#244条件6に残っていた未保存試算の本文13pxと、一覧の足跡の日付11pxを14pxへ揃えた。配置・文言・入力/保存・計算・読み上げ方式は変えない。追加した計算済み文字サイズ検査は旧11pxで失敗し、修正後は既存Chrome回帰の320/390/768/1440pxで両箇所とも14pxを確認した。38シナリオ（保存/訂正・失敗/409・入力・日付のキーボード選択・横はみ出しを含む）が成功し、合成画面34枚をローカル証拠に保存した。実screen reader・Safari/iOS・人間受入は未確認。条件7の真の操作増分保証や#253の丸め/読み上げ方針は未解決のまま、Issue全体の完了とは扱わない。型/build・CIの対象SHAと詳細は対応Draft PRで追跡する。

[#244](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/244)は依頼者が先行を許可したFE変更。Goal一覧の累計・達成導線、総量／初期量の時間＋分入力、量の直後の任意質問、Todayの率と見通し、PC週履歴下／スマホ見通し後の実績グラフ、確認できた保存増分を扱う。

専用branchは`feat/244-goal-today-feedback`。開始mainは`3e5d9fb23afcd78e66e309c93c0000e6a3a8ab1d`。通常checkoutの未保存変更、既存DB・container・他worktree・実験成果には触れない。API・shared types・DB・Prediction source／数値・CI設定・権限・課金を変更しない。

時間＋分入力は整数分へ変換する。200時間→12000分、1240分↔20時間40分。表示方式の切替は量を変えず、不正な途中入力をdraftに残す。最新設定で単位が回数へ変わったときは、有効な量を整数へ戻し、不正な時間draftは補助文に保持して新しい単位での入力を求める。既存の単位／初期量／timezoneロックと、設定変更時の回答取消を保つ。回復情報のkey・bodyは再試行で作り直さない。

保存後の数値は、成功後にGoal・Today・履歴を再取得し、設定・日付・他日・保存応答が一致する場合の、取得済みsnapshotとの比較。通知に常に「保存前の表示との差」と示す。200時間の表示0→30分は+30分・+0.25パーセントポイント、表示30→20分は−10分。0差分、未保存・失敗・409・不確かな再試行・検知した別tab保存では加算表示を出さない。今回のPUTによるDB上の原子的増分を保証しない。

独立レビューの純増0なのに+30分となるケースと、実APIの表示20分→別client40分→自身30分（表示差+10分、DB上書き差−10分）は、現APIの観測限界として保持する。表示の近くに比較対象を明示するFE修正で扱い、API契約は変更しない。質問欄は未回答の「回答せずに進む」と、選択済みの「回答欄を閉じる」を分け、閉じても選択を送る旨を示す。各問の「回答しない」が明示的な取消操作であり、閉じる操作で入力を消さない。

## 検証手順

秘密やDBを用いない専用checkoutで実行する。

```powershell
npm run typecheck
npm run build --workspace=@futureroi/web
node --import ./apps/web/tests/register-contracts.mjs --test --test-concurrency=1 ./apps/web/tests/*.test.mjs
```

ブラウザ回帰は`apps/web`を作業ディレクトリにし、既存Chrome/Edgeのpathを`TEST_BROWSER`で指定できる。追加依存・CI変更を要しない。各runnerが隔離profileとloopbackの合成HTTPを作り、所有するprofileだけ終了確認後に片付ける。

```powershell
node --import ./tests/register-contracts.mjs --test tests/session-cache.browser-check.mjs
node --import ./tests/register-contracts.mjs --test tests/goal-feedback.browser-check.mjs
node --import ./tests/register-contracts.mjs --test tests/responsive-details.browser-check.mjs
```

`FEQA_ARTIFACT_DIR`を明示すれば、追加runnerは320／390／768／1440pxで一覧・作成・編集・Today、未保存試算、足跡の選択／回復、保存／訂正のPNGと`browser-evidence.json`を保存する。PCの高さ600／800pxも検査する。10月11日の版は22枚、10月12日の追加版は32枚。合成Goalだけを使い、画面PNGに秘密や実ユーザー情報を含めない。

純粋回帰は変換・未変更PATCH・不正draftのrebase・増減・0増分・設定／他日変更・snapshot不整合・超過実績・初日の1点を検査する。実Chrome回帰はnative入力／radio切替・横はみ出し・DOM／PC配置・整数分のcreate body・任意質問の未回答・保存／訂正・通信失敗／原body再試行・409・別tab通知・focus・reduced-motionを検査する。

## 10月11日の確認状況と残判断

2026-10-11の専用worktreeで、独立指摘修正後の全workspace typecheckとFE production buildは成功した。通常FE回帰は170件中169成功・0失敗・既存の設定依存browserチェック1skip。既存session browser回帰は21成功・0失敗。追加Chrome受入は22scenario・22PNGで成功し、単位radioの矢印キー操作、200時間のcreate body、未回答で進む操作と選択回答の保持、比較対象を示した保存／−10分訂正／通信失敗／原body再試行／409／別tab通知／reduced-motionを確認した。fixtureにも製品と同じ既存400／500／700 font importsを読ませる。

Dの同4probe（別clientの先行同値保存でDB純増0、HIGH選択後の閉じる操作、連打、native Tab順）は、操作順を保ち、修正後の明示ラベルを期待として再検証して成功した。mock HTTPなしの専用合成DB・実認証・実API・ビルド済SPAの縦断6項目も成功した。表示20分→別client40分→自身30分では表示差+10分とDB差−10分を観測し、表示通知に比較対象が付くことを確認した。原子的増分や実ユーザーの理解の保証へ読み替えない。所有する合成DB・API・Chromeは終了確認済み。修正後responsive detailsは11成功、Foundationは111 text files・2035 local links・環境例・7 ignore cases・差分空白で成功した。

- 既存browser fixtureは単位buttonと分だけの入力欄を前提にしていた。製品の条件やassertを緩めず、radio selectorと整数分としての量の読取／設定へ合わせた。409後の最新単位が回数へ変わる場合には、有効な時間draftを整数へ正規化する回帰も追加した。
- Playwright CLI＋Skillはこの環境に未導入。既存Vite／Chrome CDP harnessで実viewport・native入力を確認する。実ユーザーの初見理解、チームの人間レビュー、実認証／API／DBとの人間の縦断受入は未実施。前述の合成DB smokeとは分ける。
- Log応答は旧量／log revisionを持たない。別端末や検知できない同日並行更新の原子的増分は保証できない。別tab回帰は同originの別Chrome tabから保存通知を送る合成試験であり、実際の複数端末DB同時更新の検証ではない。
- PCでは左の週履歴の直後にグラフ、記録操作はその後に配置する。小さい高さでの初見の操作発見性は人間レビューに残る。
- この記録作成時は未pushだった。その後、Draft [#247](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/247)のHEAD `7a941be6af8a9a883671f4648cba3cc085373802`でGitHubのFoundation／Applicationの4check成功を確認した。次節の未commit差分へのCI成功ではない。merge・deploy・既存Issueのclose／BLOCKED解除を行わず、元の#117等の人間受入条件をローカル成功で完了扱いにしない。

## 10月12日の実画面確認後の追加

基準HEADは上記`7a941be6`。同じbranch・worktreeで、依頼者の画像案了承と共通足跡の配置了承に沿って追加した。現行仕様は[P-23](../product-spec.md#p-23-goalの量入力と保存後の増分244)を参照する。日々の量を分にそろえ、小さい進捗率を表示し、条件・未保存を示す試算と下部の変更入口を加えた。HIGHは毎回を含む文言へ、UNKNOWNと未回答は保存される意味の説明へ更新した。数値priorとEngineは変更していない。

一覧見出しの下の共通足跡は、既存の各Goalの全件Log GETを利用する。Goal数に応じて読取リクエストが増え、全件履歴のpayloadも増える。新規API・ページング・集約保存・cache policyを作らない方針のトレードオフであり、多数Goal・長期履歴の公開性能は未測定。既存の私的cache境界とAbortSignalを使い、取得中・失敗・一覧／履歴の不整合を未確認として扱う。30秒の端末時計確認は日付更新が必要なときだけ再取得し、平常時のDB probeではない。記録日は各Goalのlocal dateで、timezoneをまたぐ同一実時間の集計ではない。

独立レビューで、(1) Goal累計だけ更新された非対称GETから試算したこと、(2) 単位変更後の旧分入力を回へ再結合したこと、(3) PC入力focus後に右試算が画面外になったことを再現した。Goal／Today累計の照合、入力設定の固定と明示再入力、入力中の右進捗summaryのsticky表示で修正した。再入力後のfocusと足跡のGoal linkの44px寸法も修正した。通常の戻る操作ではstepの元snapshotを保ち、古い量を新しいsnapshotへ結び直さない。

再接続前の全回帰は完走を確認できず、loopback取消試験2件の失敗ログもそのまま保持した。再接続後の全FE回帰は181件中180成功・0失敗・既存の設定依存1skip。追加の実Chrome受入は35scenario・32PNGで成功し、PCの高さ600／800／1000pxで入力中の右試算が露出し、設定変更後の旧入力はPUTされず明示再入力の新しい単位・設定版だけを保存することを確認した。既存の別tab通知試験は固定300ms待ちでは到着前に保存を解放して失敗したため、同じ通知の到着を確認してから進めるように直した。失敗ログと再実行結果は分離して保持する。

最終の全workspace型検査とFE production buildは成功。既存session browser suiteはresponsive detailsを含む21件すべて成功し、同owner確認・設定衝突・昨日訂正・失敗後の再試行を再確認した。共通足跡が追加した履歴GETはGoal form専用fixtureでは明示的な未提供エラーへ分け、未知のauth／private write検出は維持した。率の回帰は125%／99.9%と、バー100%上限を別々に検査する。独立再レビューでは累計不一致・単位変更・PC可視性・再入力focus・44pxリンク・固定summaryのfocus遮蔽の全6指摘の解消を確認した。右のリンク／詳細summaryにfocusがある間は固定を外し、入力へ戻ると試算を再び見える位置へ戻す。

13:12 JSTのPC再接続後、HEADが`7a941be6`のままで、28差分すべてが独立レビューの保存時hashと一致することを確認した。独立レビューが保持した18ファイル（UI READMEを含む）の固定digestは`588d3a8ea5865fa8ad8e6837ef71b75582898bc0dff47f7c0be9de9ea7a65335`。既存の成功ログと独立証拠を読み戻し、この最終追記ではruntime・testsを変更しない。再実行なしで証拠を引き継いだ範囲と、今回の文書検査を分けて記録する。Foundationは111 text files・2048 local links・環境例・7 ignore cases・作業／stage差分空白で成功した。

この追加は未commit・未pushであり、新しいGitHub CI・人間の実利用受入は未実施。ユーザーの稼働Docker app／DB、`.env`、通常checkoutを編集・再起動せず、専用Chrome／合成fixtureで検査した。稼働containerへの新差分の反映は未実施。多量の履歴の公開性能、初見の理解、チームの人間レビューは残る。Foundation・ローカル確認は公開／merge／Issue closeの許可や受入完了ではない。
