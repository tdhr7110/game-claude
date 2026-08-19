// ============================================================
// localStorage キーの一元管理。
//
// テスト版(test10)は既存の本番/他テストブランチと同じオリジンから配信される
// 可能性があるため、衝突を避けるためテスト専用のnamespaceを切っている。
// TEST9からTEST10への統合でRunState/EnemyDefのスキーマ(enemySelectフェーズ・
// 敵候補・敵ギミック関連フィールド)が変わったため、test9時代のセーブと混ざらない
// よう namespace 自体をtest10へ切り替える(test9のセーブは自然に読まれなくなる)。
// 正式版へ統合する際は STORAGE_NAMESPACE をここで1箇所変更するだけでよい。
// ============================================================

export const STORAGE_NAMESPACE = 'chimera-battle:test10';

// ラン途中保存(RunState)。フェーズ単位のチェックポイントで書き込む。
// v2: TEST10統合でRunStateにenemySelectフェーズ・enemyCandidatesが追加されたための
// スキーマバージョン。RunSaveEnvelope側のRUN_SAVE_VERSIONと合わせて二重にガードする。
export const RUN_SAVE_KEY = `${STORAGE_NAMESPACE}:run:v2`;

// 収集図鑑(部位図鑑・敵図鑑)の発見状況。ラン進行とは独立して蓄積される。
// 命名キメラ図鑑は既存のキー(chimera-battle:gallery:v1、GameContext.tsx参照)を
// そのまま使い続ける。既存データを失わないため、あえて移行・統合しない。
export const CODEX_SAVE_KEY = `${STORAGE_NAMESPACE}:codex:v1`;

// ローカル難易度計測・バランス確認用のイベント記録(TEST12)。
// ラン途中保存(RUN_SAVE_KEY)・収集図鑑(CODEX_SAVE_KEY)とは完全に別のキーに保存する
// (要件: 「保存先は専用localStorageキーとし、ラン保存や図鑑保存と混ぜない」)。
// ブラウザ内(localStorage)にのみ保存し、外部サーバーへは一切送信しない。
export const METRICS_SAVE_KEY = `${STORAGE_NAMESPACE}:metrics:v1`;
