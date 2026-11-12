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

事前独立診断 PF-01〜PF-06 は上記境界を指摘。現時点では失敗仮説で、実装結果は追記する。

## 環境・比較

- GitHub MCPでIssue #340を作成。元checkoutはPR #339の別作業で変更せず、専用worktree/branchを作成。
- Open backlog 33件を確認。#337は専用作業あり、#336は未採択、#244/#261/#291などは判断・実利用者受入が残る。Open/Readyだけを許可とせず、実証はfixtureとする。
- Notion [改訂v3の13〜19節](https://app.notion.com/p/416905b91c7b8119a595cd6745658add)を参照。設計案として扱う。
- AW CLI未導入、Codex CLI 0.151.0はChatGPT認証。[v0.93.5のCodex資料](https://github.com/github/gh-aw/blob/v0.93.5/docs/src/content/docs/reference/engines/codex.md)は購読認証非対応。固定版のcompile/lock生成・認証・利用枠を検証できていないためAWは使わない。
- 将来AW比較時は `continue-on-error: false`、`protected-files: blocked`、task別 `allowed-files` を明記し、固定compilerの生成lockと実拒否を再検証する。設定例だけで有効化しない。
- GitHub mainは取得時 `protected:false`。新規権限・課金・Secrets・保護変更・merge・配備・定期実行を行わない。実装PRと実証PRは別。実証publisherは無効。
- 旧ML runnerは履歴の設計参考だけを確認。旧大会のFreezeを現在の実装依頼の禁止へ読み替えず、旧queueやCLI権限を復活させない。

## 結果

実装・検証・独立レビュー後に記録する。未実施を成功に含めない。
