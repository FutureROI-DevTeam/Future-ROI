# #331 旧比較履歴と現行UI検証依存の選択肢

固定main SHA: `7beba614697ecc3098cde122e2f0305842962812`

**Supporting Artifact / Not a Source of Truth.** 採択・仕様変更を行わない比較資料。

Refs #331

## 事実：版と証拠の境界

本書は提供された固定mainのソース、lockの版抽出、Issueコメントに基づく。lock全体の依存解析、コマンド実行、CI確認は行っていない。

| 対象 | manifestの指定 | lock抽出版 | 意味 |
| --- | --- | --- | --- |
| [親環境](../../experiments/architecture-verification/package.json) | Better Auth 1.7.7、React/DOM ^19.0.0、Vite 8.3.4、TypeScript ^5.9.0 | Better Auth 1.7.7、React/DOM 19.3.0、Vite 8.3.4、TypeScript 5.9.3 | 現在の再実行用 |
| [隔離候補](../../experiments/architecture-verification/candidate-1.7.7/package.json) | Better Auth 1.7.15、React/DOM ^19.0.0、Vite 8.3.4、TypeScript ^5.9.0 | Better Auth 1.7.15、React/DOM 19.3.0、Vite 8.3.4、TypeScript 5.9.3 | ディレクトリ名は現在の認証版を表さない |
| [製品API](../../apps/api/package.json)／[root lock](../../package-lock.json) | Better Auth 1.7.16、TypeScript 5.9.3 | Better Auth 1.7.16、TypeScript 5.9.3、React/DOM 19.3.0、Vite 8.3.3 | 旧実験とは別の依存経路 |

両実験manifestのRouterは1.170.40、両実験lockとroot lockのRouterは1.170.40、Serovalは1.7.7。型パッケージは両実験で `@types/react` / `@types/react-dom` が ^19.0.0だが、提供されたlock抽出にはその実版がないため断定しない。

[README](../../experiments/architecture-verification/README.md)が説明する過去の比較はBetter Auth **1.7.6対1.7.7**。上表の現行依存による実行を、その比較の再現や過去結果の再検証とは扱わない。既存の報告・raw JSONは変更しない。README記載の再実行は `results/*.json` を上書きするため、再測定する場合も履歴とは別の作業木・出力先が必要となる。

### immutable参照の使い分け

