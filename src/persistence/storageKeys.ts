// ============================================================
// localStorage キーの一元管理。
//
// テスト版(test9)は既存の本番/他テストブランチと同じオリジンから配信される
// 可能性があるため、衝突を避けるためテスト専用のnamespaceを切っている。
// 正式版へ統合する際は STORAGE_NAMESPACE をここで1箇所変更するだけでよい。
// ============================================================

export const STORAGE_NAMESPACE = 'chimera-battle:test9';

// ラン途中保存(RunState)。フェーズ単位のチェックポイントで書き込む。
export const RUN_SAVE_KEY = `${STORAGE_NAMESPACE}:run:v1`;

// 収集図鑑(部位図鑑・敵図鑑)の発見状況。ラン進行とは独立して蓄積される。
// 命名キメラ図鑑は既存のキー(chimera-battle:gallery:v1、GameContext.tsx参照)を
// そのまま使い続ける。既存データを失わないため、あえて移行・統合しない。
export const CODEX_SAVE_KEY = `${STORAGE_NAMESPACE}:codex:v1`;
