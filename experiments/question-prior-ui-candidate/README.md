# R-11追加質問・出所表示のReact候補（#117）

**Supporting Artifact / Not a Source of Truth。具体契約は未採択、本番画面・API・Engineへの組込は未確認。**

[#117](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/117)の追加UI担当分を、FEが部品と状態所有者をレビューできるように隔離した候補です。この候補PRは正式な`apps/web`とroot workspaceを追加せず、[D-23の採択構成](../../docs/architecture.md#repository構成)へ取り込む前の部品確認を扱います。Goal作成・一覧やToday画面全体、認証・DB・HTTP、計算Engineを複製していません。

[PR115](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/115)はR-11のMust・分担の採択記録で、mainへ反映済みです。[PR118](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/118)は具体質問・数値・保存・表示契約の提案、[PR119](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/119)は質問prior計算adapterの候補です。本候補は当時のmainから分けたSupporting Artifactで、PR118/119の変更は取り込んでいません。2026-10-06確認のmain `3166e14`には両候補が反映されていますが、D-26の具体契約採択や正式アプリ統合の証拠とは扱いません。#70 Hardと#117のDoR/blocked/Close条件は維持します。

## 部品の動作と受け渡し案

[QuestionPriorFields](src/QuestionPriorFields.tsx)はGoalごとの任意2問です。経験確認は説明文にまとめ、数値に影響する3問目を追加しません。

- a：「取り組めた日の翌日も、続けて取り組むことはどのくらいありましたか？」
- b：「休みをとった日の翌日に、また取り組むことはどのくらいありましたか？」
- LOW/MID/HIGH、UNKNOWN（経験なし・思い出せない）、null（回答しない）を区別。4回中1/2/3回の表現はPR118の候補です。UIは確率・Beta・重さへ変換しません。

記録開始前の、今回と近い行動・量・生活状況、少量でも取り組めた日を含む過去の経験を答える説明を置きます。`value`はa/b両方を含み、選択・解除ごとに`onChange(nextPair)`へ新しいpairを返します。片方を編集しても他方を保持し、内部に回答stateや保存処理を持ちません。回答・UNKNOWN・スキップからActionLog、進捗、実績件数を作りません。

長い共通説明は各`fieldset`の`aria-describedby`で関連づけます。radioには選択肢の短いlabelを保持し、項目エラーがある場合だけそのerror IDを説明として参照します。共通説明をradioごとのdescriptionへ重複させません。nativeなfieldset／legendの構造は[W3C WAIのgrouping guidance](https://www.w3.org/WAI/tutorials/forms/grouping/)に沿い、実際の読み上げ方は支援技術での確認を残します。

[PriorForecast](src/PriorForecast.tsx)は、親が解決済みの`view`だけを表示する参照rendererです。出所は回答／回答＋実績／実績／不足に分け、a/b別の出所と実際の観測件数を別に扱います。回答を含む見通しには仮定である説明を付けます。材料不足の`conditional`は供給された残量・設定量での条件付き回数を表示し、日数の予測でないことを明示します。実績のみのR-06不足はPlanのない`insufficient`で、親が解決した文言を表示します。回数の切上げ、gate、quantile、週の月曜日やtimezoneの計算は行いません。

`completed`は実績達成、`today-recorded`は今日の記録後の表示で、core比較を受け取りません。記録済みの完了estimateはCURRENT_STATEだけを型と実行時で許可します。未記録のTODAY_DONE完了は仮定と明示し、実績・達成への反映をしません。p50/p80の元の日数とFEが作るラベルを別に保持し、nullは両方の値で維持します。未計算quantileを推測した固定値で埋めません。loading/error、保存成功後の再取得失敗、保存結果不明は数値viewと別unionです。

実績量はR-02の累積量のまま保ち、clampしません。R-08どおり`done >= total`は`completed`で有効で、120／100もそのまま表示します。shared guardは未達成を`completed`で渡す場合と、総量以上を`forecast`／`today-recorded`で渡す場合を拒否します。状態の選択はFEが行い、UIで達成へ変換しません。中心不足の`message`省略時は「見通しを出すための材料がまだ足りません。」と表示し、回答を前提にしません。指定されたR-06等の文言は従来どおり優先します。

| 所有者 | 接続点・責務 |
| --- | --- |
| Kaito/#117 | 質問・出所表示、候補の表示型、scoped CSS、部品テスト |
| FE/#78 | draft初期値・編集、保存中disabled、422のfieldErrors、global保存状態。Goalの既存フォームへ[slot例](examples/slots.tsx)で追加 |
| FE/#81 | APIの実行時検証と変換、最新応答の判定、R-08→R-07→材料gate等の採択済み優先順位、週ラベル。解決したviewをTodayの既存領域へ渡す |
| BE/#76/#77・Engine/#71〜73 | 保存・取得・snapshot/全実ログ、revisionと競合、計算・出所/gate。正式契約はPR118/119で別途採択・結合 |

[presentation-types.ts](src/presentation-types.ts)はローカル表示候補で、共有API/Engine DTOの採択ではありません。[slots.tsx](examples/slots.tsx)はrenderのみの最小接続例です。form/route/query/mutationや保存ボタンを作っていません。採択後にFEが既存controllerへ接続し、共有ファイルをFEが所有、部品内の変更をKaitoが担当する案です。実際の配置・変更順・競合解消手順はFEレビューで合意してから統合します。

## 現行実績モードとの接続境界（2026-10-06）

[BEの取り込み確認](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/120#issuecomment-6015329491)は段階的な結合方針であり、D-26採択やR-11のMust変更ではありません。以下はmain `dc668fbae199660a22a93ec0af66a3bed0daba40`、PR120 `7b0debd`、Goal API候補PR125 `a9d6515`のコード読み合わせに基づきます。実HTTP／DB／保存を実行した確認ではありません。

- mainの`PredictionResult`は`conditionalPlan`と`evidenceSource`を持ちません。`engine-view.ts`はPR119の候補出力を前提とし、mainの結果を型assertionで直接渡してはいけません。不足時はPlan参照で、available時も出所検証で失敗し得ます。現行実績モードはFE所有の別の変換／不足分岐でProduct SpecのR-06を表示し、Planや回答出所を捏造しません。coreだけavailableな場合はcoreを維持し、completion不足を分けて扱います。
- `RECORDS`は現行実績計算の表示可能な見通しの出所を表します。材料不足を実績ありと扱わず、回答draftを`QUESTION`／`QUESTION_AND_RECORDS`へ反映しません。R-08達成、R-07今日記録済みの優先も維持します。
- PR125のGoal契約は`minutes | sessions`です。候補の`count`へ変換せず、UIの「回」とHTTP／DBの`sessions`を区別します。Goal GETの`unit`／`sessionAmount`とToday結果を別取得する暫定案は、同一snapshot保証ではありません。FEのGoal／取得世代／要求順の管理で古い応答を除外し、設定変更時に再取得しますが、取得管理だけでBEのsnapshot整合を保証しません。
- PR125のGoalCreate／GoalPatchは未知項目禁止で、a／b・回答用revisionはありません。質問は未保存draftとして扱い、既存Goal保存へ混ぜません。Goal保存の成功を「回答は保存済み」と表示したり、未保存回答で保存済み予測を更新したりしません。draftのみを見せる限定先行では、保存・見通しへの反映が未接続であることを明示し、R-11の完了条件を満たしたと扱いません。
- 現行実績モードの取得管理と、将来の回答保存の競合防止は別です。revision／409未接続を、後日訂正時の古い書込や異なるsnapshotの混在を許す契約として採択しません。具体契約はPR118の担当調整に残します。
- #88のFE案はPR122基点、BEの本コメントはPR124 `feat/75-auth`基点で、まだ同じ基点の合意ではありません。取り込みは#88で限定先行の許可範囲と基点を調整し、5元パス→正式配置・差分・担当・検証を記録してから行います。この候補更新はその例外承認ではありません。

実績のみの暫定表示・draft保持は結合準備です。R-11のMust（回答から仮の見通しを作り実績で更新すること）、BEの回答保存／API、FEの正式接続、#117 DoDは残ります。共有`@contracts`はBEが所有し、この候補へAPI型やmock API、正式Goal／Today画面を新設しません。

## 設計意図と残る条件

描画分離と取り込みの最新条件は、次の(c)対応を参照してください。

### (c)の描画分離に向けた共通部品（2026-10-06）

[FE相談6016619430](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/120#issuecomment-6016619430)への対応として、依頼者が(c)＋必要な部品調整を承認しました。FEが同じ`ForecastPresentation`をB案で描画し、Kaitoが表示型・出所文言・入力部品の調整を持つ境界です。B rendererの実装・配置・図の見た目はFEが担当し、参照`PriorForecast`全体をB rendererと併置して同じ値を二重表示しません。B案画像と`--dot`／`--btn-line`の実定義はこの環境で未確認です。

| 対象 | 今回の候補差分と取り込み条件 |
| --- | --- |
| `presentation-types.ts` | core不足へ任意の`message`、completionへPlanなしの`{kind:"insufficient", message}`を追加。実績のみではFEがR-06の中心／完了の文言を別々に解決して渡す。記録済みでも非比較の不足を許可 |
| `PriorForecast.tsx` | `sourceLabel(Source)`、`sourceNote(SufficientSource)`、`assertForecastPresentation(unknown)`をnamed export。NONEは不足のラベルであり、estimate注釈には使えない |
| 実行時検証 | B renderer側でも`assertForecastPresentation(view)`を予測Boundaryの内側で呼ぶ。実績量／実観測件数／Plan／source／scenario／日数・ラベルnull整合を確認。API検証・出所決定・freshness・状態優先のresolverはFEが別に持つ |
| 完了の日数 | estimateの`p50Days`／`p80Days`は新しい必須項目。`engine-view.ts`は元Engine値をそのまま保持。0日とnullを維持し、週ラベルをparseしたり、補間点・履歴・分布・新指標を生成しない |
| 一部だけ期間外の完了見通し | p50有限／p80=nullは有効。Engineは各quantileの閾値を独立に判定するため、p50のラベルを残し、p80だけ「10回中8回の完了の目安は3年以上先です。」と表示。両方nullのときだけ「目安も3年以上先です。」を使う。B rendererにもこの分岐を引き継ぎ、nullを有限値で埋めたり有効な入力を拒否したりしない |
| 条件付き回数の理由 | `conditional.reason`は空文字・空白だけを共有guardと参照rendererで拒否。残量／設定量の条件付き回数と、日数予測ではないことを保ち、API型や計算を変更しない |
| `QuestionPriorFields.tsx` | `externalHeadingId`を指定すると内部h2を省き、その既存の可視見出しを`aria-labelledby`で参照。親がIDの一意性・実在・表示を保証。省略時は従来の内部h2。help/error/radioのuseId関係は保持 |
| `question-prior.css` | `.r11-qp`用の`--r11-qp-accent`／`focus`／`border`／`separator`／`source-background`／`source-text`／`error-background`／`error-text`／`notice-background`／`notice-text`。変数未指定は元の色をfallback。FEが実トークンの意味と対応を確認して親で指定する |

P-12の補助実績は`nSD + nSS`回中`nSD`回を保持します。0件は実績なしを表示し、回答を件数へ加えません。補助指標数、3指標の追加削除、P-12の削除、R-11のScope、D-26の具体契約は変更していません。

正式FEへ取り込む際の表示形式はProduct SpecのP-12を正とし、この候補文言で上書きしません。一部だけ期間外になる場合の意味、0/nullの保持、共有guardはB rendererへ引き継いでください。

取り込み対象は従来の`src/`4ファイルと`examples/engine-view.ts`の5つですが、今回**すべてに差分があり、旧`7b0debd`とGit blob同一ではありません**。取得元はこの調整を含むPR120のHEADを返信で固定し、FEの取り込みPRで元5パス→配置先・変更理由・担当を記録してください。`features/today/forecast-view.ts`へ置く例では、型importを`../prior/presentation-types`へ変えます。正式配置後はFE側を単一の保守元とし、候補の同期コピーは増やしません。

引き継ぐ検証は型負例11件・部品27件・固定Engine接続24件。これらを正式配置とimportに合わせて移し、さらにB rendererで不足／0日／null／実観測0件／R-07／R-08、guard fallbackと記録操作の維持、Goal切替・有効再取得での復帰を確認してください。[今回の実DOM記録](VERIFICATION.md#c対応の再検証2026-10-06)は独立previewの結果で、B rendererや正式FEの成功には流用しません。

### 既存の設計意図と残る条件

目的は、既存画面と競合せずに任意入力・出所の誤読を確認することです。controlled入力とresolved表示に分けた理由は、保存/応答の新旧判定とEngineの数値計算をUIへ重複実装しないためです。native fieldset/legend/radio、instanceごとのuseId、label、error説明IDを使い、任意入力とキーボード操作を保ちます。CSSは`.r11-qp`内に限定します。

画面の複製、新しいchart、共通schema、フォームframework、状態管理libraryを追加する代案は、FEの既存担当や未採択契約と重なるため採りません。別の固定HTML版も増やさず、唯一のindex.htmlはReact mount用です。大きな固定例JSONや内部引き継ぎ資料は追加しません。

trade-offとして親の正しいstate/値・API validationに依存します。失敗・古い結果を新しい結果として渡さない責任はFEです。部品の確認は実API、権限、再送、保存revision、本番Engine結合、#81の3〜5人確認の代替になりません。正式props/DTO・質問文・数値・出所version・不足条件が採択された時と、FE基盤ができた時に本候補を照合し、必要な差分だけを正式配置します。仕様の正本は[Product Spec](../../docs/product-spec.md)と[Architecture](../../docs/architecture.md)で、今回変更しません。

## 再現手順

repo rootを作業ディレクトリにし、Node/npm、既存lockを使います。新しいpackage manifestやroot依存はありません。検証依存として既存experimentのReact/React DOM/Viteと既存predictionのTypeScriptを再利用します。#70統合後はroot lockで導入し、compilerはpackage内・rootへhoistされた配置の両方に対応します。以下はPOSIX shellの手順です。PowerShellではrootの`package-lock.json`があれば最初にrootで`npm ci`を、なければ従来のprediction向け`npm ci --prefix`を同じオプションで実行してください。experimentのAPI/auth/DB/embedded Postgresやinstall scriptは起動しません。

```sh
if [ -f package-lock.json ]; then
  npm ci --include=dev --ignore-scripts --no-audit --no-fund
else
  npm ci --prefix packages/prediction --include=dev --ignore-scripts --no-audit --no-fund
fi
npm ci --prefix experiments/architecture-verification --include=dev --ignore-scripts --no-audit --no-fund
node experiments/question-prior-ui-candidate/scripts/check.mjs
node experiments/question-prior-ui-candidate/scripts/serve.mjs
```

checkはstrict型検証（[11の型負例](tests/type-contracts.tsx)を含む）、[27件のReact SSRテスト](tests/presentation.test.cjs)、隔離previewのVite buildを順に実行します。成功時は最後に`PASS: strict candidate types, SSR tests and isolated React preview build.`と表示します。生成物とホストごとの型参照は`.qa/`に置き、Git管理しません。個人パスをソースへ固定しません。

serveが出す`http://127.0.0.1:<port>/`を通常ブラウザで開きます。候補previewの静的GET/HEADだけを配信し、directory listing/APIはありません。外部公開・auth・DB・API接続はなく、CSPのconnect-srcはnoneです。終える時は通常interactive terminalで`stop`、またはCtrl+Cを使います。ブラウザのfile URLはこのpreview手順では使いません。

Missing existing verification dependenciesは上記install不足、型検証失敗は候補/負例の不一致、Vite build失敗はその出力を確認します。依存manifestやrootを変更して回避せず、修正後に同じcheckを再実行します。

確認環境はWindows x64/Node22.15.1/npm10.9.2、既存lockのTypeScript5.8.3、React/React DOMと型19.3.0、Vite8.3.1です。既存experimentのenginesは24.21.0のためNode22 installではEBADENGINE warningがあります。現行の候補CIはNode24.22.3を使います。これらの版は本番runtime採択を示しません。

## Engine候補からのローカル接続確認

[engine-view.ts](examples/engine-view.ts)は、別checkoutのPR119実Engine出力から表示候補へ渡すFE所有の接続例です。`conditionalPlan`の値をそのまま表示用`Plan`へ改名し、BEが同じsnapshotから付ける案の`unit`/`sessionAmount`をcontextとして受けます。UIで切上げや予測日数を再計算しません。週・timezoneのラベルはFEのcallbackに委ねます。保存済みGoalや採択済みHTTP DTOとして扱わず、正式なfreshness/error resolverも追加しません。

既存依存を準備して上のcheckを実行後、独立したPR119・PR118 checkoutのパスを指定します。照合したcommitとfixture hashは[検証記録](VERIFICATION.md)に記載しています。

```sh
node experiments/question-prior-ui-candidate/scripts/check-connection.mjs --engine-root "../engine-pr119" --fixtures "../contract-pr118/experiments/question-prior-contract/common-fixtures.json"
```

[接続check](scripts/check-connection.mjs)は既存compilerでEngineの元の型設定を検証し、ignored `.qa/connection/`へだけemitします。実Engine型と表示例のstrictな受け渡し、[共有18例と追加状態のReact SSRテスト](tests/engine-connection.test.cjs)を実行し、Nodeの版に依存しないTAP reporterを明示します。成功時はTAP結果と要約、同ディレクトリの`report.json`へ実出力・view・HTMLを記録します。Engine HEAD/fixture hashが変わった場合は停止するため、新しい提案を確認してから固定対象を更新します。Engine checkoutへの書込、依存追加、HTTP、DB、保存のfixtureはありません。

候補CIはNode24.21.0で部品checkと接続checkを実行します。PR119 `f7a6c02`とPR118 `b740075`をcommit SHAでcheckoutし、Engine HEADとLF正規化後fixture hashを照合します。成功時の`report.json`は14日間のActions artifactです。ここでのSSRラベルは`表示fixture:N日`で、実際の週ラベル・ブラウザmount・予測精度の検証ではありません。正式配置と保存・取得はFE/BEとの契約合意後に結合します。

## ブラウザでの再現チェック

[preview.tsx](examples/preview.tsx)のsave/scenarioは手動の表示固定例です。F04は回答a=null/b=LOW、実績60/100・実観測0、core約3日、残り40を1回15で行う条件付き3回の表示派生です。未保存draftを編集しても右の固定viewは変化しません。missingはF01の不足表示、recordedはF15、completedはF16、再取得失敗/保存不明はI07/I08に対応する表示例です。PR118の18入力やDP goldensを複製・再計算せず、全Engine例との正式結合を確認したものではありません。SSRの週ラベルはsyntheticな表示確認用で、quantile goldenではありません。

1. a/bの選択・「回答しない」・UNKNOWNを試し、上部draftと変更通知を確認。片方が他方を消さないことを確認する。
2. 選択済みradioの矢印/Space、Tab/Shift+Tabを操作し、親再render後のcheckedとフォーカスを見る。
3. 保存中を選んで2群と解除ボタンのdisabledを確認。保存失敗へ切り替え、draftを保持して再編集する。項目エラーを付けたbのlabel/説明対応を確認する。
4. 2つ目のGoalを出し、groupの選択が干渉しないことを見る。2つ目は固定値の例で、別Goalの保存controllerではない。
5. 再取得失敗・保存不明・不足・今日記録済み・達成へ切り替え、古い推定値、条件付き回数と日数の混同、実績の偽加算がないことを確認する。
6. desktop1280px、mobile390px/320pxで配置・横はみ出し・labelとfocus枠を確認する。
7. 外部見出しを切り替え、内部h2の出し分けとsummaryへの参照、折りたたみ、複数インスタンスのID/help/errorを確認する。
8. 検証用tokenを切り替えて通常／focus／disabled／errorを確認する。FE実token・B案の色として採用した値ではない。
9. R-06の実績不足／中心のみ／記録済み不足を切り替え、Planなしの不足文言とP-12の実観測件数を確認する。
10. 不正viewを選び、予測のQA Boundaryだけがfallbackし質問操作が残ること、他の有効状態へ切り替えると復帰することを確認する。正式FEのBoundary／freshness成功とは区別する。

実ブラウザの観察・assertion、console、スクリーンショットとセルフレビュー結果は[検証記録](VERIFICATION.md)にまとめます。SSRはDOM変更通知の検証ではありません。NVDA読上げと本番FE/API/Engine結合は残ります。
