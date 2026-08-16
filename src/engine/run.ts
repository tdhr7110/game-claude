import type { EnemyDef, EnemyTier, PartDef, PartInstance, Rarity } from '../data/types';
import { ALL_PARTS, getPartDef, PARTS_BY_SPECIES, WEAK_ARM } from '../data/parts';
import { buildFinalBoss, buildMiniboss, pickEliteEnemy, pickNormalEnemy, scaleEnemy } from '../data/enemies';
import { computeCapacity, previewCostForNewPart, type CapacityInfo } from './capacity';

export type GamePhase = 'prep' | 'battle' | 'drop' | 'result';
export type BattleSlotType = 'normal' | 'elite' | 'miniboss' | 'boss';

export const BATTLE_SEQUENCE: BattleSlotType[] = ['normal', 'normal', 'elite', 'normal', 'miniboss', 'normal', 'elite', 'boss'];
export const TOTAL_BATTLES = BATTLE_SEQUENCE.length;

export const CORE_HP_BASE = 100;
export const BASE_CAPACITY = 12;
export const BASE_DEFENSE = 0;
// 戦闘勝利後の小休止による自然回復割合（最大HPに対する割合）。
// 心臓・臓器パーツによる戦闘中回復とは別に、8連戦を現実的に成立させるための仮の救済措置。
export const POST_VICTORY_RECOVERY_PCT = 0.35;

export interface RunState {
  phase: GamePhase;
  battleIndex: number; // 1-8
  coreHp: number;
  permanentCapacityBonus: number;
  equipped: PartInstance[];
  inventory: PartInstance[];
  currentEnemy: EnemyDef | null;
  dropCandidates: PartDef[];
  lastNormalEnemyId: string | null;
  usedEliteIds: string[];
  resultOutcome: 'victory' | 'defeat' | null;
  instanceSeq: number;
  verboseLog: boolean;
}

function nextInstanceId(state: RunState): [string, RunState] {
  const id = `inst_${state.instanceSeq}`;
  return [id, { ...state, instanceSeq: state.instanceSeq + 1 }];
}

export function createInitialRunState(): RunState {
  let state: RunState = {
    phase: 'prep',
    battleIndex: 1,
    coreHp: CORE_HP_BASE,
    permanentCapacityBonus: 0,
    equipped: [],
    inventory: [],
    currentEnemy: null,
    dropCandidates: [],
    lastNormalEnemyId: null,
    usedEliteIds: [],
    resultOutcome: null,
    instanceSeq: 0,
    verboseLog: false,
  };
  for (let i = 0; i < 2; i++) {
    const [id, next] = nextInstanceId(state);
    state = next;
    state = { ...state, equipped: [...state.equipped, { instanceId: id, defId: WEAK_ARM.id }] };
  }
  return state;
}

export function equippedDefs(state: RunState): PartDef[] {
  return state.equipped.map((i) => getPartDef(i.defId));
}

export function getMaxHp(state: RunState): number {
  const bonus = equippedDefs(state).reduce((sum, d) => sum + d.hpBonus, 0);
  return Math.max(1, CORE_HP_BASE + bonus);
}

export function getCapacityInfo(state: RunState): CapacityInfo {
  const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
  return computeCapacity(equipped, BASE_CAPACITY, state.permanentCapacityBonus);
}

export interface EquipResult {
  state: RunState;
  ok: boolean;
  reason?: string;
}

export function equipPart(state: RunState, instanceId: string): EquipResult {
  const item = state.inventory.find((i) => i.instanceId === instanceId);
  if (!item) return { state, ok: false, reason: '対象の部位がインベントリに見つかりません' };
  const def = getPartDef(item.defId);
  const capacity = getCapacityInfo(state);
  const cost = previewCostForNewPart(def, equippedDefs(state));
  if (cost > capacity.free) {
    return { state, ok: false, reason: `接続容量が足りません（必要${cost} / 空き${capacity.free}）。先に他の部位を取り外してください` };
  }
  const newState: RunState = {
    ...state,
    inventory: state.inventory.filter((i) => i.instanceId !== instanceId),
    equipped: [...state.equipped, item],
  };
  return { state: newState, ok: true };
}

export function unequipPart(state: RunState, instanceId: string): RunState {
  const item = state.equipped.find((i) => i.instanceId === instanceId);
  if (!item) return state;
  const newEquipped = state.equipped.filter((i) => i.instanceId !== instanceId);
  const newMaxHp = Math.max(1, CORE_HP_BASE + newEquipped.reduce((s, i) => s + getPartDef(i.defId).hpBonus, 0));
  return {
    ...state,
    equipped: newEquipped,
    inventory: [...state.inventory, item],
    coreHp: Math.min(state.coreHp, newMaxHp),
  };
}

// --- 敵生成 ---

function pickEnemyForSlot(state: RunState): { enemy: EnemyDef; state: RunState } {
  const slot = BATTLE_SEQUENCE[state.battleIndex - 1];
  if (slot === 'boss') {
    return { enemy: buildFinalBoss(), state };
  }
  if (slot === 'miniboss') {
    const enemy = buildMiniboss(state.usedEliteIds);
    return { enemy, state };
  }
  if (slot === 'elite') {
    const base = pickEliteEnemy(state.usedEliteIds);
    const enemy = scaleEnemy(base, state.battleIndex);
    return { enemy, state: { ...state, usedEliteIds: [...state.usedEliteIds, base.id] } };
  }
  const base = pickNormalEnemy(state.lastNormalEnemyId ?? undefined);
  const enemy = scaleEnemy(base, state.battleIndex);
  return { enemy, state: { ...state, lastNormalEnemyId: base.id } };
}

