import { ALL_PARTS } from './parts';
import { ENEMY_CATALOG } from './enemyCatalog';
import { ALL_COMMANDS, type CommandDef } from './commandDefs';
import { SPECIES_LABELS, type PartDef, type Species } from './types';

// ============================================================
// 図鑑のカテゴリ別集計・関連情報を求めるための純粋関数群。
// 「唯一の正」であるsrc/data/parts.ts・enemies.ts・commandDefs.tsを実行時に読むだけで、
// カテゴリ内訳や関連コマンドを二重管理しない。
// ============================================================

export type CollectionCategory = Species; // 'insect' | 'golem' | 'dragon' | 'none'

export const COLLECTION_CATEGORY_ORDER: CollectionCategory[] = ['insect', 'golem', 'dragon', 'none'];

// 敵は'chimera'種族(最終ボス系統)も含むため、部位のカテゴリ(Species)より1種類多い。
export type EnemyCategory = Species | 'chimera';

export const ENEMY_CATEGORY_LABELS: Record<EnemyCategory, string> = { ...SPECIES_LABELS, chimera: 'キメラ' };

export interface CategoryRate<C extends string = CollectionCategory> {
  category: C;
  total: number;
  discovered: number;
  pct: number; // 0-100
}

export function partsByCategory(): Record<CollectionCategory, PartDef[]> {
  const out: Record<CollectionCategory, PartDef[]> = { insect: [], golem: [], dragon: [], none: [] };
  for (const p of ALL_PARTS) out[p.species].push(p);
  return out;
}

export function partCollectionRates(discoveredPartIds: ReadonlySet<string>): CategoryRate[] {
  const grouped = partsByCategory();
  return COLLECTION_CATEGORY_ORDER.map((category) => {
    const parts = grouped[category];
    const discovered = parts.filter((p) => discoveredPartIds.has(p.id)).length;
    return { category, total: parts.length, discovered, pct: parts.length === 0 ? 0 : Math.round((discovered / parts.length) * 100) };
  });
}

export function enemiesByCategory(): Record<string, typeof ENEMY_CATALOG> {
  const out: Record<string, typeof ENEMY_CATALOG> = {};
  for (const e of ENEMY_CATALOG) {
    (out[e.species] ??= []).push(e);
  }
  return out;
}

export function enemyCollectionRates(discoveredEnemyIds: ReadonlySet<string>): CategoryRate<EnemyCategory>[] {
  const grouped = enemiesByCategory();
  return Object.keys(grouped)
    .sort()
    .map((category) => {
      const enemies = grouped[category];
      const discovered = enemies.filter((e) => discoveredEnemyIds.has(e.id)).length;
      return {
        category: category as EnemyCategory,
        total: enemies.length,
        discovered,
        pct: enemies.length === 0 ? 0 : Math.round((discovered / enemies.length) * 100),
      };
    });
}

// 特定の部位を装着条件に含むコマンド(=「関連コマンド」)を求める。
// requiredPartIds / requiredPartCounts のいずれかにこの部位IDが含まれていれば関連とみなす。
export function commandsRequiringPart(partId: string): CommandDef[] {
  return ALL_COMMANDS.filter(
    (cmd) => cmd.requiredPartIds?.includes(partId) || cmd.requiredPartCounts?.some((r) => r.partId === partId)
  );
}
