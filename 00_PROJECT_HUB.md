# CHIMERA BUTCHER — PROJECT HUB

> 最終更新: 2026-08-19（JST）  
> このファイルは「今どこにいて、次に何をするか」を確認するための入口。  
> 詳細な仕様は `DECISIONS.md`、各TESTの履歴は `TEST_HISTORY.md`、全バックログは既存の `CHIMERA BUTCHER 開発TODO.md` を参照する。

## 1. プロジェクトの核

- 1ラン5〜10分の短時間オートバトル・ローグライト。
- 倒した敵から部位を奪い、固定枠なしで自由に装着する。
- 右腕6本のような異形ビルド、シナジー連鎖、最終的な「ぶっ壊れ」を楽しさの中心にする。
- オートバトルは維持し、コマンドでプレイヤーの判断と介入を増やす。
- UIはシンプル、内部の部位・能力・コンボは複雑でよい。

## 2. 現在地

| 項目 | 現在の状態 |
| --- | --- |
| 開発リポジトリ | `tdhr7110/game-claude`（Public） |
| デフォルトブランチ | `claude/chimera-battle-prototype-36bome` |
| 本番 | TEST6の代謝ゲージ式コマンドシステム＋報酬導線を統合済み |
| 最新統合版 | `test10/chimera-integrated-next` |
| TEST10の内容 | TEST7の敵選択・所持部位ドロップ・固有ギミック、TEST8の戦闘演出・SE・完成ビルド、TEST9のラン保存・図鑑、選択したTEST6のUX改善 |
| TEST10の状態 | GitHub Pagesで公開中。自動回帰テスト追加済み。本番には未統合 |
| マスターTODO | 2026-08-18版。現在の実装と食い違う項目があるため要更新 |
| プレイデータ収集 | 現在のリポジトリでは、全プレイヤーの難易度データを集める仕組みは確認できない |

## 3. すぐ使うURL

- 本番: <https://tdhr7110.github.io/game-claude/>
- 最新TEST10: <https://tdhr7110.github.io/game-claude/test10/>
- TEST1: <https://tdhr7110.github.io/game-claude/test/>
- TEST2〜TEST6: URL末尾を `/test2/`〜`/test6/` に変更
- GitHub: <https://github.com/tdhr7110/game-claude>

TEST7〜TEST9は統合作業用ブランチで、専用の公開URLはデプロイ設定上確認できない。内容はTEST10でプレイする。

## 4. 次にやる3件

1. **TEST10を手動プレイ確認する**
   - PCとスマホ縦画面で1ラン通す。
   - 敵候補選択、敵所持部位ドロップ、敵固有ギミック、保存・再開、図鑑、戦闘演出、SEを確認する。
   - ブラウザコンソールの重大エラーも確認する。
2. **問題を「致命的／遊びにくい／バランス／演出」に分けて記録する**
   - まず致命的不具合と進行不能だけを直す。
   - アイデア追加は同時に混ぜず、バックログへ送る。
3. **TEST10を本番へ反映する範囲を決める**
   - TEST10を丸ごと統合するか、機能単位で選ぶかを決める。
   - 承認前は本番と既存TEST URLを変更しない。

## 5. 次の3件の後に検討する候補

- 難易度調整用プレイデータの収集設計（勝率、到達戦、選択部位、死亡原因など）。
- 既存TODOを実装状況に合わせて更新し、「完了」「未完了」「廃止」を整理する。
- 敵・部位画像の試験実装。
- 公開リポジトリからPrivate開発リポジトリ＋別デプロイ先への移行。

上記の優先順は、現在の状態からの**推論に基づく提案**。ユーザーの次の判断で更新する。

## 6. 未解決・要判断

- TEST10を本番へ統合するか。
- TEST10の敵候補選択と敵ギミックが実プレイで面白いか。
- セーブ・図鑑の保存データ互換性と `saveVersion` の最終ルール。
- プレイデータを収集するか。収集する場合の項目、匿名化、同意表示、保存先。
- 開発リポジトリをPrivate化する時期と、Cloudflare Pages等への移行方法。
- 既存TODOに残る「横画面前提」を削除し、最新の「縦画面前提」に統一すること。

## 7. 運用ルール

- コードの正本はGitHub、タスクの正本は `CHIMERA BUTCHER 開発TODO.md` とする。
- このHUBには全タスクを書かず、現在地と次の3件だけを置く。
- 1チャット1成果物を基本とし、完了チャットはアーカイブする。
- 新機能はTESTブランチで検証し、面白かったものだけ本番へ反映する。
- 大きな変更前にバックアップを取り、本番・既存TEST URL・保存データを守る。
- 作業終了時に、このHUB、`DECISIONS.md`、`TEST_HISTORY.md`の該当箇所を更新する。
- 実装完了条件は `npm run build`、`npm run lint`、主要フロー確認、コンソールエラー確認。

## 8. 情報源

- [GitHubリポジトリ](https://github.com/tdhr7110/game-claude)
- [GitHub Pagesデプロイ設定](https://github.com/tdhr7110/game-claude/blob/claude/chimera-battle-prototype-36bome/.github/workflows/deploy-pages.yml)
- [TEST10ブランチ](https://github.com/tdhr7110/game-claude/tree/test10/chimera-integrated-next)
- `CHIMERA BUTCHER 開発TODO.md`（2026-08-18版）
- プロジェクト内の決定・会話（2026-08-16〜19）