export function enterBattle(state: RunState): RunState {
  const { enemy, state: next } = pickEnemyForSlot(state);
  return { ...next, phase: 'battle', currentEnemy: enemy };
}

export function tierOfCurrentBattle(state: RunState): BattleSlotType {
  return BATTLE_SEQUENCE[state.battleIndex - 1];
}

// --- ドロップ ---

const RARITY_WEIGHTS: Record<EnemyTier, Record<Rarity, number>> = {
  normal: { common: 70, uncommon: 25, rare: 5 },
  elite: { common: 45, uncommon: 38, rare: 17 },
  miniboss: { common: 25, uncommon: 42, rare: 33 },
  boss: { common: 10, uncommon: 30, rare: 60 },
};

function weightedSampleWithoutReplacement(pool: PartDef[], weights: Record<Rarity, number>, count: number): PartDef[] {
  const remaining = [...pool];
  const result: PartDef[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const total = remaining.reduce((sum, p) => sum + weights[p.rarity], 0);
    let roll = Math.random() * total;
    let pickedIndex = 0;
    for (let j = 0; j < remaining.length; j++) {
      roll -= weights[remaining[j].rarity];
      if (roll <= 0) {
        pickedIndex = j;
        break;
      }
    }
    result.push(remaining[pickedIndex]);
    remaining.splice(pickedIndex, 1);
  }
  return result;
}

export function generateDropCandidates(enemy: EnemyDef, count = 3): PartDef[] {
  const species = enemy.species === 'chimera' ? null : enemy.species;
  if (!species || species === 'none') {
    // 最終ボス等、種族プールが無い場合は全種族から抽選
    return weightedSampleWithoutReplacement(ALL_PARTS.filter((p) => p.species !== 'none'), RARITY_WEIGHTS[enemy.tier], count);
  }
  const pool = PARTS_BY_SPECIES[species];
  return weightedSampleWithoutReplacement(pool, RARITY_WEIGHTS[enemy.tier], Math.min(count, pool.length));
}

// --- 戦闘後処理 ---

export function finishBattle(state: RunState, result: 'won' | 'lost', finalPlayerHp: number): RunState {
  if (result === 'lost') {
    return { ...state, coreHp: 0, phase: 'result', resultOutcome: 'defeat' };
  }

  let capacityGain = 0;
  for (const def of equippedDefs(state)) {
    for (const e of def.effects) {
      if (e.kind === 'capacity_bonus_on_win') capacityGain += e.amount;
    }
  }

  const maxHp = getMaxHp(state);
  const recovered = finalPlayerHp + Math.round(maxHp * POST_VICTORY_RECOVERY_PCT);
  const clampedHp = Math.max(0, Math.min(maxHp, recovered));
  const afterWin: RunState = {
    ...state,
    coreHp: clampedHp,
    permanentCapacityBonus: state.permanentCapacityBonus + capacityGain,
  };

  if (state.battleIndex >= TOTAL_BATTLES) {
    return { ...afterWin, phase: 'result', resultOutcome: 'victory' };
  }

  const enemy = state.currentEnemy;
  const candidates = enemy ? generateDropCandidates(enemy) : [];
  return { ...afterWin, phase: 'drop', dropCandidates: candidates };
}

export interface AcceptDropResult {
  state: RunState;
  equipped: boolean;
  reason?: string;
}

export function acceptDrop(state: RunState, defId: string, wantEquip: boolean): AcceptDropResult {
  const [instanceId, stateWithSeq] = nextInstanceId(state);
  const item: PartInstance = { instanceId, defId };
  const withInventory: RunState = { ...stateWithSeq, inventory: [...stateWithSeq.inventory, item], dropCandidates: [] };

  if (!wantEquip) return { state: withInventory, equipped: false };

  const eq = equipPart(withInventory, instanceId);
  return { state: eq.state, equipped: eq.ok, reason: eq.reason };
}

export function skipDrop(state: RunState): RunState {
  return { ...state, dropCandidates: [] };
}

export function advanceToNextBattle(state: RunState): RunState {
  return { ...state, battleIndex: state.battleIndex + 1, phase: 'prep', currentEnemy: null, dropCandidates: [] };
}

export function resetRun(): RunState {
  return createInitialRunState();
}

// --- デバッグ操作 ---

export function debugAddCapacity(state: RunState, delta: number): RunState {
  return { ...state, permanentCapacityBonus: state.permanentCapacityBonus + delta };
}

export function debugFullHeal(state: RunState): RunState {
  return { ...state, coreHp: getMaxHp(state) };
}

export function debugGrantPart(state: RunState, defId: string): RunState {
  const [instanceId, next] = nextInstanceId(state);
  return { ...next, inventory: [...next.inventory, { instanceId, defId }] };
}

export function toggleVerboseLog(state: RunState): RunState {
  return { ...state, verboseLog: !state.verboseLog };
}
