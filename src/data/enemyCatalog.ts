import type { EnemyDef, EnemyTier, Species } from './types';
import { ALL_NORMAL_ENEMIES, ALL_ELITE_ENEMIES, buildFinalBoss, buildDeepFinalBoss } from './enemies';

// ============================================================
// 図鑑・画像パイプライン用の「敵カタログ」。
// enemies.ts の生データ(通常・強敵の静的配列 + ボスの生成関数)を実行時に1回だけ
// 呼び出し、図鑑表示に必要な範囲(id/name/icon/color/species/tier/description/moves)
// だけを取り出して1つの配列にまとめる。数値・文言はここで二重管理せず、必ず
// enemies.ts の実データから読み取る。
//
// 中ボスは強敵の強化版であり、図鑑上は元の強敵と同一個体として扱う
// (baseEnemyIdForCollectionで `_miniboss` サフィックスを剥がして正規化する)。
// ============================================================

export interface EnemyCatalogEntry {
  id: string;
  name: string;
  species: Species | 'chimera';
  tier: EnemyTier;
  description: string;
  icon: string;
  color: string;
  moves: EnemyDef['moves'];
}

function toCatalogEntry(def: EnemyDef): EnemyCatalogEntry {
  return {
    id: def.id,
    name: def.name,
    species: def.species,
    tier: def.tier,
    description: def.description,
    icon: def.icon,
    color: def.color,
    moves: def.moves,
  };
}

export const ENEMY_CATALOG: EnemyCatalogEntry[] = [
  ...ALL_NORMAL_ENEMIES.map(toCatalogEntry),
  ...ALL_ELITE_ENEMIES.map(toCatalogEntry),
  toCatalogEntry(buildFinalBoss()),
  toCatalogEntry(buildDeepFinalBoss()),
];

export const ENEMY_CATALOG_BY_ID: Record<string, EnemyCatalogEntry> = Object.fromEntries(ENEMY_CATALOG.map((e) => [e.id, e]));

const MINIBOSS_SUFFIX = '_miniboss';

// 中ボスは強敵の強化版として生成される(`${baseId}_miniboss`)ため、
// 図鑑上は元の敵と同一個体として正規化する。
export function baseEnemyIdForCollection(enemyId: string): string {
  return enemyId.endsWith(MINIBOSS_SUFFIX) ? enemyId.slice(0, -MINIBOSS_SUFFIX.length) : enemyId;
}

export function getEnemyCatalogEntry(id: string): EnemyCatalogEntry | undefined {
  return ENEMY_CATALOG_BY_ID[baseEnemyIdForCollection(id)];
}
