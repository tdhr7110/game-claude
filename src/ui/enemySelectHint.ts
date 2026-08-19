import type { EnemyDef, PartDef } from '../data/types';
import { SPECIES_LABELS } from '../data/types';
import { getPartDef } from '../data/parts';
import { computeSpeciesCounts } from '../engine/synergyEngine';
import { resolveAllFamilies } from '../data/commandDefs';

// 敵選択画面向けの簡易ヒント。「現在のキメラに関係するシナジー・コマンドの簡単なヒント」要件用。
// 既存のシナジー集計・コマンド解決ロジックをそのまま再利用し、専用の判定ロジックは持たない。
export function buildEnemySynergyHint(enemy: EnemyDef, eqDefs: PartDef[]): string {
  const hints: string[] = [];
  const species = enemy.species === 'chimera' ? null : enemy.species;
  if (species && species !== 'none') {
    const counts = computeSpeciesCounts(eqDefs);
    const count = counts[species];
    if (count > 0) hints.push(`${SPECIES_LABELS[species]}種の部位を持つ(現在${count}個装着中)`);
  }

  const currentFamilies = new Set(resolveAllFamilies(eqDefs).filter((f) => f.command).map((f) => f.familyId));
  const candidateParts = [...enemy.bodyPartIds, ...enemy.rareDropPartIds].map(getPartDef);
  for (const part of candidateParts) {
    const withPart = [...eqDefs, part];
    const unlocked = resolveAllFamilies(withPart).filter((f) => f.command && !currentFamilies.has(f.familyId));
    if (unlocked.length > 0) {
      hints.push(`${part.name}獲得でコマンド「${unlocked[0].command!.name}」解放の可能性`);
      break;
    }
  }

  return hints.length > 0 ? hints.join(' / ') : '現在のビルドとの直接シナジーは薄め';
}
