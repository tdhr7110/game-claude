import type { PartDef, PartType } from '../data/types';

export interface CostModifierTotals {
  byType: Record<PartType, number>; // その種類に直接かかる補正
  allExcept: { exceptType: PartType; delta: number }[]; // 特定種類「以外」にかかる補正
}

function collectCostModifiers(equipped: PartDef[]): CostModifierTotals {
  const byType: Record<PartType, number> = { arm: 0, head: 0, heart: 0, leg: 0, skin: 0 };
  const allExcept: { exceptType: PartType; delta: number }[] = [];

  for (const p of equipped) {
    for (const e of p.effects) {
      if (e.kind !== 'cost_modifier') continue;
      if (e.targetType === 'all_except') {
        if (e.exceptType) allExcept.push({ exceptType: e.exceptType, delta: e.delta });
      } else {
        byType[e.targetType] += e.delta;
      }
    }
  }
  return { byType, allExcept };
}

// 指定した部位種類の実効接続コストを計算する（最低0）
export function effectiveCostForType(type: PartType, equipped: PartDef[], mods?: CostModifierTotals): (baseCost: number) => number {
  const m = mods ?? collectCostModifiers(equipped);
  let delta = m.byType[type];
  for (const rule of m.allExcept) {
    if (rule.exceptType !== type) delta += rule.delta;
  }
  return (baseCost: number) => Math.max(0, baseCost + delta);
}

export interface CapacityInfo {
  total: number;
  used: number;
  free: number;
  costModifiers: CostModifierTotals;
  instanceCosts: Record<string, number>; // instanceId -> 実効コスト
}

export function computeCapacity(
  equipped: { instanceId: string; def: PartDef }[],
  baseCapacity: number,
  permanentCapacityBonus: number
): CapacityInfo {
  const equippedDefs = equipped.map((e) => e.def);
  const costModifiers = collectCostModifiers(equippedDefs);

  let capacityBonus = 0;
  for (const def of equippedDefs) {
    for (const e of def.effects) {
      if (e.kind === 'capacity_bonus') capacityBonus += e.amount;
    }
  }

  const instanceCosts: Record<string, number> = {};
  let used = 0;
  for (const { instanceId, def } of equipped) {
    const calc = effectiveCostForType(def.type, equippedDefs, costModifiers);
    const cost = calc(def.cost);
    instanceCosts[instanceId] = cost;
    used += cost;
  }

  const total = baseCapacity + permanentCapacityBonus + capacityBonus;
  return { total, used, free: total - used, costModifiers, instanceCosts };
}

// まだ装着していない部位を仮装備した場合の実効コストを見積もる（UI用）
export function previewCostForNewPart(def: PartDef, currentEquippedDefs: PartDef[]): number {
  const nextDefs = [...currentEquippedDefs, def];
  const mods = collectCostModifiers(nextDefs);
  return effectiveCostForType(def.type, nextDefs, mods)(def.cost);
}
