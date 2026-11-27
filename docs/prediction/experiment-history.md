# 予測エンジンの実験・速度と判断の索引

**Supporting Artifact / Not a Source of Truth。** [文書Task #222](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/222)、2026-10-11 UTC時点。文書の基準mainは `8e5a82722f859cd5420ab5b18306fa57df13c44d`。正式仕様は[Product Spec](../product-spec.md)と[Architecture](../architecture.md#prediction-engine)、現在の呼出し・検証入口は[Engine README](../../packages/prediction/README.md)と[変更対応表](../change-map.md)。

これまでの調査・実装・数値検証・速度・失敗を、下記の一つの索引から追えるようにした。今回の文書化では新しい実験、再fit、データ開封、製品変更、merge、deployをしていない。古い報告の「未実行」はその時点の記録として残し、後続receiptで現在の工程状態を示す。

## 読み方と現在の結論

- 同一モデルの完了CDF積分は[D-31](../architecture.md#d-31-同一モデルの完了cdf統合候補203)と[PR #204](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/204)でmainへ反映済み。有限Kの抽選差と処理時間を減らす数値・実装上の変更で、実際の行動やP80校正の改善を証明したものではない。
- 公開データの相対スコア改善と、有限日付の校正は別。pooled logisticや固定NLL semi-Markovで相対改善が出ても、P80の日付を信頼できる保証は得ていない。OULADはクリック活動日proxyで、学習分数・努力・習熟・成果の正解ではない。
- 最新のgoal fair-RPS J13は **全4条件完走 / 数値gate HELD（GAP_RUNNERのみ）/ coefficientSelected=false**。旧NLL候補のJ14 RPS相対改善33.5%とこの工程を混ぜない。新RPS係数の採択・新J14/予約群評価・P80改善は未実施。
- 合成oracle、bit/bytes一致、メモリ内完走、数値gate、未知集団への性能、公開運用、人間の理解・行動効果は、それぞれ別の受入対象である。

| 表記 | 意味 |
| --- | --- |
| 調査のみ | 文献・配布条件・数理の検討。実装/fit/速度測定を含まない |
| 合成検証 | 人工入力・独立oracleで性質や実装を確認。実データ改善ではない |
| 実評価 | 承認された固定proxy集団を使用。採択・実User保証とは分ける |
| HELD / 不通過 | 固定停止条件を満たさず次工程へ進まない。結果を消さない |
| 未実施 / 未確認 | 実行結果・根拠がない範囲。成功チェックを付けない |

## モデル・実験の索引

モデル族、同じ族の校正目的、数値計算方式、係数候補を区別する。この索引で照合できたのはM0/M1/M2・pooled logistic・CDF power・CDF質量/shape補正・共有theta semi-Markov・BOCPD・2状態Bernoulli HMMの9族。予測後の写像もこの数え方には含む。1,681はsemi-Markovの41×41係数点、1,001はpowerの係数点、4 M×2 seedは精度条件でありモデル数ではない。同じsemi-MarkovのNLL版とRPS版、JS/C++、Buffer修正を別モデルへ加算しない。窓長・不足時fallback・multi-Nも族数に加算しない。PMData EBは記録未確認で総数に含めない。匿名引継ぎの20工程と後述の研究/実装修復をまとめた索引であり、20をモデル数や独立試験数とは呼ばない。

| 工程 | 何を調べた・作ったか | 結果・判断 | 根拠の入口 |
| --- | --- | --- | --- |
| M0 / M1 / M2比較、prior、中心指標 | iid、2状態、継続長3状態。Beta prior、期待値と再開待ち中央値 | 合成状態依存・短履歴・欠測を比較。M1/Beta(2,2)/中央値を採択。M0を含む構造は有限標本の優越保証ではない | [合成Evidence](evidence.md#m0--m1--m2の比較)、[判断理由](decision-log.md)、[固定履歴22 files](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/experiments/prediction-model-validation) |
| DP / future MC / CRN | 固定thetaの初到達DP、事後抽選、独立漸化式・経路列挙 | 日々のMCをDPへ置換。事後samplingは別。微小確率打切りを廃止、到達不能状態だけ刈る | [DP/MC・修正失敗例](evidence.md#dpとmonte-carloの比較)、[D-22](../architecture.md#d-22)、[現test](../../packages/prediction/tests/completion.test.mjs) |
| PR #119 n=H限定fill省略 | 毎日読む境界セルだけを初期化し、通常fill・抽選順・PMF/quantileを保存 | 限定predict改善と通常case遅化の双方を保持。full-PMFバイト比較16,040件・分位点比較5,248件一致 | [固定検証](../../packages/prediction/verification/deadline-fill.md)・[測定JSON](../../packages/prediction/verification/deadline-fill.json) |
| 質問priorと公開契約 | a/b別prior、回答版、raw再構築、独立積分/DP、固定fixture | 元18 prior候補・580独立チェックと後続testを合算しない。R-11接続は実装済み、自己申告校正は未証明 | [局所Evidence](evidence.md#質問由来priorの局所検証2026-10-04)、[契約fixture](../../experiments/question-prior-contract/README.md)、[公開Engine入口](../../packages/prediction/README.md#r-11の公開入口133) |
| 実Engine単体・同期/worker・API混合負荷 | T-14、配線、応答cohort、保存/Today/session待ち | 旧入力誤差とwarmup混入を保存。Windowsの546.83ms FAIL、CRUD p95>5秒を保持。workerはこの測定だけで採択しない | [速度索引](#速度と資源の索引)、[現行API report](../../experiments/api-mixed-load/REPORT-2026-10-09.md) |
| 同一Markov/Betaの閉形式CDF | Beta-binomial和、閾値近傍の整数比較、有限work/fallback、DTO投影 | main実装。整数oracle・範囲内19集合の7 fallback解消。数式同一性と統計校正を分ける | [D-31](../architecture.md#d-31-同一モデルの完了cdf統合候補203)、[報告](../../experiments/completion-cdf-integration/README.md)、[PR #204](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/204) |
| pooled logistic合成→metadata→固定実評価 | 少数特徴の正則化logistic、起点固定X、DP仮想prevstate、cal offset | 3合成生成則。iid条件では悪化。未読境界のv1違反を修正後14test。training300/cal100/dev150の実評価で相対loss screen PASS、日付校正未確立 | [#207](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/207)、[匿名receipt](experiment-receipt-2026-10-11.json)、[実評価の意味](#公開proxy評価と校正) |
| Final-CDF power | 凍結CDFをF^gammaへ、cal100/confirm150、一回固定比較 | 係数gamma≈.3917486。confirmでrawよりloss/Brier/RPS悪化、研究・日付screen不通過。この1案は不採用 | [匿名receipt](experiment-receipt-2026-10-11.json)、下記[校正結果](#公開proxy評価と校正) |
| H90追加学習なし監査 | J2013/J2014各300、Markov/iid/pace/all-null固定 | J14 iidはall-null相対screen通過、MarkovはCI上端で不通過。両モデルのP50/P80絶対screen不通過 | [匿名receipt](experiment-receipt-2026-10-11.json)、下記[校正結果](#公開proxy評価と校正) |
| CDF質量/条件付きshapeの2係数 | pi90切片と条件付きpower、N10/H90合成 | 目標順序とH再正規化の反例、構造的pi=0/1限界を保存。合成のみ、実fitに進めた候補はsemi-Markov1本 | [数理と数値の境界](#数理と数値の境界)、[匿名receipt](experiment-receipt-2026-10-11.json) |
| 共有theta semi-Markov / NLL | 仮想S runに応じる再開率、系列全体の積分後Cで正規化、6科目等重みridge | 32/64/128の全grid収束不通過→同じ入力の256/512数値修復通過→固定係数で新J14一回確認。不合格を採択にしない | [NLLとRPSの工程](#semi-markovのnllとrpsの工程)、[匿名receipt](experiment-receipt-2026-10-11.json) |
| 残差・fair RPS・全合法T | pi90と条件付き時刻、既使用J13/J14の群診断、同じ合法到達日でpaired bounds | 内部極値を両端だけで落とす反例を保存。ordinaryとfair、MC幅と観測打切りを分ける。既使用J14を次の未使用確認へ再利用しない | [数理と数値の境界](#数理と数値の境界)、[匿名receipt](experiment-receipt-2026-10-11.json) |
| JS/C++同pool、stream、Buffer再利用、GC境界修復 | RNGをJS側固定、6系列保存、同bytes/加算順序、資源・abort/finish guard | 数値保全と資源内完走。異条件wallからspeedupを作らない。旧STOPを保持 | [速度・資源](#速度と資源の索引)、[最終J13](#最新j13の固定gateと解釈) |
| 初期OULAD・recency・#204再評価・C1 v2 | development/holdout、窓長、入力保持率、再利用200人を区別 | 初期coverage不足、窓support gate未達、閉形式でも校正未修復、C1 v2はdevelopmentでSTOP | [初期評価と窓](#初期評価と窓候補の履歴)、receipt initialProxyAndWindows |
| BOCPD・保存weight診断 | hazard .01/Beta(2,2)、現在regime継続、保存weightを調査 | 相対RPS差CIは0を含み絶対screenも不通過。小群診断は因果機序の証明ではない | [BOCPDとHMM](#bocpdとhmmの保存済み研究)、receipt bocpd |
| HMM NLL・J14-A・同人J13・long-S | 5係数/固定8 starts/weighted exact EM、固定CDF DP | 数値gate通過、既使用J14-Aで過大予測。同人in-sampleにも過大予測。長期休止と永久離脱は未識別 | [BOCPDとHMM](#bocpdとhmmの保存済み研究)、receipt hmm2 |
| fixed multi-N・保存second seed | 同J13、N1/5/10/20/30、H90、再fitなし | 数値基準通過と絶対校正を区別。保存seedの順位一致は真の分布順位保証ではない | [複数N](#固定multi-nと保存seed)、receipt hmm2.multiN |
| PMData EB | 別の探索工程として言及された候補 | 対応する実行receipt未確認。条件/速度/採否は未確認として残す | [不足証拠](#不足証拠と次の判断) |
| conformal / 共通単調写像 / 選択的表示 | 生存予測校正・shift・表示対象の制限 | 文献/数理調査のみ。未実装・未fit・速度未計測。実験済みモデル数へ加算しない | [調査候補](#文献調査のみの候補) |

未公開研究のsource SHAは識別子であり、mainに存在する証拠ではない。下記JSONには匿名集計と元receiptのSHAを置く。原source・個人入力・完全traceは管理者の保全領域にあり、この文書だけでは実fitを再現できない。存在しないGitHub blobリンクを作らない。

## 速度と資源の索引

時間の単位、単体/HTTP、入力と環境をそろえて読む。Kは事後theta抽選数、Mは研究MC経路数、Qは積分次数、Nは追加活動回数、Hは日数範囲。CPU時間とwall時間、親RSSと成功native peak、Windows working setとLinux RSS、実測と外挿は別。ローカルNode wall/CPUをVercel ActiveCPU・Neon CUh・本番throughputへ換算しない。以下は過去の測定を索引化した値で、今回の再測定ではない。

| 測定 | 条件・指標 | 記録値 | 限界・根拠 |
| --- | --- | --- | --- |
| 旧合成DP | Node24.21.0、N120、K200/500、微小確率打切りなし | 84 / 164ms。素朴DP N400≈0.6秒、N1095≈1.5〜1.7秒。配列再利用/到達不能刈り込み後6必要回数で最大≈260ms | [元Evidence](evidence.md#dpとmonte-carloの比較)。限定入力、全域上限ではない |
| 2026-10-05単体T-14 | M5/macOS、Node24.21.0、K200/H1095、N120/400/1095、3run | 各34.4〜74.1ms | [原報告](../../experiments/architecture-verification/REAL-ENGINE-2026-10-05.md)。混合負荷のN119/399/1094とwarmup混入訂正は単体値と分離 |
| PR #119 最終predict | Node22.15.1/TS5.8.3、prior2/K200/seed20261012/H1095、各process初回+warm5、48 fresh processを方式交互で逐次 | warm中央値（3組）: n1095 TODAY_DONE32.257→5.992ms、SKIPPED31.625→6.169ms。通常n120 SKIPPED77.496→81.428ms（約5.1%遅化）。T14代表最大178.36ms | [同条件最終測定・保全](../../packages/prediction/verification/deadline-fill.md)。事前n400の約3.4%遅化も保持。CPU固定/信頼区間/startup cold/配備は未検証、保存JSONのOSはWindows 10.0.26200、CPU i7-1360P/16 logical。RAM/PC機種は未記録。全入力の高速化ではない |
| 2026-10-07単体T-14 | Windows i7-1360P/16logical/15.6GiB、Node24.21、N120/400/1095、各2run | 旧predict最大102.06/153.02・216.01/196.70・84.19/17.86ms、R11最大112.95/126.52・227.02/187.85・119.07/90.31ms | 同日の並行spikeとは別。単体PASSでも保存/Today/session並行待ちは証明しない |
| 2026-10-07候補spike | Windows x64、Node24.21.0、旧predict/公開R11、2人、CRUD20/s、Today1/4/10/s、各8秒 | 28測定scenario、チェック25PASS/1FAIL、全体exit1。旧predict inline4/s最大546.83ms FAIL。R11 inline10/s CRUD p95 5798.0/5744.8ms、session 9272.9/9019.6ms | [報告・全4run](../../experiments/architecture-verification/REAL-ENGINE-2026-10-07.md)。HTTP失敗0でも性能FAIL。worker2比較は1vCPU/公開性能の証明ではない |
| 2026-10-08再レビュー | URL/native path・diff bytes保存・FAIL集計・worker死亡回帰 | 候補14/Engine70等PASS。**性能再測定なし** | [記録](../../experiments/architecture-verification/REAL-ENGINE-2026-10-08.md)。前日のFAILは残る |
| 2026-10-09現行API | M5/macOS、Node24.21.0、合成3人、N120/400/1095と548/700/800、closed loop30秒 | Today p95 116.0/131.8/197.5ms、write p95 13.5/8.7/9.4ms。sweep N548最大84.9ms | [全表・JSON](../../experiments/api-mixed-load/REPORT-2026-10-09.md)。単コア制限なし、公開負荷ではない |
| 同open loop | CRUD20/s+Today10/s、重い入力、8秒 | server CPU時間/wall=0.96（1コア=1）、窓末未完了1件 | 同report。操作と利用者/位相の固定、短い窓、sleep無効runを記録。容量保証ではない |
| #184 harness追従 | UUID/revision追従後M5再実行、Windows隔離smoke | 保存集計HEAD5c4a05a: default/non-default各8scenario/16phase、観測write387/383、他user404各3、stale409 0/3、失敗/不一致0 | [#184](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/184)、[説明訂正 #194](https://github.com/jogi-hack-2026-team/jogi-hack-2026/issues/194)。Windowsはadapter付き機能smokeで性能採用値ではない。公開負荷/Windows無加工--importは未確認 |
| #203/#204閉形式 単体 | 所有Linux container、.5CPU/256MiB、固定30日履歴a=(14,7),b=(7,9)、N120/400/1095各6回 | 最大5.89 / 1.71 / 1.14ms、参考N548 1.17ms | [固定報告](../../experiments/completion-cdf-integration/README.md)。H1095、限定fixtureのT-14 |
| 同Today HTTP比較 | .5CPU/320MiB、同じ所有DB、baseline後candidate、各5観測 | mean/P95旧524.59/597.81 → 候補27.60/58.03ms。初回旧1580.50/候補907.41ms | 同report。n5のnearest-rank P95=最大値。全HTTP500ms未満でも一般SLOでもない |
| 同Goal GET/PATCH・Log PUT | 同5観測のmean/P95 ms | GET 637.13/839.49→48.60/138.04、PATCH 566.41/652.71→67.65/165.32、PUT 32.51/61.76→12.74/21.89 | API待ちを含む。Engine単体の倍率へ転用しない |
| 同posterior MC kernel | Node24.21、所有Docker .5CPU/256MiB、N44/H1095、A/B/C | K200代表wall .142/.090/.078秒、K800 .661/.386/.321秒、K3200 2.524/1.139/1.069秒。B K12800のみ5.194秒 | 5seedの代表値、K12800は3seed/host重複可能性。batch CPU 2.758/11.581/36.360/23.652秒、RSS79.3/84.4/88.9/80.0MiBはbatch値。HTTP/DB/FE外 |
| Gauss-Jacobi候補 | a24/b526、同posterior、固定比較 | 初回B MC91.11/GJ93.50ms、C93.17/97.62msで全case高速gate FAIL。後続paired各5回MC/GJ中央値A122.75/81.51、B96.87/90.12、C86.04/75.89ms | 後続別測定で初回FAILを上書きしない。node生成は別host/kernel外 |
| Beta-binomial kernel | 9固定case+324格子、同posterior | 最大CDF誤差5.78e-15/3.33e-16。42calls最大 .6452ms、N120/400/548/1095中央値 .1000/.2919/.2154/.1473ms | kernelのみ。full Engine T14や全入力の厳密算術ではない |
| recency読取/評価 | OULAD ZIP stream 46.7MB、10,655,280 rows、.5CPU/256MiB | extraction42.70秒/audit43.16秒。dev40 wrapper10.95/eval2.31秒(360calls,RSS69,052KiB)、holdout80 6.16/2.52秒(720calls,72,828KiB) | 抽出・wrapper・モデル一括を分ける。API応答でない |
| C1 v2 | Node24.21、同container、dev100 | predictor100 batch521.8ms | 抽出/HTTP外、development STOP |
| BOCPD | host Python filter / Node24.21 CDF、300入力 | filter wall/CPU1.652/1.625秒、単人median/p95/max5.028/6.979/14.876ms。CDF wall/CPU1.751/1.859秒、5.482/8.185/31.505ms、累積RSS84.57MiB | CDFはfilter/startup/I/O/baseline外。独立算術check5.739/5.531秒は検証時間 |
| HMM固定8 starts | Python3.12.4/NumPy1.26.4、host、J13 fit+J14-A forecast | 14.8388994秒。固定J13 N10 forecast300のみ .8643834秒 | per-start未記録。HTTP/DB/FE/同時負荷外、数値PASS≠校正 |
| fixed multi-N | 同300、N1/5/10/20/30、再fitなし | HMM1.0651824秒、Node exact #204+iid両比較器 .2889623秒、semi共有M20000×2seed64.5005165秒/RSS168,869,888B | 5target共有path。各N単独速度や全grid fitへ換算しない |
| semi-Markov NLL v1 | 300選択/286支持、全1681点×Q32/64/128、90分/256MiB | wall86.062秒、polled親RSS77,631,488B、**全grid数値HELD** | receipt `nllV1`。完走は収束成功ではない |
| NLL v2数値修復 | 同入力/全grid、Q256/512追加、モデル/目的維持 | wall319.547秒、polled親RSS80,969,728B、全域gate PASS | receipt `nllV2`。旧版と仕事量が異なり速度倍率不可 |
| fair-RPS JS局所外挿 | 合成3形状、M512/1024/2048/4096×2 seed×300への外挿 | 47.434〜58.999分、polled親RSS最大82,137,088B | receipt `nativeAndStream`。実300人runの時間ではない |
| 独立C++合成 | GCC15.1.0/Windows、M2048全grid×4形状×3seed、JSとは別RNG | 実測総wall6.484秒、peak working set6,276KiB。300人/seed外挿median2.56229分、range2.249795〜3.34866分 | 別RNG/入力。JS→native速度倍率にしない、製品native採択なし |
| 同JS poolの小stream | selected7/support6、8stage、finiteSupportedCells 484,128 / 全保存total 564,816cells（非支持NaN 80,688） | wall42.762秒、親RSS128,520,192B、native7,196KiB、保守合計135,888,896B | 同pool parity確認。合成gateもHELD、係数採択なし |
| 旧実RPS J13 | 8stage予定、M512〜4096×2 seed | 5stage+21rowsで **STOP_WORKER_RESERVE** | 固定sourceと旧STOP保全。部分順位を採択しない |
| Buffer再利用・全合成 | 300rows×8stage、2288native calls | wall1942.297秒、親RSS161,366,016B、native7,220KiB、保守合計168,759,296B | 80,688候補表parity、24,206,400cells/8means bit一致の監査記録。瞬間hard cap保証ではない |
| 同版実RPS J13 | 同M4段階×2 seed、300rows×8stage | wall1884.483秒、親RSS174,555,136B、native7,212KiB、保守合計181,940,224B。**MC_OBJECTIVE_DIFFERENCE / GAP_RUNNER HELD** | receipt `boundedJ13`。全stage完走と数値gateを分ける |
| 旧precision全合成 | M8192/16384×2 seed予定、初stage300rows | 約999.14秒後hash境界で **COMBINED_RSS HELD**、STOP親RSS308,482,048B | [GC境界](#メモリgc境界と証拠の範囲)。後続repairの成功で失敗を消さない |
| boundary repair小合成 | 7rows×4stage、旧新版8保存files | wall153.087秒、親RSS82,677,760B、native16,076KiB、合計99,139,584B | 282,408cells・means再読込とfault tests。全300人のpeak保証ではない |
| repair全合成 | 300rows×4stage、M8192/16384×2 seed、150分/256MiB | wall5917.479秒、親RSS75,730,944B、native16,076KiB、保守合計92,192,768B | 資源preflightのみ、ranking/数値gateを採択せず実fitと分離 |
| **最終実precision J13** | 300選択/286支持、同4stage、全1681点 | **wall6091.002秒（101分31秒）**、all-meter親RSS76,275,712B、成功native16,076KiB、保守合計92,737,536B | [固定gate](#最新j13の固定gateと解釈)。資源内完走、GAP_RUNNERのみHELD。条件違いから再利用版のspeedupを主張しない |

2026-10-10の別ローカル合成HEAD6754dd90a69e7f2c39afe6c219aa65ca12ab5be4ではEngine77/API213、失敗・cancel・skip0、exit0の保存回帰記録がある（receipt regression6754の元log SHA）。この文書作成時に実行したテストではなく、実merge mainのCI、速度、校正、公開HTTPS受入へ件数を転用しない。

研究fitのwall/RSS guardは実機CPU上限ではない。HMMはPython3.12.4/NumPy1.26.4のhost記録があるが、機種/CPU/RAM/OS build/BLAS threadsは未確認。NLL v1/v2はこの索引に引用したreceiptで実行Node版・実機条件を未確認として残す。bounded/precisionは固定protocolにWindows Node24.21.0と記載されるが、各runの独立runtime receipt・CPU機種/RAM/OS build/割当CPUは未確認。GCC15.1.0/Windowsの独立C++合成値もCPU固定の証拠ではない。異なるfit時間から機種差を補間した速度比を作らない。

## 公開proxy評価と校正

OULAD実評価は同一人をfold・科目・役割間で混ぜず、metadata選択→予測保存→label結合→固定比較の順。正クリック日はD、在籍中の無クリック日はS proxy、期間外はU。無クリックは未学習を意味しない。教師prevstateと推論DPの仮想stateを分け、実未来をfeatureへ渡さない。UNKNOWNをゼロ埋めせず、末尾打切りの合法T集合を残し、内部Uの後で既知活動が再出現したらSTOP。未来の退学・finite日付・到達者だけで選ばない。

| 評価 | 同supportの結果 | 校正・棄却条件 |
| --- | --- | --- |
| pooled logistic dev150 | Markov共通knownY140: loss1.976786→.952143（51.83%減）、paired差95%[-1.337545,-.729598]。iid共通146:1.986644→.921575（53.61%減）、[-1.401447,-.736635]。Brier差も負、固定研究screen PASS | 候補null P50/P80=91/117人。finite knownY被覆17/59=28.81%、15/33=45.45%。全150人mean F30=.388666、実績bounds22.67〜24.00%。実User/P80校正を支持しない |
| pooled係数再fit bootstrap | training/cal学生cluster別再抽出、B1000/seed207202611、1000成功・失敗0。固定予測loss B2000とは別 | trendとoffsetの95%区間は0を含み、trendKnownは定数。係数の寄与は日数への加法・因果説明ではない |
| CDF power confirm150 | pointY146: raw→候補 loss.894863→1.502055、Brier.144638→.220292、RPS.049918→.088308。all-null loss.695205 | finite P50/P80被覆7/68・16/46、候補meanF30=.516359対実績20〜22.67%。cal/confirmのphase・群・暦が異なり、原因を一因子へ断定しない。追加探索せず不採用 |
| H90 J13/J14各300・追加fit0 | J14 iid vs all-null loss17.07%改善、CI[-3.864947,-.174398]。Markov13.80%改善でもCI[-3.615969,.217082]で相対screen不通過 | J14 finite P80: Markov240、expanded95[19.94%,33.03%]; iid229、[20.93%,34.54%]。件数が足りても絶対screen不通過。paceは点でありP80ではない |
| 固定NLL semi-Markovの新J14 | N10/amount1/H90、300選択、候補/Markov共通available289・pointY269。RPS.156638768→.104155533、**33.5059%減**、paired差CI[-.062830699,-.042267536]。loss35.0019%減 | finite P50=239/P80=202、expanded95 P50[.285816911,.439492938]、P80[.510271178,.664139947]。要求P50全区間[.4,.6]/P80[.7,.9]内に不包含。絶対coverage不合格、製品不採択 |

restricted scoringでH+1（H30なら31、H90なら91）を用いるのはスコアのカテゴリであり、実到達日・永久未到達・表示用日付ではない。lossはP50/P80 pinball平均（暦日誤差×分位点weight）、RPSは日別CDF Brier平均、BrierHは期限内到達の二乗誤差（後二者は無次元）。科目等重みと学生単純平均、own supportとpaired common supportを混ぜない。打切り下で同じ合法Tを両モデルに与えるboundsは感度幅で、CIや独立打切り仮定ではない。

予約holdout200の活動・label・結果・予測は未評価。後の除外台帳作成では限定承認された活動/labelなし予約metadataを読んだ工程があるため、全期間を「ID/manifestも一度も読んでいない」と表現しない。used1100→1700→2000等は保全された使用台帳の段階で、評価件数を単純加算した独立試験数ではない。既使用J14年内の新person確認を「2014年全体が未見」とも呼ばない。

## 初期評価と窓候補の履歴

同じOULAD評価でも起点・集団・入力窓が異なる。次表は匿名引継ぎに保存された既存報告の要約で、今回の再解析ではない。元report SHAと集団条件はreceipt historicalEngineHandoff / initialProxyAndWindowsに記載する。

| 工程 | 固定条件と結果 | 判断・失敗 |
| --- | --- | --- |
| 初期proxy | dev20/holdout60、origin30/prefix31、N10/H30。holdout到達24/非到達36。finite P50/P80=32/26、coverage12/32=37.5%・15/26=57.7% | 完了者かつfinite23人のMAE4.26 vs pace4.52は選択された副指標。全員改善やP80保証ではない |
| recency | 未使用dev40/holdout80、origin60/prefix61、full/31/14/iid固定。dev common32/known36=88.89%<90%gate | 31日窓のpoint改善14.79%でもfullを先選択。holdout common64/known77=83.12%、loss1.69531/1.53698/1.42734/1.75391。窓不足7/14人を保持し採用なし |
| #204再評価 | 初期80+recency120の再利用200。known195/common191/withdrawal5。sampled→closed loss1.57853→1.54529、pairedCI[-.05393,-.01309] | closed finite P50/P80=101/69、coverage30.7%/43.5%で低い。closed vs iid差+.03089、CI[-.01833,.07959]でMarkov必要性未証明。新盲検ではない |
| C1 v2 | 新dev100でfull95/C1 86/iid100/C2 100 available。保持86/95=90.53%<95%。common86 C1/full/iid loss1.73605/1.83430/1.89651 | C1 vs full CI[-.31517,.10467]、vs iid[-.40640,.06051]は0を含む。support/優位性FAILでSTOP。C2増分5人は両quantile null、共通95はfull同値。holdout200のactivity/labelsは開かず |

## BOCPDとHMMの保存済み研究

BOCPDはhazard=.01/transition、Beta(2,2)、reset-before-transition、60 run lengths保持。未来changepointを生成せず現在regimeの条件付き継続である。J13 selected300/common286/point273、N10/H90。#204→BOCPD point RPS .156501→.151308（3.32%減）だがpaired差-.005193140のCI[-.011746,.001439]は0を含む。合法T幅[-.006633,-.004297]は識別幅でCIではない。全300 finite P50/P80=256/227、coverage15.62–16.80%/34.36–35.68%で絶対screen不通過。all-nullへの相対通過から採用へ進めない。

保存weightの診断は新fit/forecastなし。no-change weight平均.6356805、expected run length平均48.06065（ESSではない）、no-change多数229/300、recent<=20多数10/300。以下の小群平均は学生単純平均の記述集計で、科目等重みprimaryとは区別する。recent群のpaired RPS平均+.065727、内5人のhistorical decline群-.035137/残5人+.166590は小群観測であり、原因・因果効果の証明ではない。

HMMは2状態Bernoulli/5自由係数、科目等重みexact EM、事前固定8 starts、RNG/MCなし。8/8収束、採用start4、iteration41/51/42/51/54/56/61/61、weighted LL=-73.0584255364。literal synthetic_numerical_gate_passは許可済みJ13実fitの数値状態名で、合成データの結果や校正合格ではない。J13 300人の0..150既知系列44,458観測/44,158遷移、terminal null842、内部U restartなし。未来suffixもfitに含むため同人J13診断はin-sampleである。

| 集団 | 指標と保存結果 | 解釈 |
| --- | --- | --- |
| J14-A | 旧H90集団300を再利用、common294/point278。point RPS HMM/#204/iid/fixed-semi/null=.161700537/.177190072/.168738584/.110759447/.377575020 | HMMの同合法T差は#204[-.026185477,-.011000512]、iid[-.020215774,-.002786834]、semi[+.039481154,+.054715185]。fixed semiより悪い。新盲検ではない |
| J14-A校正 | HMM finite P50/P80=300/300。F30/60/90=.402242/.693017/.884378 vs観測合法幅[.206667,.233333]/[.506667,.55]/[.65,.706667] | coverage P50[.23,.263333]・P80[.596667,.646667]。finite100%でも校正未成立 |
| 同人J13 | F90=.886343 vs観測[.66,.703333]、coverage P50[.296667,.313333]/P80[.623333,.663333] | 過大予測はtraining同人にもある。年移転だけを原因にしない。結果後にNLL目的をRPSへ変更していない |
| 固定long-S>=30（学生単純平均の記述集計） | J13 28/J14-A26、HMM F90=.833002 vs観測[.035714,.142857]/[.038462,.192308]。J13比較common17ではHMM/#204/iid/semi F90=.833002/.427801/.284028/.179674 vs観測[.058824,.235294] | #204/semi入力不足11人を隠さない。全層一様な失敗や永久離脱識別とは言わない |

**J14-Aと旧NLL semiの新person J14-Bは各300人でroster重複0。** A common294/point278とB common289/point269の改善率を直接差し引かない。Bの33.5059%改善は後述の独立した固定確認。HMMのsource/coefficient/result SHAと匿名aggregateはreceipt hmm2に記載する。

## 固定multi-Nと保存seed

planを2026-10-10T18:07:40.264901 UTCに固定し、同J13 selected300、origin60/H90、N1/5/10/20/30。HMM再fitなし、#204/iidはexact、旧semiはdelta=-.4/lambda=.3、M20000×既存2seedを全N共有。N10は前診断の全4CDF/quantile/supportとexact match。次表は科目等重み、各N point subsetのRPSと同common286のHMM finite数を並べる。異なるNのRPS差を同一estimandの改善と呼ばない。

| N | point/partial（common286） | point RPS #204/iid/semi/HMM | HMM finite P50/P80（/286） | 観測F90合法幅 / HMM meanF90 |
| --- | --- | --- | --- | --- |
| 1 | 283/3 | .107629020/.110527003/.090243310/.117382416 | 286/286 | [.918064059,.928943689] / .999978456 |
| 5 | 278/8 | .157083289/.149120465/.111494825/.166624500 | 286/286 | [.800226757,.828557256] / .990050647 |
| 10 | 273/13 | .156501018/.150299652/.099552550/.153898363 | 286/286 | [.679195011,.724837491] / .887113360 |
| 20 | 267/19 | .121130757/.121277579/.069176726/.108233903 | 286/0 | [.458365457,.524789305] / .626896081 |
| 30 | 268/18 | .076353457/.078713419/.040599902/.065579317 | 69/0 | [.297739985,.360830499] / .379862020 |

入力不足14（DONE-origin12/SKIP-origin2）はselected300分母に残す。N30 HMM own finite P50は71/300でcommon69/286と違う。N20→30のpoint増加は合法T下限の変化（3gain/2loss）でsample差替えではない。全selected pointは297/292/287/281/282、90日既知278/terminal censor22。全N semi F90も観測上限を超え、絶対校正PASSではない。

2seed最大CDF差 .018/.0146/.0154/.01575/.01565、joint quantile一致283/286/284/286/285 of286は旧固定基準（CDF<=.03、finite差<=2、joint>=.95）を通過。後続保存second-seedの同合法T差もcontrol−semi正。ただし2seed一致は真の分布の誤差上限ではない。観測差の2倍という粗い感度でもN1/20/30の順位は未確定、N5/10も厳密保証ではない。全NのF30/60/90、RPS識別幅、各method finite数はreceipt hmm2.multiNに保持する。

## Semi-MarkovのNLLとRPSの工程

共有thetaを各pathで一度drawし、D→Dはlogistic(logit(a)+delta)、S→Dはlogistic(logit(b)+delta−lambda·min(run,30)/30)。runは未来の仮想経路で更新する。起点Beta要約を新過程の厳密posteriorと呼ばず、正の再開率のこの族で永久未達率を同定したと主張しない。以下は研究工程で、製品式の追加ではない。

固定semi-Markov gridはdelta=-4+0.1j（[-4,0]）、lambda=0.1k（[0,4]）、j/k=0..40、41×41=1681点。identity(0,0)を含む。目的差<=1e-12のtieはdelta²+lambda²の小さい順→lambda小→deltaが0に近い順。外側delta=-4又はlambda=4は境界最適としてHELD、identity側0は許容する。NLL v1/v2とRPS/precisionで範囲・tieを保持し、結果後の範囲延長・grid細分化・部分候補選択をしない。ridge0.01はNLLと日平均RPSでそれぞれの単位に固定され、同じ相対強度とは主張しない。protocol原文のSHAと公開可能な選択規則はreceipt numericalSelectionProtocolへ記載する。

| 順 | 目的・数値条件 | 判定と保持する失敗 |
| --- | --- | --- |
| NLL v1 | 全系列の周辺log尤度→各人prefix長Cで割る→科目等重み→ridge.01。全1681点、Q32/64/128 | 学生候補mean NLL最大差 .23409368/.03475270、全grid目的差 .00348886/.00012642で **HELD**。最小/次点が同じでも全域gateを無視しない |
| NLL v2 | 同じ入力・モデル・全grid。Q256/512、独立logit適応積分・tail上界 | 128→256/256→512の学生候補最大差2.330553921e-6/1.243449788e-14、目的差7.121579992e-9/4.440892099e-16でPASS。全grid1024は未実施。固定delta=-.4/lambda=.3で上記新J14一回確認へ進んだ |
| NLL候補残差 | 既使用J13/J14、同delta/lambda0のJ13補助対照 | J13でもF30過大とcoverage不足。J14 shiftだけを原因とせず、NLLとgoal scoreの目的差は次の仮説。lambda0へ遡及採択しない |
| goal fair-RPS初回 | 同じJ13・支持・全grid、同合法TのfairUpper＋.01(delta²+lambda²)、M512/1024/2048/4096×2 seed、90分 | 旧実runはworker reserve STOP。Buffer再利用版は全8stage完走してもMC_OBJECTIVE_DIFFERENCE/GAP_RUNNER **HELD**。max seed差.000599476892>.0005 |
| 別precision protocol | 同2seed、M8192/16384×2、150分、256MiB/66MiB reserve維持、32768へ自動延長なし | 旧full syntheticはhash境界RSS STOP。修復小合成→全合成資源preflight→承認された実J13一回の順。最後の判定は下記HELD |

## 最新J13の固定gateと解釈

source `ed1e2bd6439058fd53a5ccf5b4f5054a08e3d6f6`、300選択/286支持（6科目50/45/48/49/49/45）、N10/H90、M8192/16384×seed207202690/207202691、全1681候補。全4meansの独立集計順位再計算と保存gate再評価を行った。best index1354（delta=-.7,lambda=.1）、runner1353（-.7,0）、identity1640。数値上の最良点の記述であり、採択係数ではない。

| 固定条件 | 最終値 | 判定 |
| --- | --- | --- |
| 全候補M差max<=.0005 | .00017307420892220815 | PASS |
| 最上位Mのseed差max<=.0005 | .00016505881393369393 | PASS |
| best/runner全4表・最上位M平均の一致、外側境界なし | 1354/1353、一致・内点 | PASS |
| identity gap > max(1e-6,10R) | .06702429134162997 > .0026806828104548874 | PASS |
| runner gap > max(1e-6,10R) | **.00009023730421034437 <= .0002052883236235148** | **FAIL → GAP_RUNNER HELD** |

runnerのR=.00002052883236235148は、共通bestとrunnerのobjective差g(M,seed)の4表におけるrangeである。全候補の最大収束差ではない。4gapはすべて正で順位反転はないが、10×rangeの固定ruleを満たさない。4表はnested Mの2 streamsで、独立4反復ではない。このruleは数値分離heuristicで、confidence level・coverage・false-selection保証を持つ検定ではない。

HELDは「固定ruleで係数選択に進めない」という判断で、予測利益ゼロや数学的識別不能を証明しない。J13上の未罰則fairUpperはidentityより約.0720243小さく、同じlegalTでのmodule等重みfair差upperも約−.0647133だが、再利用したcal集団上の条件付きMC推定である。個人改善・未知集団への一般化・P80被覆の改善とはしない。lambda0の恣意的採択、閾値緩和、追加M/seedでの救済、遡及PASSはしていない。

## 数理と数値の境界

- g50はSKIP後の再開待ち中央値。共通theta・設定量・再開後の共通経路ならT_skip=T_done+Gだが、混合後の周辺T_doneとGは一般に依存する。完了P50同士の差や今日の因果効果ではない。[現契約](../architecture.md#手順)と[合成限定の比較訂正](decision-log.md)へ戻る。
- Beta-Geometricのlgamma/exp境界で722件中15件の1日ずれを再現し、整数比へ変更。微小確率打切りではP50=3日を5日にした例を保持。[Evidence](evidence.md#分位点の境界pr-86レビュー対応)。丸め誤差・有限sampling・モデルの誤指定は別に残る。
- fixed outcome・固定CDFに対するiid path、M>1を前提とする。各日のBrier項の期待biasはF_d(1−F_d)/M、ordinary−fair補正はFhat_d(1−Fhat_d)/(M−1)。**H日平均RPS**ではそれぞれ(1/H)Σ_d F_d(1−F_d)/M、(1/H)Σ_d Fhat_d(1−Fhat_d)/(M−1)となる。candidate間CRNを共用しpath内thetaは固定。fairでも候補選択bias・legalT最大化bias・有限MC順位誤差は消えない。
- 打切りでown下限・モデル差の極値は内部日になり得る。全合法Tの日別直接式とO(H)走査を最大1.7763568394e-15で照合。J13/J14 own下限を両端だけで落とす4/8件、候補−iid差上限を落とす2/4件を保存。旧比較は既に全日走査しており、旧gateを数値修正したものではない。
- CDF質量/shape補正は一般CDFで目標順序を逆転する反例がある。共通単調写像gは順序を保つが、一般にg(pF1+(1−p)F0)≠p g(F1)+(1−p)g(F0)。生成過程の混合との整合は別。端点を固定する連続gで永久未到達massを新設できない。
- 閉形式の正整数域、厳密閾値比較、sampling fallback、finite work guard、公開requested configと内部actualの区別は[実装報告](../../experiments/completion-cdf-integration/README.md)に集約する。sourceの数値精度と実データ校正を混同しない。

## メモリ・GC境界と証拠の範囲

旧precision full syntheticの最初の300-row stage後、hash境界の約462msで親RSS51,490,816→308,408,320B、STOP時308,482,048B、GC通知0→20,691となった。旧meterは定数サイズ集計で、恒久的event配列保持ではない。長い同期loop中の通知遅延とhash allocationが寄与するというtrace・小再現・[固定Node source](https://github.com/nodejs/node/blob/v24.21.0/src/node_perf.cc) / [JS配送](https://github.com/nodejs/node/blob/v24.21.0/lib/internal/perf/observe.js)の根拠があるが、RSS増分の全原因をGCと断定しない。

repairはrowの計算・保存・reader close後に2回の実event-loop yield、64KiB再利用hash buffer、hash/finish中のRSS/wall/abort guard、定数サイズGC集計を加えた。RNG/score計算途中へyieldを入れず、forced GC・監視無効化・上限拡大なし。旧36 sourceをbyte保全し、専用7filesを追加した。小合成64反復ではrow yieldとの組合せがbaselineより高いpeakを示した条件もあり、「yieldだけでpeakを改善した」とは書かない。

最終実runのreceiptは1200rows、12,103,200cells（finite11,538,384/unsupported NaN564,816）、4means module等重みbit一致、sameT identity差0、1144pool/reserve一致、8,535trace＋36post-traceを報告する。匿名meansとgateは独立レビューで直接再計算済み。全個人score/pool/traceは匿名公開物に含まれず、全cells・元入力・完全traceの検証は作業担当のreceiptとして区別する。

canonical親peakは **all-meter** 側。通常guard maxとの一般的一致保証はなく、最終実runでは差0だった。親all-meter最大+成功native最大は92,737,536B、親最大+66MiB reserveは145,481,728B。監視点と成功native peakによる保守合計であり、OSが常時combined RSSをhard capした証明ではない。native異常終了時の瞬間peak、nativeを含む総CPUは未確認。旧Linux STOP_NATIVE 15の原因は未確定で、Windows完走から解決済みとしない。hash closeSync自体がthrowするedge caseのbusy flagは将来のI/O hardening論点として残る。

## データ出典・適合性の調査

以下の外部出典と製品適合の推論を分ける。許諾や配布内容の確認日は2026-10-11。追加データ候補は調査のみで未fit。即時に実用途へ完全適合する公開データは未確認。

| データ | 公式/原著の確認入口 | 出典事実と残る適合判断 |
| --- | --- | --- |
| OULAD | [公式辞書・許諾](https://research.stem.open.ac.uk/ouanalyse/open-dataset-more/)、[原著2017](https://doi.org/10.1038/sdata.2017.171) | CC BY4.0。sum_clickはVLE操作回数。無操作を未学習、クリックを学習分数へ変換しない。開始月/相対日・退学/欠測・課題phase・対象集団差を固定protocolで扱う |
| PMData | [現行配布ページ](https://datasets.simula.no/pmdata/)、[2020原著](https://doi.org/10.1145/3339825.3394926) | 10/11監査では現行ページCC BY4.0、原著CC BY-NC4.0。採用配布版・取得日・同梱許諾を固定するまで単一条件と断定しない。既存EB実験の件数/精度/速度receiptは補完待ち |
| HabitWalk | [OSF](https://osf.io/58pbr/)、[README](https://osf.io/sryca)、[解析](https://osf.io/356h4)、[原著](https://pmc.ncbi.nlm.nih.gov/articles/PMC11635918/) | CC BY4.0、7+105日、40開始/24解析、秒数/歩数/日記。CSV同一session重複、無記録0、500歩未満nonwear、ema.cbr.*回答コード不足が適合阻害。真の非実施を勝手に作らない |
| StudentLife | [48人10週の原著](https://studentlife.cs.dartmouth.edu/studentlife.pdf)、[15h観測基準の報告](https://studentlife.cs.dartmouth.edu/pattern_behav_chg.pdf) | 有効平均44.91日。配布dataset.htmlの502/timeout、データ許諾未確認。R packageのGPLをデータ許諾へ流用しない |
| MIPACT | [Bath配布](https://researchdata.bath.ac.uk/1416/)、[原著](https://pmc.ncbi.nlm.nih.gov/articles/PMC12220009/) | CC BY4.0、80人91日。欠測を基礎代謝で補完し座位集計、公開wear/missing flagなし。真の非実施の正解には不適 |

## 文献調査のみの候補

全行が未実装・未fit・速度未計測。論文の保証をFuture ROIや個人P80へ自動移植しない。

| 候補・一次資料 | 文献の支持範囲 | 製品向けの未検証推論・停止条件 |
| --- | --- | --- |
| [Conformal survival](https://academic.oup.com/jrsssb/article/85/1/24/7008653) | Pr(T>=L)の下限保証、交換可能性/打切り条件 | P80上限と逆方向。個人保証へ転用しない |
| [CSD](https://proceedings.mlr.press/v235/qi24a.html) / [CSD-iPOT v3](https://arxiv.org/html/2410.20579v3) | 分位校正、打切り補完。iPOTの条件付き校正はbase一致性・滑らかさ等の漸近保証 | 分位交差・末尾外挿・離散/未到達/季節差・誤指定を自動修復しない |
| [共通単調CDF写像](https://proceedings.mlr.press/v80/kuleshov18a.html) / [isotonic survival preprint](https://arxiv.org/html/2605.16571v1) | 校正用写像、後者は2026 preprint | 混合と写像の非可換、有限Hと永久未到達を別評価。未検証候補 |
| 選択的P80表示：[選択的校正](https://arxiv.org/abs/2110.01052)、[選択後予測](https://arxiv.org/html/2403.03868v3) | 選択を伴う評価の検討 | 同Engineの数値を変えず起点履歴/休止/安定性/finiteH条件を一組先固定する提案。選択群coverageと全適格者中表示率、unknown/外部移動/人数不足を同時評価。today比較の因果保証なし |
| [covariate-shift conformal](https://papers.neurips.cc/paper_files/paper/2019/file/8fb21ee7a2207526da55a679f0332de2-Paper.pdf) / [adaptive conformal](https://papers.neurips.cc/paper_files/paper/2021/hash/0d441de75945e5acbc865406fc9a2559-Abstract.html) | 前者は条件付き分布固定、後者は長期coverage | 今の個人P80ではない。遅延・打切り・phase変化は追加課題 |

## 根拠の保存先と再現範囲

公開済み実験は表のrepo内README/report/JSONまたは固定commitを使う。過去のraw・FAIL・修正理由は削除していない。文書間で同じ結果の正本を増やさず、表は条件・要点と入口だけを持つ。

匿名引継ぎZIPは148,822B/27members、SHA256 c8496662add8c30d902ee58924a611ea67e8dda418094002ea704542cca2ece5。内部の全SHA一覧とコピーされた15 aggregateのbyte/SHAを照合した。元reportがZIPにない場合は引継ぎ要約＋元report SHAによる来歴であり、元report本文の独立照合済みとはしない。

未公開研究の匿名数値は [2026-10-11 receipt](experiment-receipt-2026-10-11.json) を参照する。元artifact名、source/freeze/result/匿名bundle SHA256、分母・gate・資源値を保持する。原データ・人物token・個人履歴/label/forecast・絶対ローカルパス・Secret・private Library URLは載せない。元の保全bundleは管理者が許可範囲内で照合する。SHA一致は来歴識別であり、読者が非公開入力から再現できる保証ではない。

再確認はまず保存済み匿名集計の分母・目的・gateを再計算し、原receiptとのSHA/値を照合する。元sourceで再実験する場合は、その工程の固定protocol・入力許可・runtime/compiler/native hash・resource budgetを別途確認する。本文を実データ再fit/公開負荷/holdout開封の許可として使わない。

## 不足証拠と次の判断

1. PMData EBの別担当receipt、条件・速度・採否の照合が残る。BOCPD/HMM/初期評価は受領した匿名引継ぎを照合済み。係数gridをモデル数へ足して見かけ上の件数を増やさない。
2. 本文の研究source群は未pushで、匿名集計/receipt以外の公開再現パッケージは未整備。必要なら別に公開範囲・許諾・raw除外・再現条件を決める。匿名ZIPだけでは元実fitを再現できない。
3. Buffer/GC/native修正の同条件wall比較、異常native peak、旧Linux STOP_NATIVE原因、全入力域、長時間/公開負荷、provider CPU/実利用量は未確認。ローカル成功から無料保証や公開性能を作らない。
4. 最新RPSの次工程は未宣言。固定best/runner/identityを未使用集団で比較するならprimary contrast、実用差、support/重み、打切り、paired score、区間/多重性、MC精度、人数/停止規則を先固定する。同J13へのfresh streams追加は条件付き数値差の確認で一般化ではない。提案のみ。
5. 実Userの観測・努力量・Goal到達、P80表示対象、校正と表示率、人間の理解・行動効果は未証明。holdout再調整、人物漏洩、unknownの除外、別legalTでの差、人数不足の成功扱いを禁止し、判断不能を残す。

実験群の配置と保持区分をREADMEから本書へ集約する。以下の表を配置区分の正本とし、採択や精度の判断は既存の本文・正式仕様と区別する。
<!-- readme-experiments:start -->
## 比較実験の保存範囲

`experiments` は製品runtimeと分け、現在使う検証と過去の比較を次のように扱います。比較実験の保存範囲はこの表を正本とします。過去の成功・失敗・採択理由を現在の製品受入へ読み替えません。

| 実験群 | 配置と用途 |
| --- | --- |
| [question-prior-engine-candidate](../../experiments/question-prior-engine-candidate/README.md)、[question-prior-contract](../../experiments/question-prior-contract/README.md) | 現CIの独立数値オラクル・凍結fixtureを使うため保持 |
| [api-mixed-load](../../experiments/api-mixed-load/README.md) | 実EngineとAPIの能動的な再測定に使うため保持 |
| [session-milestone-oracle](../../experiments/session-milestone-oracle/README.md) | #248の有界1係数fitを直接確率の70桁Decimalで照合する。履歴や本試験群は生成しない |
| [variable-amount-forecast](../../experiments/variable-amount-forecast/README.md) | #352。設定量・実量分布・曜日を学ぶ回帰を合成日誌の到達日分布で比較する。再現コマンドと公開学習日誌の適合調査を収録 |
| question-prior-proposal | [固定commitのtree](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/experiments/question-prior-proposal)へ。historical・reproduced・provenance・rawを一式で保持し、tracked 57件を作業ツリーから外す |
| prediction-model-validation | [固定commitのtree](https://github.com/jogi-hack-2026-team/jogi-hack-2026/tree/77c71a5f248a4dce4ce9fb8af6619b41541be9d8/experiments/prediction-model-validation)へ。旧モデル比較・失敗と修正の根拠を一式で保持し、tracked 22件を作業ツリーから外す |
| question-prior-ui-candidate、architecture-verification | 旧候補UI専用workflowに実行依存があるため今回保持。workflowと必要チェックの確認を含む整理を別途判断する |
<!-- readme-experiments:end -->
