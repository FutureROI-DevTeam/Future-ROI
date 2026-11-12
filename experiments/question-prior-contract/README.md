# D-26 共通固定例の提案資料

**Supporting Artifact / Not a Source of Truth / 未採択**

[契約提案](../../docs/prediction/question-prior-contract-proposal.md)の計算・入力不正・保存／UI状態を同じIDで確認する資料。実Engine／HTTP／DB／UIの受入テストではない。

- [common-fixtures.json](common-fixtures.json)：計算18例、不正入力4例、保存／UI状態10例。
- [一覧](fixture-summary.md)と[数式確認結果](validation.json)。
- [build-fixtures.py](build-fixtures.py)：標準ライブラリFractionでBeta-Geometricの分位点と隣接ログを独立計算する。

Python 3がある環境で、リポジトリrootから実行する。PythonはこのSupporting資料の再現用で、製品runtimeの採択ではない。

```powershell
python experiments/question-prior-contract/build-fixtures.py
python -B -m unittest discover -s experiments/question-prior-contract -p test_golden_inputs.py -v
```

成功時は計算18／入力不正4／保存・UI10、independent_math_checkのPASSを表示し、このディレクトリのJSONと一覧を再生成する。失敗時は非0で終了する。Secret・DB・ネットワーク・外部packageは不要。

[Python回帰](test_golden_inputs.py)は一時ディレクトリで生成コードを読み込み、掲載18例の不変と、posterior／必要回数／開始状態／samples／seed／horizonの各変更拒否を7件で確認する。テストから掲載ファイルを書き換えない。

Pythonの再現確認はこの資料の数式整合と凍結値の読取り。非自明な完了DP9件は下記のNode再現へ分ける。revision・409・partial answer gate・DTOは未採択。質問値の校正・予測精度・UI理解は未検証。

