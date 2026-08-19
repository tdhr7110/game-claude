import { PART_TYPE_LABELS } from '../../data/types';
import { getPartDef } from '../../data/parts';
import type { TurnCommandSlot, TurnSkillDef } from '../../data/turnSkills';

export const TURN_SLOT_ICONS: Record<TurnCommandSlot, string> = {
  normal: '👊',
  mutation: '🧬',
  guard: '🛡️',
};

// ボタンのサブテキスト用に、技の効果を短い日本語へ変換する。
// 効果の実行(engine/turnBattle.ts)とは独立した、表示専用のロジック。
export function describeSkillPower(skill: TurnSkillDef): string {
  const v = skill.effectValues;
  switch (skill.effectId) {
    case 'wait':
    case 'single_hit':
      return `${v.damage}ダメージ`;
    case 'multi_hit_flat':
      return `${v.hits}回攻撃（1発${v.damagePerHit}・合計${v.hits * v.damagePerHit}）`;
    case 'multi_hit_finisher':
      return `${v.hits}回攻撃（最終撃${v.finisherDamage}・合計${v.damagePerHit * (v.hits - 1) + v.finisherDamage}）`;
    case 'multi_hit_poison_stack':
      return `${v.hits}回攻撃＋毒付与（毒${v.poisonThreshold}以上で追撃${v.bonusDamage}）`;
    case 'poison_bolt':
      return `${v.damage}ダメージ＋毒${v.poison}`;
    case 'poison_burst':
      return `毒1につき${v.damagePerPoison}ダメージ（毒0なら${v.minDamage}）`;
    case 'guard_reduce':
      return `被ダメージ-${v.reductionPct}%`;
    case 'guard_reflect':
      return `被ダメージ-${v.reductionPct}%／反射${v.reflectPct}%`;
    default:
      return '';
  }
}

// 技一覧・条件確認パネル用に、条件を人間が読める文へ変換する。
export function describeSkillCondition(skill: TurnSkillDef): string {
  const parts: string[] = [];
  if (skill.requiredCategoryCounts) {
    for (const c of skill.requiredCategoryCounts) {
      parts.push(`${PART_TYPE_LABELS[c.type]}カテゴリ${c.count}個以上`);
    }
  }
  if (skill.requiredPartCounts) {
    for (const c of skill.requiredPartCounts) {
      parts.push(`${getPartDef(c.partId).name}${c.count}個以上`);
    }
  }
  if (skill.requiredPartIds) {
    for (const id of skill.requiredPartIds) {
      parts.push(`${getPartDef(id).name}を装着`);
    }
  }
  if (skill.requiredTags) {
    parts.push(`能力タグ「${skill.requiredTags.join('/')}」を保有`);
  }
  return parts.length > 0 ? parts.join('、') : '常時使用可能';
}