- 認証更新前の依存参照：`160c0f81f8e178ae5d405440764b064a5482f0fc` の[親lock](https://github.com/FutureROI-DevTeam/Future-ROI/blob/160c0f81f8e178ae5d405440764b064a5482f0fc/experiments/architecture-verification/package-lock.json)／[候補lock](https://github.com/FutureROI-DevTeam/Future-ROI/blob/160c0f81f8e178ae5d405440764b064a5482f0fc/experiments/architecture-verification/candidate-1.7.7/package-lock.json)。
- glob更新前の依存参照：`8ab6d89a6c1bdfe3e904b8666ae20f2ae0c2fdf0` の[実験ツリー](https://github.com/FutureROI-DevTeam/Future-ROI/tree/8ab6d89a6c1bdfe3e904b8666ae20f2ae0c2fdf0/experiments/architecture-verification)。これは元の認証比較版とは異なる。
- 測定の再現には各報告が指定するcommitとlockを組み合わせる。上記更新前参照だけで、全報告の測定条件が再現できるとは判断しない。

### Alertの時点

Issue本文の旧認証4件（#55/#53/#49/#51）の記述は発端の履歴。提供された最新コメント（2026-11-03）は、これらがOpen一覧から解消し、当時残っていたのはglob/minimatchの6件と報告している。旧認証4件を現在の未解決残件として数えない。現在のalert状態は未確認であり、glob側についても現在の未解決件数とは断定しない。

## 事実：UI CIの供給経路

[workflow](../../.github/workflows/question-prior-ui-candidate.yml) → [check.mjs](../../experiments/question-prior-ui-candidate/scripts/check.mjs) → [runtime.mjs](../../experiments/question-prior-ui-candidate/scripts/runtime.mjs) の経路は次のとおり。

| 段階 | 実際の供給元・処理 |
| --- | --- |
| ホスト | setup-nodeで24.22.3。実験manifestのNode 24.21.0固定とは別 |
| compilerのインストール | root lockがあればrootでnpm ci、なければ `packages/prediction` でnpm ci。いずれもdevを含めscriptsを無効化 |
| React系のインストール | 続いて `experiments/architecture-verification` でnpm ci。隔離候補の依存は利用しない |
| runtime.dependencies | `experiments/architecture-verification/node_modules` |
| React / React DOM | 同ディレクトリを起点とするcreateRequire。SSRはNODE_PATH、Vite buildはaliasも同じ供給元を使用 |
| Vite | 同ディレクトリのViteを解決して動的import。root lockの8.3.3ではなく実験lockの8.3.4が供給対象 |
| React型 | 同ディレクトリの `@types` をtypeRoots、React/JSX/DOM clientをpathsに指定 |
| TypeScript compiler | `packages/prediction/node_modules/typescript/bin/tsc` が存在すれば優先、なければrootの同パス。[prediction manifest](../../packages/prediction/package.json)とroot lockの版は5.9.3。親実験のcompilerを選ぶ実装ではない |
| check | CommonJS型検査・SSRテスト、ESNext型検査、隔離preview build。実験のauth/API/serverは起動しない |

[check-connection.mjs](../../experiments/question-prior-ui-candidate/scripts/check-connection.mjs)も同じruntimeのcompilerと型供給元を使う。workflowはEngine `f7a6c02ec402d3c74fae953cac769de06b31050b` とfixture側 `b7400757f1ee7c7beeb37640f7ad9582d770b121` を別checkoutする。scriptはEngine HEADとclean状態、fixtureのLF正規化SHA-256 `ba7820aeee75d6c2e02fa8c3510fc63c9cef2a524918c5e6077abd6921b4ac47`、18ケースを要求する。接続検証は別Engineを使うが、compilerの供給元は変わらない。生成物はUI側 `.qa`、接続reportは14日保持のartifactであり、永続的な履歴参照の代替ではない。

実験全体をインストールすることと、その認証コードをUI検証で実行することは別である。root lock変更のみはこのworkflowのpathsに含まれず、compiler供給への影響と起動条件には差がある。本書だけのdocs-only変更でもUI Candidate workflowは自動起動しない（workflow_dispatchは別）。

## 代替案：未採択の具体比較

以下は変更候補であって、本書による実装許可・採択ではない。すべての案で旧報告・raw JSONの内容、測定条件の表示、製品依存、Engine/fixture固定参照を不変とする。

| 案 | 具体的な変更pathと不変条件 | 利点 | 費用・制約 |
| --- | --- | --- | --- |
| A：immutable履歴保全＋UI依存分離 | UI候補直下に専用 `package.json` / `package-lock.json` を新設する候補。React/DOM、Vite、React型、TypeScriptを明示管理し、`scripts/runtime.mjs` のdependencies・compilerを専用先へ変更。`scripts/check.mjs` / `scripts/check-connection.mjs` の供給前提とREADMEを同期。workflowのinstallとpathsを専用lockへ切替。親READMEに固定Git参照と履歴再実行の境界を残す | UIのために旧認証環境をインストールする結合を除ける。履歴は固定commitで参照可能 | manifest/lock保守が増える。親・候補の現行manifest/lockを残すか除去するかは別判断。最小形では残し、旧環境の削除・移動は含めない |
| B：現状維持 | 実行path・manifest・lock・workflowは変更なし。本書と親READMEの説明同期に限定 | 動作経路を変えず、既存手順を維持できる | UI CIが実験全体の依存に結合し続ける。認証更新がUI CIを起動する構造とcompilerの二経路が残る |
| C：現行再実行環境を更新 | 親と `candidate-1.7.7` の `package.json` / `package-lock.json` を、別途レビューした版へ更新。親READMEに新しい条件と旧commitでの再現手順を記載。UI依存経路は維持 | 現行再実行用環境を継続保守できる | 対象版は本書では選ばない。認証互換性とUIへの波及を別々に確認する費用。更新後の結果は過去比較の再現ではない |

Aの履歴保全は固定commitへのリンクを用い、移動するbranch/tag名だけに依存しない。現行ツリーから実行資材を除去する拡張を選ぶ場合は、親・候補のmanifest/lock、`src`、`verify`、`web` 等の参照と利用者を追加調査し、除去対象を個別合意する必要がある。報告・raw JSONを改変する案ではない。AとCの併用も可能だが、その場合も独立した変更範囲として扱う。

### 案ごとの検証条件とrollback（いずれも未実施）

| 案 | 必要な検証・観察 | rollback |
| --- | --- | --- |
| A | clean installで専用lockから供給される実版を記録。型・SSR・previewと固定Engine接続検証を実行し、親node_modulesなしでも成立することを確認。workflowのpaths、固定参照、artifact、履歴リンクの到達性と旧資料の無差分を確認 | 専用manifest/lock・runtime・workflow・説明の変更を一組でrevertし、親依存経路へ戻す。旧資料は復元操作不要のまま保持 |
| B | 現行CIの実版出力と供給経路、固定履歴リンクを確認。alert状態は別途実画面/APIで観察 | 文書変更のみrevert。依存や実行経路に変更なし |
| C | 両環境で型・認証DB・rate-limit・混合負荷・web build・single-process等、対象scriptの適用範囲を確認。UIの型・SSR・build・接続検証も確認。新結果は別出力として条件を記録 | 両manifest/lockと説明を同じ変更単位でrevert。新測定と旧資料を混ぜない |

履歴checkoutの旧依存は、現在安全であることを意味しない。旧比較再実行の隔離条件や実行可否は人のレビュー対象とし、単に旧commitへ戻すだけで再現成功とはしない。

## 未検証の判断と最小判断点

Aは結合削減に有用と考えられるが、専用lockでの同等性・保守費用は未検証。Cの更新先・互換性も未評価。Issueコメントにある方向性を本書の採択根拠にはしない。

人が選ぶ最小点は、(1) UI依存分離を行うか現状維持か、(2) 旧実験の現行再実行資材を残すか固定履歴参照だけにするか、(3) 現行再実行環境の更新を別途行うか、の三点。選択後に対象path・検証責任・rollback単位を明示した別の変更として扱う。

依存分離、履歴の移動・削除、旧比較再現、更新後再測定、採択、人の判断は本書では未実施。テスト・文書検証・CIを実行した、または成功したとは報告しない。Issue close、alert dismiss、製品・CI・harness・依存の変更、merge/deployも行わない。
