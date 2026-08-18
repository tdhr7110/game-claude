import { PART_TYPE_LABELS, type PartDef } from '../data/types';
import { getPartDef } from '../data/parts';
import type { CommandCondition, CommandDef } from '../data/commandDefs';

// コマンド編集画面・戦闘画面で条件を人間が読める文へ変換する表示専用ヘルパー。

export function describeCommandCondition(cmd: CommandCondition): string {
  const parts: string[] = [];
  if (cmd.requiredCategoryCounts) {
    for (const c of cmd.requiredCategoryCounts) parts.push(`${PART_TYPE_LABELS[c.type]}カテゴリ${c.count}個以上`);
  }
  if (cmd.requiredPartCounts) {
    for (const c of cmd.requiredPartCounts) parts.push(`${getPartDef(c.partId).name}${c.count}個以上`);
  }
  if (cmd.requiredPartIds) {
    for (const id of cmd.requiredPartIds) parts.push(`${getPartDef(id).name}を装着`);
  }
  if (cmd.requiredAnyOf) {
    parts.push('レアの心臓・臓器、または特殊核を1個以上装着');
  }
  return parts.length > 0 ? parts.join('、') : '常時使用可能（初期解放）';
}

// ロック中のコマンドについて、「足りない部位」を具体的に列挙する。
export function describeMissingRequirements(cmd: CommandCondition, equipped: PartDef[]): string[] {
  const missing: string[] = [];
  if (cmd.requiredCategoryCounts) {
    for (const c of cmd.requiredCategoryCounts) {
      const have = equipped.filter((p) => p.type === c.type).length;
      if (have < c.count) missing.push(`${PART_TYPE_LABELS[c.type]}カテゴリ あと${c.count - have}個`);
    }
  }
  if (cmd.requiredPartCounts) {
    for (const c of cmd.requiredPartCounts) {
      const have = equipped.filter((p) => p.id === c.partId).length;
      if (have < c.count) missing.push(`${getPartDef(c.partId).name} あと${c.count - have}個`);
    }
  }
  if (cmd.requiredPartIds) {
    for (const id of cmd.requiredPartIds) {
      if (!equipped.some((p) => p.id === id)) missing.push(`${getPartDef(id).name}が未装着`);
    }
  }
  if (cmd.requiredAnyOf) {
    const ok = cmd.requiredAnyOf.some((pred) =>
      equipped.some(
        (p) =>
          (pred.rarity ? p.rarity === pred.rarity : true) &&
          (pred.type ? p.type === pred.type : true) &&
          (pred.idPrefix ? p.id.startsWith(pred.idPrefix) : true)
      )
    );
    if (!ok) missing.push('レアの心臓・臓器、または特殊核のいずれも未装着');
  }
  return missing;
}

export function commandEffectSummary(cmd: CommandDef): string {
  const v = cmd.effectValues;
  switch (cmd.effectId) {
    case 'strike_best':
      return '最強の攻撃部位で即時攻撃';
    case 'guard_reduce':
      return `${v.durationSec}秒間 被ダメージ-${v.reductionPct}%`;
    case 'emergency_regen':
      return `最大HPの${v.healPctOfMax}%を回復`;
    case 'all_arms_volley':
    case 'hundred_arms_barrage':
      return `全攻撃部位を${v.hits}回発動(威力${v.powerPct}%)`;
    case 'bone_spear':
      return `固定${v.fixedDamage}ダメージ(防御・軽減無視)`;
    case 'predation_bite':
      return `${v.damage}ダメージ＋${v.lifestealPct}%回復`;
    case 'flame_bolt':
    case 'hell_flame_bolt':
      return `${v.damage}ダメージ＋炎上(${v.burnDps}/秒 x${v.burnDuration}秒)`;
    case 'poison_burst':
      return `毒を最大${v.maxConsume}消費、毒1につき${v.damagePerPoison}ダメージ`;
    case 'plague_burst':
      return `毒の${Math.round(v.consumeFraction * 100)}%を消費、毒1につき${v.damagePerPoison}ダメージ`;
    case 'mana_cannon':
      return `${v.damage}ダメージ(防御${v.defenseIgnorePct}%無視)`;
    case 'frenzy_buff':
      return `${v.durationSec}秒間 攻撃速度+${v.attackSpeedPct}%`;
    case 'eye_focus_buff':
      return `${v.durationSec}秒間 会心率+${v.critChancePctAdd}% 会心倍率+${v.critMultAdd}`;
    case 'venom_secretion_buff':
      return `${v.durationSec}秒間 腕命中時に毒+${v.poisonPerArmHit}`;
    case 'harden_buff':
      return `${v.durationSec}秒間 被ダメージ-${v.reductionPct}%`;
    case 'reflect_shell_buff':
      return `${v.durationSec}秒間 被ダメージ-${v.reductionPct}%、反射${v.reflectPct}%`;
    case 'shell_break_debuff':
    case 'predator_mark_debuff':
      return `${v.durationSec}秒間 敵の被ダメージ+${v.vulnerabilityPct}%`;
    case 'paralysis_debuff':
      return `敵の行動を${v.durationSec}秒停止(ボスは${100 - v.bossDurationMultPct}%短縮)`;
    case 'heartbeat_heal':
    case 'dragon_vein_heal':
      return `即時${v.instantPct}%回復＋${v.durationSec}秒間 毎秒${v.tickPctPerSec}%回復`;
    case 'molt_cleanse':
      return `毒・炎上を解除、障壁${v.shieldPct}%`;
    case 'full_organ_release':
      return `全攻撃部位・周期器官を1回ずつ発動、自身に最大HPの${v.selfDamagePctOfMax}%の自傷`;
    default:
      return cmd.description;
  }
}