FEレビュー5416592203で、I01の再送requestをexpectedRevision=6へ訂正した。6で送信→回答保存で7→ログ更新で8の後も、再送は元の6を保持する。I01〜I03は元のGoal revision案の仕様例で、HTTP実行済みではない。[契約提案の比較](../../docs/prediction/question-prior-contract-proposal.md#6-revisionと再送)にはLWWと回答専用revisionも残し、採択後に固定例を合わせる。計算18例・完了DP9件の凍結値はこの修正で変えない。

BEレビュー5417166527への文書対応では、C案の最小構成を回答用tokenのみ＋FEの取得世代管理へ整理し、state revisionと別appliedRevisionを必須にしない。recordStartDateの#74／#76先行、同時PATCHのtransaction、内部mappingと最小公開block、常時adapter案・エラー判断先を[提案本文](../../docs/prediction/question-prior-contract-proposal.md#5-保存訂正の最小案)へ集約した。いずれも未採択。I01〜I03はA案の比較履歴として保持し、C案やHTTPの実テストへ読み替えない。この文書修正では固定例・生成コード・数値goldenを変更しない。

固定例のconfigは現行Engineからの計算用参照値です。質問回答の初期BetaはmappingCandidateと各例のposteriorへ反映しており、config.prior=2を回答済み側の実際のpriorとして扱いません。新しい質問modeのmodelVersionや公開型を採択する資料ではありません。

## 完了DPの追加Evidence

[completion-goldens.json](completion-goldens.json)はPR118元HEAD `c3bd5ef`の18例から得た、非自明9件の完了日数・事後分布・draw hash・CDF境界を凍結したもの。[verify-completion.mjs](verify-completion.mjs)はmainの観測処理・sampler／DPを使い、PR119のprior候補ファイルを取り込まずに再現できる。[completion-replay-results.json](completion-replay-results.json)に実行結果を保存した。

2026-10-06、golden再利用の入力照合を追加した。生成側は計算したposterior・必要回数・開始状態とconfigのsamples／seed／horizonを凍結値へ照合する。Node側も実fixtureのraw回答・mapping・観測・実量・今日の状態から条件を導出し、全9件の照合後にsampler／DPを呼ぶ。F06を初期量75＋今日SKIPPEDへ変えるとposteriorと必要回数2が同じでも開始状態が異なるため、旧4／5日を再利用しない。掲載中の18例・9golden・モデル設定は変更していない。

Node 22.15.1／Windows x64、TypeScript 5.8.3で再現を確認。コンパイラは既に導入したものを指定し、自動installしない。下の`$d26Compiler`を実在するTypeScript 5.8.3の`bin/tsc`へ置き換え、リポジトリrootから実行する（パス部分は置換が必要な例）。

```powershell
$d26Compiler = '<導入済みTypeScript 5.8.3のbin/tscのパス>'
node $d26Compiler --project packages/prediction/tsconfig.json
node experiments/question-prior-contract/verify-completion.mjs
node --test experiments/question-prior-contract/completion-oracle.test.mjs
```

コンパイラ呼出しで既存sourceからignoredなdistを生成する。再現スクリプトは共有RNGの全200drawのhashを確認し、9件のP50／P80、H=1095全日のDP／独立CDF一致、刈り込みあり／なしを確認して結果JSONを更新する。Nodeテストは従来の独立CDF・9件の固定値・0／H超と旧入口履歴の3件に、入力キー6項目の変更拒否と古い今日metadataの拒否を加えた10件。失敗は非0で終了する。別runtimeのdraw hash不一致を、対応済み／同一goldenとは扱わない。

draw hashは200drawのbit一致を求める凍結条件で、確認済み環境は上記のWindows x64／Node22.15.1。[BEレビュー5424570351](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/118#pullrequestreview-5424570351)では、Apple M5／macOS arm64のNode24.21.0と25.8.2でhash不一致を報告している。レビュアーが調査用にhash確認を外した比較では、9件すべてのhashが異なる一方、9件すべてのP50／P80は一致した。これは整数日数の一致とdrawのbit再現を分ける報告であり、他環境の互換性保証ではない。OS／CPU／Nodeのどれが原因かは切り分けられておらず、本資料側でmacOSの再実測もしていない。hash検査・凍結値・許容誤差は維持する。

[専用CI](../../.github/workflows/question-prior-contract.yml)はWindows／Node22.23.5でPython回帰・生成不変・既存sourceのcompile・Node回帰を実行する。上記Node22.15.1の測定は過去のEvidenceとして保持し、修正版Nodeでも凍結値・hashの検査を緩めない。T-14や性能ベンチ、API／DB／UI試験は実行しない。runtimeの採択や一般環境の互換性保証ではない。

`packages/prediction/**`をCIの対象pathへ含めるのは、Engineの観測処理・sampler・DP等の変更が固定Evidenceへ与える差分を検知するため。失敗時は入力・計算・実行環境を確認し、意図した変更ならEvidenceの更新要否をレビューする。赤いcheckだけで製品の数値誤りや変更の採否を確定しない。`windows-latest`はWindows imageの版を固定していないため、全imageでのbit一致も保証しない。本追記でworkflowのpathやrequired check設定は変更しない。

F03=3／6日、F07=3／11日、F14=2／2日。最大CDF差は約5.6e-16。独立なのは条件付き分布の計算法で、RNG／Beta samplerは共有する。参照CDF許容誤差1e-11はProductionの分位点epsilon1e-12と別で、後者は変更しない。校正・予測精度、別runtimeやT-14全条件を保証しない。

元のnumeric-snapshot候補＋実験adapterでは18例の観測・実績・事後・中心等を照合した。この元比較の材料gate13件・N04 RangeErrorは旧numeric入口の履歴としてJSONに残す。新しい内部adapterは[PR119](https://github.com/jogi-hack-2026-team/jogi-hack-2026/pull/119) HEAD `32a76cfefc193d7ddb82c74a764588a8cd04848e`で公開済み。[候補説明](https://github.com/jogi-hack-2026-team/jogi-hack-2026/blob/32a76cfefc193d7ddb82c74a764588a8cd04848e/packages/prediction/QUESTION_PRIOR_ADAPTER_CANDIDATE.md)のraw回答・保存済みmapping・a／b別出所とgateの接続で13件を解消した。18例・完了DP9件は元の値に一致し、不正mapping形状はPredictionConfigError／INVALID_INTEGER／mapping配下のpathへ分類された。[Node 22／24 CI](https://github.com/jogi-hack-2026-team/jogi-hack-2026/actions/runs/37323944883)各61＋独立CDF3件と型検査、[Docker CI](https://github.com/jogi-hack-2026-team/jogi-hack-2026/actions/runs/37323944974)61件、[Foundation CI](https://github.com/jogi-hack-2026-team/jogi-hack-2026/actions/runs/37323945326)の成功を同HEADの実ログで確認した。候補側CIの結果で、本PRで61件を実行したとは数えない。

PR119は未統合でFE／BEへレビュー依頼済み。公開`predict`の既存契約を維持し、API／DB／UIへの正式接続は未完了。この再現スクリプトも新adapterを呼ばず、公開済みの数学部品だけを検証する。保存context／revision、出所・version・errorの正式公開契約、保存／HTTP／UIの10統合例・409・Goal作成再送は接続前。具体契約・本番配線は未採択。
