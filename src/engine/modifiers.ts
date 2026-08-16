import type { PartDef, PartEffect, PartType, SynergyEffect } from '../data/types';
import type { ActiveSynergies } from './synergyEngine';

export type OnHitEffect = { kind: 'apply_poison'; amount: number } | { kind: 'apply_burn'; dps: number; duration: number };

export interface CombatantModifiers {
  attackSpeedGlobalPct: number;
  attackSpeedTypePct: Record<PartType, number>;
  damageReductionPct: number;
  counterDamage: number;
  evasionPct: number;
  statusAmountBonus: number;
  healMultiplier: number;
  burnDamageMult: number;
  damageVsBurningMult: number;
  defenseToDamagePct: number;
  poisonNoDecayChance: number;
  onPoisonApplyGainDefense: number;
  reviveHpPct: number | null;
  battleStartDefense: number;
  typeDoubleActivationChance: Partial<Record<PartType, number>>;
  onTypeAttackCountProcs: { targetType: PartType; every: number }[];
  onTypeAttackChanceProcs: { targetType: PartType; chance: number }[];
  auraOnHitByType: Partial<Record<PartType, OnHitEffect[]>>;
}

export function emptyModifiers(): CombatantModifiers {
  return {
    attackSpeedGlobalPct: 0,
    attackSpeedTypePct: { arm: 0, head: 0, heart: 0, leg: 0, skin: 0 },
    damageReductionPct: 0,
    counterDamage: 0,
    evasionPct: 0,
    statusAmountBonus: 0,
    healMultiplier: 1,
    burnDamageMult: 1,
    damageVsBurningMult: 1,
    defenseToDamagePct: 0,
    poisonNoDecayChance: 0,
    onPoisonApplyGainDefense: 0,
    reviveHpPct: null,
    battleStartDefense: 0,
    typeDoubleActivationChance: {},
    onTypeAttackCountProcs: [],
    onTypeAttackChanceProcs: [],
    auraOnHitByType: {},
  };
}

function applyStatic(mods: CombatantModifiers, kind: string, e: any) {
  switch (kind) {
    case 'attack_speed_all':
      mods.attackSpeedGlobalPct += e.pct;
      break;
    case 'attack_speed_type':
      mods.attackSpeedTypePct[e.targetType as PartType] += e.pct;
      break;
    case 'damage_reduction_pct':
      mods.damageReductionPct += e.pct;
      break;
    case 'counter_on_hit':
      mods.counterDamage += e.damage;
      break;
    case 'evasion_bonus':
      mods.evasionPct += e.pct;
      break;
    case 'status_amount_bonus':
      mods.statusAmountBonus += e.amount;
      break;
    case 'heal_multiplier':
      mods.healMultiplier *= e.mult;
      break;
    case 'burn_damage_mult':
      mods.burnDamageMult *= e.mult;
      break;
    case 'damage_vs_burning_mult':
      mods.damageVsBurningMult *= e.mult;
      break;
    case 'defense_to_damage':
      mods.defenseToDamagePct += e.pct;
      break;
    case 'poison_no_decay_chance':
      mods.poisonNoDecayChance = Math.max(mods.poisonNoDecayChance, e.chance);
      break;
    case 'on_poison_apply_gain_defense':
      mods.onPoisonApplyGainDefense += e.amount;
      break;
    case 'revive_once':
      mods.reviveHpPct = e.hpPct;
      break;
    case 'battle_start_defense':
      mods.battleStartDefense += e.amount;
      break;
    case 'type_double_activation_chance':
      mods.typeDoubleActivationChance[e.targetType as PartType] = Math.max(
        mods.typeDoubleActivationChance[e.targetType as PartType] ?? 0,
        e.chance
      );
      break;
    case 'on_type_attack_count':
      mods.onTypeAttackCountProcs.push({ targetType: e.targetType, every: e.every });
      break;
    case 'on_type_attack_chance':
      mods.onTypeAttackChanceProcs.push({ targetType: e.targetType, chance: e.chance });
      break;
    default:
      break;
  }
}

const STATIC_SYNERGY_KINDS = new Set<SynergyEffect['kind']>([
  'attack_speed_type',
  'attack_speed_all',
  'on_type_attack_count',
  'on_type_attack_chance',
  'status_amount_bonus',
  'type_double_activation_chance',
  'heal_multiplier',
  'revive_once',
  'evasion_bonus',
  'damage_reduction_pct',
  'counter_on_hit',
  'on_poison_apply_gain_defense',
  'poison_no_decay_chance',
  'battle_start_defense',
  'defense_to_damage',
  'burn_damage_mult',
  'damage_vs_burning_mult',
]);

export function computeModifiers(equippedDefs: PartDef[], synergies: ActiveSynergies): CombatantModifiers {
  const mods = emptyModifiers();
  const legCount = equippedDefs.filter((p) => p.type === 'leg').length;

  for (const def of equippedDefs) {
    for (const e of def.effects as PartEffect[]) {
      if (e.kind === 'aura_add_onhit') {
        const list = mods.auraOnHitByType[e.targetType] ?? [];
        list.push(e.effect);
        mods.auraOnHitByType[e.targetType] = list;
        continue;
      }
      if (e.kind === 'attack_speed_per_count') {
        const count = e.countType === 'leg' ? legCount : equippedDefs.filter((p) => p.type === e.countType).length;
        const times = Math.floor(count / e.per);
        mods.attackSpeedGlobalPct += times * e.pctEach;
        continue;
      }
      // apply_poison / apply_burn / heal_tick / capacity_bonus / capacity_bonus_on_win / cost_modifier / lifesteal は
      // それぞれ攻撃解決時・容量計算時に別処理されるためここではスキップ
      applyStatic(mods, e.kind, e);
    }
  }

  for (const group of Object.values(synergies.partType)) {
    for (const tier of group.activeTiers) {
      if (STATIC_SYNERGY_KINDS.has(tier.effect.kind)) applyStatic(mods, tier.effect.kind, tier.effect);
    }
  }
  for (const group of Object.values(synergies.species)) {
    for (const tier of group.activeTiers) {
      if (STATIC_SYNERGY_KINDS.has(tier.effect.kind)) applyStatic(mods, tier.effect.kind, tier.effect);
    }
  }

  return mods;
}

export function effectiveInterval(baseInterval: number, type: PartType, mods: CombatantModifiers): number {
  const pct = mods.attackSpeedGlobalPct + mods.attackSpeedTypePct[type];
  const mult = Math.max(0.2, 1 + pct / 100);
  return baseInterval / mult;
}
