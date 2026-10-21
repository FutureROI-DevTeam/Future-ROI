# Prediction Engine（Refs #71・#72・#73）

[実験・速度・失敗と根拠の横断索引](../../docs/prediction/experiment-history.md)から、現行計算と後続研究の実施範囲・採否・未確認をたどれる。

**Supporting Doc / Not a Source of Truth.** 正式仕様は[Prediction Engine D-19〜D-22・D-31](../../docs/architecture.md#prediction-engine)と[Test Strategy T-01〜T-15](../../docs/architecture.md#test-strategy)。このpackageはDB・HTTP・UI・時計から独立した計算本体とローカルテストを持つ。現在はAPIへ結合済みで、公開環境・製品受入の完了とは区別する。純粋Engineの型検査・数値テストCIは[検証CI](#検証ci)を参照する。

## 承認範囲と現在の状態

**現在の結合：** [Today route](../../apps/api/src/prediction/routes.ts)から[API adapter](../../apps/api/src/prediction/engine.ts)の`runPrediction`を、[R-11変換](../../apps/api/src/prediction/r11.ts)から`runQuestionPrediction`を呼ぶ。Goalのtimezone・DB snapshot・DTOはAPI側の責務。既知の`PredictionInputError`・`PredictionConfigError`（R-11では`QuestionPriorError`も）はadapterの`PredictionFailed`を経て[appのHTTP 500処理](../../apps/api/src/app.ts)へ接続済み。未知例外は再throwし、この既知エラー変換には含めない。純粋packageのテスト成功だけでFE・公開環境・実ユーザーの受入まで保証しない。

**限定先行時点の履歴（2026-10-03〜04）：** 以下2段落は当時の承認・未完了状態の記録で、現在のAPI未結合を意味しない。

2026-10-03の依頼者承認を[#71](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/71)・[#72](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/72)・[#73](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/73)の「承認済みの限定先行」へ記録した。独立ローカルBranchでEngine計算本体と関連テストを先行できる。正式なアプリへの組み込みは#70完了後で、#70のBLOCKED、FE／BEの依存、正式結合・レビュー・Merge・完了判定のHard依存は維持する。

元の先行作業はmain `af001c6e797b9833a63234bd1646171ac8e8c542`を基点とした。今回の独立レビューbranchは最新main `e449b6cc78cd5261bcd0390f9883e9d37d6773e6`から作成し、2026-10-04の依頼者指示に沿ってcommit／push／通常PRへ出す。依頼者は2026-10-03T08:44ZにFE／BEを含むTypeScript／Nodeの基本構成合意を報告し、反映案は[PR #97](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/97)にある。確認時は未Merge。このpackageでは技術Decisionやrootのpackage／workspace／runtime設定を変更していない。2026-10-04の依頼者指示で純粋Engineの検証CIを追加するが、製品の採用runtime・runnerを確定するものではない。公開predictには質問由来prior／初期seedの追加案を取り込んでいない。内部候補の追加は次節と候補説明へ分ける。

## 計算の利用条件と処理

2026-10-05の継続指示に基づく[Goal別priorの内部候補](GOAL_PRIOR_CANDIDATE.md)を独立branchで追加した。a/b別の初期snapshotとsource/versionを受け取り、既存の数値経路を共有する。公開`predict`の共通prior=2・入力／出力契約・不足判定は維持する。数値prior候補の9テストを含む従来56テストを保持し、[PR118候補adapter](QUESTION_PRIOR_ADAPTER_CANDIDATE.md)の5テストとsnapshot／worker接続例の3テストを加え、n=H限定の境界回帰2件と合わせて当時66テストへ拡張した。#133時点の公開入口4件を含む70件を保持し、#188の公開結果契約・再帰収集の回帰3件を加え、当時73件を同じCIへ含めた。独立CDFオラクル3テストは別コマンドで確認する。Supporting候補全体の採択と、下記#133の依頼者承認範囲を分ける。

[src/index.ts](src/index.ts)の`predict(input, config?)`は正本と同じ必須項目を持つ`PredictionResult`を返す。日数metadataの具体的な集計と公開エラーも依頼者承認を反映し、現在は上のAPI adapterから利用する。呼び出し側がGoalのtimezoneで計算した`today`と実記録を渡す。DONEは実際の正の整数amount、SKIPPEDはnull、Goal量は整数。日付生成・timezone変換・DONE量の入力・HTTPエラーへの変換は外側の責務。型どおりでない外部JSONの構造検証は呼び出し側が行い、EngineがすべてのJavaScript例外を入力エラーへ変換する契約にはしない。

1. [observations.ts](src/observations.ts)は整数のGregorian日付演算で入力を検証し、コピーを整列する。未来・重複・不正な日付や量は達成判定前に拒否する。隣接した記録だけを数え、欠けたUNKNOWN日を跨がない。実績は初期量＋全DONEの実量で、今日の量も1回だけ含む。内部事実として最古記録日〜今日／昨日のordinal範囲・暦日数と有効記録件数を返す。ログ0では観測開始日を決められないため窓はnullで、初期進捗から開始日を推測しない。
2. [predict.ts](src/predict.ts)は正式な優先順「入力エラー → 達成済み → 今日記録済み／データ不足」を適用し、各遷移へ既定prior=2を加えて事後分布を作る。達成済みのcompletionは`completed`、未達成で起点状態の遷移がない場合は`insufficient`。0日やnullで不足を隠さない。
3. [recovery.ts](src/recovery.ts)はBeta-Geometricの中央値・80%分位点をBigIntの厳密な整数比で比較する。約分は計算量を抑えるためだけで、閾値への一致を保持する。中心計算へlgamma・乱数・epsilon・Hの打ち切りを使わない。
4. [completion-integrated.ts](src/completion-integrated.ts)は[D-31で採択した既定方式](../../docs/architecture.md#d-31-同一モデルの完了cdf統合候補203)の有限整数域で同じMarkovモデルのBeta事後積分を行い、閾値近傍だけ限定BigInt比較を使う。明示sampled／範囲外／数値gateでは[random.ts](src/random.ts)の既存抽選順を使う。[config.ts](src/config.ts)の既定要求値はmodelVersion=`behavior-persistence-m1-v1`、prior=2、K=200、H=1095、seed=20261012。configは要求のechoで実抽選数ではない。内部computationは閉形式／境界値でsamples/seed=null、samplingで実K/seedとfallback理由を持ち、API境界で公開DTOから除く。
5. sampling経路の[completion.ts](src/completion.ts)は各抽選について将来DONE回数0から初到達日の確率を計算し、等重みに混合する。到達不能な状態だけを除き、微小な確率を切り捨てず、H以後の尾を再正規化しない。両方式の累積確率は仕様のepsilon=1e-12で判定する。今日未記録なら1回の仮のsessionを実績と分けて引き、今日記録済みなら実績を増やさずCURRENT_STATEから始める。必要回数がHを超える場合は両分位点null、今日の仮実行で届く場合は0日。

統合方式の数値／metadata／資源保護4テストを加え計77テスト。samplingの確保前work上限とgの短い厳密積・safe day上限は[検証資料](../../experiments/completion-cdf-integration/README.md)を参照する。gはHで切らず、上限超過を不足／nullへ変換しない。以前のsampling計測・固定例は当時の方式の証拠として保持し、代表入力・全域・公開runtimeを混同しない。

数量・posterior形状はNumberのsafe integer範囲を確認し、厳密性を失う入力は拒否する。configは正の整数prior／K／H、uint32 seed、実装済みmodelVersionを検証する。これは計算の技術的な入力境界で、Productの新しい上限やAPIのエラーコードを採択したものではない。数値部品は内部用で、外部入力は`predict`の検証を通す。Goal別候補の内部型・検証範囲と極端な非対称priorの性能制約は[候補の説明](GOAL_PRIOR_CANDIDATE.md)を参照する。

## metadata・公開エラーの契約

#248の比較専用に`completionDistributionForFrozenState(posterior, initialState, requiredFutureDone, config)`と`frozenCompletionCdf(input, horizon=30)`を追加公開する。[D-248](../../docs/architecture.md#d-248-途中到達による個人補正248)に従い、発行時posterior/state/configと実completion methodから有界のCDF表現を再現する。元の`predict`/`predictWithQuestionPrior`・既定値・quantileは保持し、新しい個人係数fitやDB・同意をこの純粋packageに置かない。表現のroundoffと支持失敗は[設計補助](../../docs/prediction/milestone-calibration.md)へ追跡し、[API側の純粋回帰](../../apps/api/tests/milestone-core.test.ts)で元method/seed/境界を検証する。

2026-10-04に、集計の具体定義とエラーの種類・理由・場所を区別する契約について、採用理由を説明したうえで依頼者が承認した。[正本](../../docs/architecture.md#集計metadataと計算エラー)へ反映した。M1、既存観測窓、数値計算、HTTP／DB応答の範囲は変えていない。

- `observedDays`：最古の明示ログ日から、今日記録済みなら今日／未記録なら昨日まで、両端を含む暦日数。UNKNOWN日も含む。`recordedDays`：その窓の一意な明示DONE／SKIPPED数。ログなしは観測起点も明示記録もないため0／0。初期進捗、Goal作成日、記録開始日から観測期間を推測しない。metadataは不足判定や遷移数へ影響させない。
- [errors.ts](src/errors.ts)の既存`PredictionInputError`／`PredictionConfigError`を公開exportする。RangeError派生classの`reason`と凍結した`path`で分類する。pathは入力・設定項目、または導出値の場所（`UNSAFE_POSTERIOR`ならposterior以下）。messageの文面を契約にせず、入力実値・HTTP statusCode・公開response code・DB変換を含めない。未知の例外を握りつぶさない。`UNSAFE_POSTERIOR`のmessageは`prior + transition count`がposterior shapeのsafe integer範囲を超えたことを説明する。prior単独の大きさだけで失敗と断定せず、reasonと導出値pathは維持する。4種類の隣接遷移について、最大safe integerの境界は受理し、1だけ超える場合は対応するpathで拒否する回帰ケースを確認する。

完了分位点は既存仕様どおり明日が1日目。未記録の今日の仮実行で届く場合は0日、H日以内に分位点へ届かなければnull。insufficient／completedを0日へ変換しない。[result-contract.test.mjs](tests/result-contract.test.mjs)で公開Result・空履歴・暦日境界・metadataだけの変化・公開class・訂正再計算を検証する。型検査では必須metadataがない内部計算の型を完全Resultへ代入できない負例と、実際の`predict`が完全Result型に適合する正例を維持する。

## ローカル検証

導入済みNode、TypeScript compiler、PowerShell 7を使う。既存compilerのパスを渡す方法はinstall・ネットワーク・Secret・DB不要。Node標準`node:test`は限定先行packageのrunnerで、Vitest／fast-checkや製品runtime版を採択したものではない。devDependenciesはTypeScript 5.9.3だけで、lockfileは#70でroot workspaceの`package-lock.json`へ統合した。実行時dependenciesはない。

PowerShellでrepoのルートから実行する。`<existing-compiler>`は導入済み`typescript/bin/tsc`の実パス。

```powershell
node packages/prediction/scripts/check.mjs typecheck --tsc '<existing-compiler>'
node packages/prediction/scripts/check.mjs test --tsc '<existing-compiler>'
node packages/prediction/examples/recalculate.mjs
node packages/prediction/scripts/benchmark.mjs
pwsh -NoProfile -File scripts/check-foundation.ps1
```

package内からは`npm run typecheck -- --tsc '<existing-compiler>'`、`npm test -- --tsc '<existing-compiler>'`も同じ入口を使う。compilerを解決できる場合だけ`--tsc`を省略でき、不在なら明示的に失敗して自動installしない。testは型検査後にgitignore対象のdistへ出力し、全`tests/*.test.mjs`を実行する。benchmarkはtestでコンパイルした実際の`predict`を使い、環境・全入力・各条件の1回目と5回の追加計測・結果をJSONで出す。T-14必須の3条件で500ms以上の計測があれば非0で終了する。`--include-midpoint`を追加すると548回を情報用に測るが、性能要件は増やさない。代表入力と開発機での計測であり、全入力・混合負荷・配備先の最悪性能を保証しない。FoundationはEngineテストを実行しない。

| 対応する正式テスト | 実在する確認 |
| --- | --- |
| T-01、T-04、T-07〜T-09、T-11〜T-13 | [predict.test.mjs](tests/predict.test.mjs)：UNKNOWN、日付境界、中心の独立性、決定性、不変入力、今日量、状態優先、不足、未来・重複、単調性、CURRENT_STATEの独立閉形式 |
| T-02、T-03、T-05、T-15（中心） | [recovery.test.mjs](tests/recovery.test.mjs)：独立した整数階乗比、alpha=2閉形式、境界、単調性、beta=10000、unsafe形状和、固定seedのBeta→Geometric MC。MC許容差は既存テストの基準で、CI追加時に変更していない |
| T-06、T-10 | [completion.test.mjs](tests/completion.test.mjs)：2100入力条件を独立した整数全経路で照合し、到達不能刈り込みの有無を比較。同じtheta条件の畳み込み、微小確率P50=3、閾値一致、P50あり／P80 nullを確認 |
| T-06、T-10（n=H） | [completion-deadline.test.mjs](tests/completion-deadline.test.mjs)：全DONE経路の独立な積、H=1・端点0/1・prune無効・n=0/n>H/n=H−1。数値契約を保つfill省略の理由と限定測定は[性能追試](verification/deadline-fill.md) |
| T-15（乱数） | [random.test.mjs](tests/random.test.mjs)：正式vector、乱数消費順、Gamma／Betaの平均・分散、uniformの開区間 |
| T-14 | [benchmark.mjs](scripts/benchmark.mjs)：実Engine・K=200／H=1095、必要120／400／1095回。Windows・Node v22.15.1・Intel i7-1360Pで各500ms未満を確認。代表入力はposterior a=(14,7)、b=(7,9)。[2026-10-04の全入力・CPU/メモリ・各6回の計測](verification/benchmark-node22.json)を保存。採用runtime・配備機での結果ではない。548回は情報用で追加ゲートではない |
| package基盤 | [scaffold.test.mjs](tests/scaffold.test.mjs)、[type-contracts.ts](tests/type-contracts.ts)、[fixtures.ts](tests/fixtures.ts)：依存境界、状態型の負例、既知fixture。テキスト依存監査は補助で、全面的な静的解析を保証しない |
| metadata／公開errorの契約 | [observations.test.mjs](tests/observations.test.mjs)、[result-contract.test.mjs](tests/result-contract.test.mjs)：空履歴・今日・昨日・UNKNOWN・逆順・初期進捗・達成済み・暦日境界の公開値。未来／重複は結果を返さず、入力／設定／導出値pathを分類。この行は純粋Engineの契約検証。現在のAPI結合とHTTP応答は[adapter](../../apps/api/src/prediction/engine.ts)、[today.test.ts](../../apps/api/tests/today.test.ts)、[question-prior-http.test.ts](../../apps/api/tests/question-prior-http.test.ts)を参照し、公開環境の受入は別に確認する |

テスト期待値は正本の固定例と独立オラクルに基づく。過去の準備branch（`dcc6440`／`f29e24d`）やmainの実験を本体へ丸ごとコピーせず、lgamma参照値を現在の中心計算のオラクルとして流用していない。テスト成功をAPI／UI結合、公開環境、正式なIssue受入の成功と扱わない。

## R-11の公開入口（#133）

[D-26](../../docs/architecture.md#2026-10-07の保存予測接続133)の依頼者承認範囲を実装・チームレビューする`predictWithQuestionPrior`を追加する。旧`predict`と既存候補・独立oracleは保持する。入力は`{ prediction, answers: { a, b }, mapping }`で、APIは保存時mappingから渡す。内部Betaやraw回答をPredictionResultへ漏らさず、`{ prediction, provenance, plan }`を返す。R-11の`config`にはスカラーpriorがなく、modelVersionは`m1-question-prior-v1`。旧結果へcastしない。

numeric回答または実際の起点遷移が材料。UNKNOWN/nullは共通Beta(2,2)を計算に使っても回答材料ではない。中心はb、完了はa/b両方を必要とし、今日記録済み・達成済みの優先を保つ。Planは未達成かつ完了材料不足のときだけ実残量から返す条件付き回数。前回posteriorからの更新や、回答を実績へ加算する処理は持たない。旧数値核とK/H/seedを使い、完了DPを最大1回だけ計算する。

[4公開入口回帰](tests/question-prior-public.test.mjs)と[公開型の負例](tests/type-contracts.ts)を追加し、既存66＋4＝70件を同じCI入口で確認する。DB/HTTPは純粋packageの外側で、FE結合・校正・クラウド性能はこれらの成功から保証しない。

公開R-11型は[question-prior-types.ts](src/question-prior-types.ts)が所有し、公開入口と内部adapterから参照する。従来の公開exportを保持し、戻り値は同じkey・値・省略条件・key順で構築する。[再帰collector](scripts/test-files.mjs)と[境界監査](scripts/check.mjs)は入れ子のtest／sourceも対象にする。依存監査は補助であり完全な静的解析ではない。

## 計算を読む・変更する入口

公開入口と型は[index](src/index.ts)・[types](src/types.ts)・[R-11型](src/question-prior-types.ts)から確認する。数式の前提と境界の正本は[Architecture](../../docs/architecture.md#prediction-engine)、改行・コメント・抽出の規則は[CONTRIBUTING](../../CONTRIBUTING.md#コードの読みやすさ)を参照する。

| 変更する計算 | 読む場所・対応する値 |
| --- | --- |
| 実績・遷移の採取 | [observations](src/observations.ts)。UNKNOWN、実量、今日の状態、`nDD/nDS/nSD/nSS`を予測から分けて読む |
| 今日の仮実行と残り回数 | [completion-scenario](src/completion-scenario.ts)。量はGoal内の整数分／回、`requiredFutureDone`は明日以降の必要DONE回数。記録済み今日量を二重に差し引かない |
| 再開待ち日数 | [recovery](src/recovery.ts)。整数比の生存確率、短積探索、逐日積の資源保護。1000日は計算予算であり、完了のhorizonやgの定義ではない |
| 固定確率での完了・事後混合 | [completion](src/completion.ts)。固定a/bの初到達DPと事後サンプルの等重み混合 |
| 同一モデルの完了CDF積分 | [completion-integrated](src/completion-integrated.ts)。DONE／SKIPPED起点の試行数、離脱／再開の確率質量、閾値近傍の整数比較、方式のfallback |

これらの整理では演算順序・比較の等号・乱数・丸め・値と公開exportを維持する。方式や拒否条件を変更する場合は、独立オラクル・凍結fixture・資源境界と公開契約まで影響を調べる。

## 検証CI

[prediction.yml](../../.github/workflows/prediction.yml)は、`packages/prediction/**`またはこのworkflowが変わるPR、mainへのpush、手動実行を対象にする。Foundation CIは別に維持する。PRではGitHubのmerge用commitをcheckoutして基底branchとの組み合わせを検証する。候補adapterの独立CDFオラクル3件と18例の再現JSONもNode matrixで確認し、実験フォルダの変更をCI対象に含める。同じPR／branchの古い実行は取り消し、各jobは10分で打ち切る。read-only permissions・checkout credentials非保持で、Secret・DB・`pull_request_target`は使わない。fork PRも同じ構成で、GitHub側の実行承認が必要な場合はその制限に従う。

Ubuntu runnerで、Node 22.23.4とNode 24.22.1のmatrixを使い、TypeScript 5.9.3（root lockfileで固定）を使う。Node 24系は採用候補での回帰検出を目的に追加し、各Actionsログで実行版を確認する。一方の失敗でももう一方の検証結果を得るためfail-fastは無効にする。これらは検証版で、製品runtimeの最終採択ではない。root `package-lock.json`には公式npm registryの配布先とintegrityを含め、`npm ci --workspace=@futureroi/prediction --include=dev --ignore-scripts --no-audit --no-fund`でこのpackageの検証依存だけをinstallする。lifecycle scriptsとcacheは使わない。

同じ手順をローカルで再現する場合は、repoのルートで次を実行する。初回installには公式npm registryへの接続が必要で、Secret・DBは不要。

```sh
npm ci --workspace=@futureroi/prediction --include=dev --ignore-scripts --no-audit --no-fund
npm run typecheck --workspace=@futureroi/prediction
npm test --workspace=@futureroi/prediction
```

型検査はsource・固定fixture・公開Resultの型契約を確認する。testはコンパイル後に`tests`配下の`*.test.mjs`を再帰収集して実行し、数値・回帰・固定seed vector・既存MCと独立オラクルの47テストに内部候補9件を加え、PR118候補adapterの5件とsnapshot／worker接続例3件も含め、n=Hの境界回帰2件も加え、#133の公開入口4件を加え、#188の3回帰も含め#203の4回帰を加えて現在77テストを実行する（候補も同じPR CIで確認する）。compiler・install・テストの失敗はjobを失敗させ、skipや代用の成功値へ変換しない。Actionsログで版・実コマンド・pass/fail件数を確認する。test後に11種類の[接続用入出力例](examples/README.md)を実行し、2種類の[30日合成デモ入力](examples/README.md#デモ向けの30日合成入力)も実行し、実EngineのT-14必須3条件を同じNode matrixで計測する。各条件の初回＋5回をすべて500ms未満と判定し、失敗をjob失敗として保持する。固定入力・seed・CPU/メモリ・実runtime・Actions公開来歴を含むJSON・11接続例JSON・30日デモ入力JSONは、benchmark失敗時も公式upload-artifact v4（SHA固定）で14日保存する。artifactはNode版・run/attemptごとに分け、欠落時も失敗する。これはCI検証ホストの計測で、採用runtime／配備先でのT-14再確認は残る。required checksやbranch protectionは変更しない。

## 補完・訂正後の再計算例

[recalculate.mjs](examples/recalculate.mjs)は実行可能な例で、コンパイル済みdistを使って11種類の入力と実際の`PredictionResult`をJSONで出力する。上のtestコマンドを先に実行する。`ERR_MODULE_NOT_FOUND`ならdistが未生成なのでtestを実行し直す。

呼び出し元は、保存済みの一意な日付のログ全体を渡す。補完は行の追加、訂正は該当日の行を置き換えた新しい入力で`predict`を再実行する。同じ日の新旧行を両方渡すと重複エラーになる。Engineは前回結果や保存処理を持たず、毎回その入力から全量再計算する。`today`は例で固定しており、現在時計を読まない。

例のGoalはtotal=100、initialProgress=20、sessionAmount=10、today=2026-10-10。8日のUNKNOWNを挟む元履歴から、既定K=200／H=1095／seed=20261012で次の結果を得る（Windows／Node22で実行）。

| 入力の変更 | actualDone | nDD / nDS / nSD / nSS | completion |
| --- | --- | --- | --- |
| UNKNOWNのまま | 60 | 1 / 1 / 1 / 1 | TODAY_DONE: P50=5日、P80=8日 |
| 8日にDONE・実量15を補完 | 75 | 3 / 1 / 1 / 1 | TODAY_DONE: P50=3日、P80=5日 |
| 8日をSKIPPEDへ訂正 | 60 | 1 / 2 / 2 / 1 | TODAY_DONE: P50=6日、P80=8日 |
| 元履歴に今日DONE・実量3を追加 | 63 | 2 / 1 / 1 / 1 | CURRENT_STATE: P50=7日、P80=10日 |
| 元履歴に今日DONE・実量40を追加 | 100 | 2 / 1 / 1 / 1 | completed |

TODAY_DONEは未記録の今日を1回実行した仮定からの将来日数、CURRENT_STATEは今日の実績を加算済みの状態からの将来日数。`available`で分位点がnullならH日以内にその確率へ到達していない。`insufficient`は有効な遷移起点が不足し、`completed`は実績で既に達成している。これらを0日へ置き換えない。出力には上記契約の日数metadataも含む。

[recalculation.test.mjs](tests/recalculation.test.mjs)は補完・訂正で両側の隣接ペアが変わること、今日量を二重加算しないこと、sessionAmount変更で過去実量を変えないこと、達成から未達への再計算を検証する。加えて固定seedの120履歴を、UNKNOWNも含む暦日列を直接走査する独立オラクルと照合する。入力を深くfreezeし、別seedの呼び出しを挟んでも再現することと、拒否した重複入力が次回を汚さないことを確認する。これはローカルの再現可能なケース群であり、fast-checkの採択や網羅性の保証ではない。

## #70後に合わせる点と残条件

#70でroot workspace（`@futureroi/prediction`）とlockfileへ統合し、TypeScript版を5.9.3に揃えた。#77で`apps/api`の`/today`から呼ぶため、`package.json`に`exports`（ビルド済み`dist/src/index.js`と`.d.ts`）と`build`（`scripts/check.mjs build`、`declaration`出力）を追加し、root scriptsがAPIのtypecheck・testの前にbuildする。packageのコマンド、Node標準runner、検証CIのNode matrixは変えていない。今回のT-14 CIは検証用Node/ホストの結果として記録し、正式runtimeでsampler vectorとT-14を再確認する。APIへのエラー変換と公開config変更範囲は今回の採択に含めない。

以下は初期Engineの受入履歴で、現在の#133の完了判定とは分ける。当時のレビューは#71の中心計算、#72の完了計算と統合、#73の数値・性質・性能確認までの純粋Engine範囲。#70完了後の正式結合、#71→#72→#73のレビュー・受入・Merge・完了判定は残る。純粋Engineの型検査・47テストCIを追加したが、#72の採用Runtimeによるvector確認、#70の採用runner・統一CIへの整合と#73のT-14採用環境での再計測は残る。Foundation CIは文書・設定だけを確認し、Prediction Engine CIとは別。アプリコード、DB、FE、認証、配備、課金の作業は今回含めない。metadata／公開エラーの契約が確定しても、アプリ結合やIssueの正式受入へ昇格させない。
