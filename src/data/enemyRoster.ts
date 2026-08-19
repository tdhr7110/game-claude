import type { EnemyMove, EnemyTier, Species } from './types';
import { ALL_ELITE_ENEMIES, ALL_NORMAL_ENEMIES, buildDeepFinalBoss, buildFinalBoss } from './enemies';

// ============================================================
// 敵図鑑(優先7)用の「敵ロースター」。
//
// 実戦闘で使われるEnemyDefは戦闘番号に応じてhp/攻撃力等がスケーリングされるが
// (data/enemies.ts の scaleEnemy 等)、図鑑はスケーリング後の一時的な数値ではなく
// 「その敵の基準となる姿」を1件だけ表示すればよい。そのため、既存の敵データ生成
// 関数(data/enemies.ts)を一切変更せず、ここで表示用の固定ロースターを組み立てる。
//
// 中ボスは実戦闘では強敵(elite)からランダムに1体を選んで動的に強化生成される
// (buildMiniboss)ため、図鑑では強敵1種につき1件、buildMinibossと同じid/name規則
// (`${eliteId}_miniboss` / `【中ボス】強化${eliteName}`)で代表エントリを用意する。
// ============================================================

export interface EnemyRosterEntry {
  id: string;
  name: string;
  species: Species | 'chimera';
  tier: EnemyTier;
  description: string;
  icon: string;
  color: string;
  moves: EnemyMove[];
  // 将来「敵が所持する部位」データが追加された場合のための予約フィールド。
  // 現行仕様には敵の所持部位データが存在しないため、常にundefinedのまま扱う。
  heldPartIds?: string[];
}

const MINIBOSS_ROSTER: EnemyRosterEntry[] = ALL_ELITE_ENEMIES.map((e) => ({
  id: `${e.id}_miniboss`,
  name: `【中ボス】強化${e.name}`,
  species: e.species,
  tier: 'miniboss',
  description: e.description,
  icon: e.icon,
  color: e.color,
  moves: e.moves,
}));

const BOSS_ROSTER: EnemyRosterEntry[] = [buildFinalBoss(), buildDeepFinalBoss()].map((e) => ({
  id: e.id,
  name: e.name,
  species: e.species,
  tier: e.tier,
  description: e.description,
  icon: e.icon,
  color: e.color,
  moves: e.moves,
}));

export const ENEMY_ROSTER: EnemyRosterEntry[] = [
  ...ALL_NORMAL_ENEMIES.map((e) => ({ id: e.id, name: e.name, species: e.species, tier: e.tier, description: e.description, icon: e.icon, color: e.color, moves: e.moves })),
  ...ALL_ELITE_ENEMIES.map((e) => ({ id: e.id, name: e.name, species: e.species, tier: e.tier, description: e.description, icon: e.icon, color: e.color, moves: e.moves })),
  ...MINIBOSS_ROSTER,
  ...BOSS_ROSTER,
];

export const ENEMY_ROSTER_BY_ID: Record<string, EnemyRosterEntry> = Object.fromEntries(ENEMY_ROSTER.map((e) => [e.id, e]));

export const TOTAL_ENEMY_COUNT = ENEMY_ROSTER.length;

export function getEnemyRosterEntry(id: string): EnemyRosterEntry | undefined {
  return ENEMY_ROSTER_BY_ID[id];
}
