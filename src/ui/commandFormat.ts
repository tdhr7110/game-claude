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

// コマンドのeffectValuesに登場する数値キーの日本語ラベル。commandFormat.ts・
// scripts/exportGameData.ts・報酬演出(進化差分ハイライト)から共通で参照する。
export const EFFECT_VALUE_FIELD_LABELS: Record<string, string> = {
  damage: '直接ダメージ',
  fallbackDamage: '基礎攻撃力なし時の代替ダメージ',
  fixedDamage: '固定ダメージ(防御無視)',
  damagePerPoison: '毒1あたりダメージ',
  powerPct: '威力%(基礎威力に対する割合)',
  hits: 'ヒット数',
  finisherDamage: '最終撃威力',
  bonusDamage: '追撃ダメージ',
  lifestealPct: 'ダメージ吸収率%',
  defenseIgnorePct: '防御無視率%',
  healPctOfMax: '最大HP比回復率%',
  instantPct: '即時回復率%(最大HP比)',
  tickPctPerSec: '継続回復(毎秒・最大HP比%)',
  shieldPct: '障壁量%(最大HP比)',
  reductionPct: '被ダメージ軽減率%',
  reflectPct: '反射率%',
  attackSpeedPct: '攻撃速度上昇%',
  attackSpeedBuffPct: '攻撃速度上昇%',
  critChancePctAdd: '会心率加算%',
  critMultAdd: '会心倍率加算',
  poisonPerArmHit: '腕命中時 追加毒付与量',
  vulnerabilityPct: '被ダメージ増加率%',
  durationSec: '効果時間(秒)',
  burnDps: '炎上ダメージ/秒',
  burnDuration: '炎上持続時間(秒)',
  bonusIfBurningPct: '炎上中ボーナス%',
  maxConsume: '毒消費上限',
  consumeFraction: '毒消費割合',
  selfDamagePctOfMax: '自傷率%(最大HP比)',
  bossDurationMultPct: 'ボス時の効果時間倍率%',
  poison: '付与する毒量',
};

// コマンド進化時、進化前後で数値がどう変化したかを人間が読める文の配列にする。
// キーごとの分岐を増やさず、effectValues/cooldownSeconds/metabolismCostを機械的に比較する。
export function describeCommandEvolutionChanges(from: CommandDef, to: CommandDef): string[] {
  const changes: string[] = [];
  if (to.cooldownSeconds !== from.cooldownSeconds) {
    const dir = to.cooldownSeconds < from.cooldownSeconds ? 'クールダウン短縮' : 'クールダウン変化';
    changes.push(`${dir}: ${from.cooldownSeconds}秒→${to.cooldownSeconds}秒`);
  }
  if (to.metabolismCost !== from.metabolismCost) {
    changes.push(`代謝コスト: ${from.metabolismCost}→${to.metabolismCost}`);
  }
  const keys = new Set([...Object.keys(from.effectValues), ...Object.keys(to.effectValues)]);
  for (const key of keys) {
    const label = EFFECT_VALUE_FIELD_LABELS[key] ?? key;
    const beforeV = from.effectValues[key];
    const afterV = to.effectValues[key];
    if (beforeV === afterV) continue;
    if (beforeV === undefined) {
      changes.push(`新しい効果を獲得: ${label}=${afterV}`);
    } else if (afterV === undefined) {
      continue;
    } else if (afterV > beforeV) {
      changes.push(`${label} 上昇: ${beforeV}→${afterV}`);
    } else {
      changes.push(`${label} 減少: ${beforeV}→${afterV}`);
    }
  }
  return changes;
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
