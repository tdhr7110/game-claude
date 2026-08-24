# CHIMERA BUTCHER — TEST HISTORY

> 最終更新: 2026-08-19（JST）  
> GitHubのブランチ、コミット履歴、デプロイ設定を正として整理。

## 1. 現在の全体像

- **本番**: TEST6の代謝ゲージ式コマンドシステム＋報酬導線を統合済み。
- **最新検証版**: TEST10。TEST7〜9と、選択したTEST6のUX改善を統合済み。
- **TEST10は本番未統合**。まず公開URLで手動確認する。
- TEST7〜9は個別URLを持たず、TEST10へ統合するための作業ブランチ。

## 2. バージョン履歴

| 版 | 日付 | ブランチ | 主な目的・変更 | 公開URL | 状態 |
| --- | --- | --- | --- | --- | --- |
| 本番 | 8/16〜19 | `claude/chimera-battle-prototype-36bome` | MVP、スマホ対応、命名・図鑑、TEST4までのUI等を経て、TEST6の代謝ゲージ式コマンド＋報酬導線を統合 | [本番](https://tdhr7110.github.io/game-claude/) | 安定版。TEST10は未統合 |
| TEST1 | 8/17〜18 | `test/chimera-butcher-update-1` | 16戦・第2階層、図鑑詳細、特殊能力10種、難易度・ドロップ調整、BALANCE管理画面 | [TEST1](https://tdhr7110.github.io/game-claude/test/) | 保存・参照用 |
| TEST2 | 8/18 | `test2/chimera-butcher-phase2` | オートバトル＋コマンド、敵ギミック、一斉発動偏重の緩和 | [TEST2](https://tdhr7110.github.io/game-claude/test2/) | 検証済みの旧版 |
| TEST3 | 8/18 | `test3/chimera-butcher-phase3` | キャラクター可視化、アニメーション、戦闘演出。コード初期値として全部位38種を実装 | [TEST3](https://tdhr7110.github.io/game-claude/test3/) | ビジュアル検証版 |
| TEST4 | 8/18 | `test4/chimera-butcher-phase4` | ポップUI・ゲームデザイン刷新 | [TEST4](https://tdhr7110.github.io/game-claude/test4/) | 主内容は後に本番へ統合 |
| TEST5 | 8/18 | `test5/chimera-butcher-turn-battle` | ターン制コマンド試作から、オートバトル＋代謝ゲージ式コマンドへ発展。本番UI移植、ゲームデータExcel出力を追加 | [TEST5](https://tdhr7110.github.io/game-claude/test5/) | TEST6の土台 |
| TEST6 | 8/19 | `test6/chimera-butcher-command-system` | 代謝ゲージ式コマンド、コマンド獲得・進化、報酬導線・演出。状態表示、スクロール、比較表示、倍速記憶などを改善 | [TEST6](https://tdhr7110.github.io/game-claude/test6/) | 中核は本番統合済み。後発UXの一部はTEST10へ移植 |
| TEST7 | 8/19 | `claude/test7-chimera-enemy-hunt-34cuh3` | 敵候補選択、敵の所持部位からのドロップ、敵固有ギミック | 専用URLなし | TEST10へ統合済み |
| TEST8 | 8/19 | `test8/chimera-combat-impact` | 戦闘演出、SE、壊れ方の異なる完成ビルド3系統 | 専用URLなし | TEST10へ統合済み |
| TEST9 | 8/19 | `test9/chimera-save-codex` | ラン途中保存・再開、キメラ収集図鑑、部位・敵図鑑 | 専用URLなし | TEST10へ統合済み |
| TEST10 | 8/19 | `test10/chimera-integrated-next` | TEST7〜9統合、選択したTEST6 UX改善、統合回帰テスト、React key重複修正 | [TEST10](https://tdhr7110.github.io/game-claude/test10/) | 最新検証版。手動QA待ち |

## 3. 重要コミット

### TEST1

- [`c5ae838`](https://github.com/tdhr7110/game-claude/commit/c5ae838) 第1回アップデート：16戦、第2階層、図鑑詳細、特殊能力10種。
- [`d7c50d3`](https://github.com/tdhr7110/game-claude/commit/d7c50d3) 難易度・ドロップ抽選調整。
- [`accd426`](https://github.com/tdhr7110/game-claude/commit/accd426) BALANCE管理画面の表示値を実使用中の最新値へ統一。

### TEST2〜TEST6

- [`8e45391`](https://github.com/tdhr7110/game-claude/commit/8e45391) TEST2：オートバトル＋コマンド・敵ギミック。
- [`7e14b86`](https://github.com/tdhr7110/game-claude/commit/7e14b86) TEST3：可視化・アニメーション・演出。
- [`196ef35`](https://github.com/tdhr7110/game-claude/commit/196ef35) TEST4：ポップUI刷新。
- [`ef6810e`](https://github.com/tdhr7110/game-claude/commit/ef6810e) TEST5：代謝ゲージ式コマンドをオートバトルへ追加。
- [`a0c4d43`](https://github.com/tdhr7110/game-claude/commit/a0c4d43) TEST5：ゲームデータExcel出力。
- [`95a2f17`](https://github.com/tdhr7110/game-claude/commit/95a2f17) TEST6：コマンド獲得・進化の報酬導線と演出。
- [`e00fcef`](https://github.com/tdhr7110/game-claude/commit/e00fcef) TEST6の中核で本番を全面刷新。

### TEST7〜TEST10

- [`1d36a6c`](https://github.com/tdhr7110/game-claude/commit/1d36a6c) TEST7：敵選択・所持部位ドロップ・固有ギミック。
- [`5d42631`](https://github.com/tdhr7110/game-claude/commit/5d42631) TEST8：戦闘演出・SE・完成ビルド3系統。
- [`4089708`](https://github.com/tdhr7110/game-claude/commit/4089708) TEST9：ラン途中保存とキメラ収集図鑑。
- [`64f8996`](https://github.com/tdhr7110/game-claude/commit/64f8996) TEST7をTEST10へ統合。
- [`4655777`](https://github.com/tdhr7110/game-claude/commit/4655777) TEST9をTEST10用に調整・統合。
- [`831b56c`](https://github.com/tdhr7110/game-claude/commit/831b56c) TEST8をTEST10へ統合。
- [`0464576`](https://github.com/tdhr7110/game-claude/commit/0464576) TEST6の選択UX改善をTEST10へ移植。
- [`3611959`](https://github.com/tdhr7110/game-claude/commit/3611959) TEST10統合回帰テスト追加。
- [`f0ccb23`](https://github.com/tdhr7110/game-claude/commit/f0ccb23) 部位比較リストのReact key重複を修正。
- [`2ff6484`](https://github.com/tdhr7110/game-claude/commit/2ff6484) TEST10を `/test10/` へデプロイする設定を本番ブランチへ追加。

## 4. 呼称の整理

会話中に「TEST9で敵候補選択」と呼ばれた場面があるが、GitHub上の最終実装は次の対応になっている。

- 敵候補選択・所持部位ドロップ・固有ギミック → **TEST7**
- 戦闘演出・SE・完成ビルド → **TEST8**
- 保存・再開・図鑑 → **TEST9**
- 上記の統合 → **TEST10**

今後はGitHubのブランチ名とこの対応表を正とする。

## 5. TEST10の確認項目

- [ ] 敵候補が正しく表示され、選択して戦闘開始できる。
- [ ] 敵の所持部位とドロップ候補が連動する。
- [ ] 敵固有ギミックが表示・発動し、進行不能にならない。
- [ ] 戦闘演出・SEが過剰な重さや表示崩れを起こさない。
- [ ] 3系統の完成ビルドが成立し、無限ループしない。
- [ ] ラン保存・再開が正しく動く。
- [ ] 部位図鑑・敵図鑑・キメラ図鑑が正しく保存・表示される。
- [ ] コマンド獲得・比較・入れ替え・進化が分かりやすい。
- [ ] PCとスマホ縦画面で1ラン完走できる。
- [ ] ブラウザコンソールに重大エラーがない。

## 6. 情報源

- [GitHubコミット履歴](https://github.com/tdhr7110/game-claude/commits/claude/chimera-battle-prototype-36bome/)
- [GitHub Pagesデプロイ設定](https://github.com/tdhr7110/game-claude/blob/claude/chimera-battle-prototype-36bome/.github/workflows/deploy-pages.yml)
- [TEST10ブランチ](https://github.com/tdhr7110/game-claude/tree/test10/chimera-integrated-next)
- `CHIMERA BUTCHER 開発TODO.md`（2026-08-18版）
- プロジェクト内の決定・会話（2026-08-16〜19）
