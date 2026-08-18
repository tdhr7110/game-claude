// TEST4: 部位を選んだ/装着した場合にシナジーがどう変化するかをUI表示用に計算するヘルパー。
// ゲームロジック（シナジー効果そのもの）には一切触れず、既存の computeActiveSynergies を
// 「装着前」「装着後」の2回呼んで差分を取るだけの純粋な表示用ユーティリティ。
import type { PartDef, PartType, Species } from '../data/types';
import { PART_TYPE_LABELS, SPECIES_LABELS } from '../data/types';
import { computeActiveSynergies } from '../engine/synergyEngine';
import { SPECIES_ICONS, TYPE_ICONS } from './format';

export interface SynergyDeltaRow {
  key: string;
  icon: string;
  label: string;
  before: number;
  after: number;
  becameActive: boolean; // このカードを装着すると新たにシナジーが1つ以上発動する
  nextTierLabel: string | null; // 装着後もまだ届いていない次の閾値の説明（あれば）
  nextTierRemaining: number | null;
}

export function computeSynergyDelta(beforeDefs: PartDef[], candidate: PartDef): SynergyDeltaRow[] {
  const before = computeActiveSynergies(beforeDefs);
  const after = computeActiveSynergies([...beforeDefs, candidate]);
  const rows: SynergyDeltaRow[] = [];

  const t = candidate.type;
  const beforeType = before.partType[t];
  const afterType = after.partType[t];
  if (afterType.count !== beforeType.count) {
    rows.push({
      key: `type-${t}`,
      icon: TYPE_ICONS[t as PartType],
      label: PART_TYPE_LABELS[t as PartType],
      before: beforeType.count,
      after: afterType.count,
      becameActive: afterType.activeTiers.length > beforeType.activeTiers.length,
      nextTierLabel: afterType.nextTier?.description ?? null,
      nextTierRemaining: afterType.nextTier ? afterType.nextTier.count - afterType.count : null,
    });
  }

  if (candidate.species !== 'none') {
    const s = candidate.species as Exclude<Species, 'none'>;
    const beforeSp = before.species[s];
    const afterSp = after.species[s];
    rows.push({
      key: `species-${s}`,
      icon: SPECIES_ICONS[s],
      label: SPECIES_LABELS[s],
      before: beforeSp.count,
      after: afterSp.count,
      becameActive: afterSp.activeTiers.length > beforeSp.activeTiers.length,
      nextTierLabel: afterSp.nextTier?.description ?? null,
      nextTierRemaining: afterSp.nextTier ? afterSp.nextTier.count - afterSp.count : null,
    });
  }

  return rows;
}
