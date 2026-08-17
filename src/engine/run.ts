import type { EnemyDef, EnemyTier, PartDef, PartInstance, Rarity } from '../data/types';
import { WEAK_ARM } from '../data/parts';
import { getDroppableParts, getPartDef, getPartsBySpecies, getSpecialPartDefs } from './adminStore';
import { buildDeepFinalBoss, buildFinalBoss, buildMiniboss, pickEliteEnemy, pickNormalEnemy, scaleEnemy, TIER1_BATTLE_COUNT } from '../data/enemies';
import { computeCapacity, previewCostForNewPart, type CapacityInfo } from './capacity';
import { computeBonusHp } from './modifiers';

export type GamePhase = 'prep' | 'battle' | 'drop' | 'result';
export type BattleSlotType = 'normal' | 'elite' | 'miniboss' | 'boss';

// 第1階層(1-8戦)と同じ配置パターンを第2階層(9-16戦)にも繰り返す。
// 8戦目の'boss'は第1階層ボス(中間ボス)、16戦目の'boss'が真の最終ボスとして扱われる（pickEnemyForSlot参照）。
const TIER_PATTERN: BattleSlotType[] = ['normal', 'normal', 'elite', 'normal', 'miniboss', 'normal', 'elite', 'boss'];
export const BATTLE_SEQUENCE: BattleSlotType[] = [...TIER_PATTERN, ...TIER_PATTERN];
export const TOTAL_BATTLES = BATTLE_SEQUENCE.length;
export { TIER1_BATTLE_COUNT };

// テスト版フィードバックにより、プレイヤー側の基礎耐久を引き上げて難易度を緩和（本番版は100のまま別管理）
export const CORE_HP_BASE = 120;
export const BASE_CAPACITY = 12;
export const BASE_DEFENSE = 2;
// 戦闘勝利後の小休止による自然回復割合（最大HPに対する割合）。
// 心臓・臓器パーツによる戦闘中回復とは別に、8連戦を現実的に成立させるための仮の救済措置。
// テスト版フィードバックにより、連戦の消耗を緩和するため引き上げ（0.35→0.45）。
export const POST_VICTORY_RECOVERY_PCT = 0.45;

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
  const bonus = computeBonusHp(equippedDefs(state));
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
  const newMaxHp = Math.max(1, CORE_HP_BASE + computeBonusHp(newEquipped.map((i) => getPartDef(i.defId))));
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
    // 8戦目は第1階層ボス（中間ボス）、16戦目(最終戦)は覚醒した真の最終ボス
    const enemy = state.battleIndex >= TOTAL_BATTLES ? buildDeepFinalBoss() : buildFinalBoss();
    return { enemy, state };
  }
  if (slot === 'miniboss') {
    const enemy = buildMiniboss(state.usedEliteIds, state.battleIndex);
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

// 'boss'スロットのうち、8戦目は第1階層ボス(中間ボス)、16戦目のみ真の最終ボスとして扱う。
export function isFinalBossBattle(battleIndex: number): boolean {
  return battleIndex >= TOTAL_BATTLES;
}

export function isDeepTierBattle(battleIndex: number): boolean {
  return battleIndex > TIER1_BATTLE_COUNT;
}

// UI表示用の戦闘種別ラベル（8戦目=中間ボス戦、16戦目=最終ボス戦、を区別する）
export function battleSlotLabelForIndex(battleIndex: number): string {
  const slot = BATTLE_SEQUENCE[battleIndex - 1];
  if (slot === 'boss') return isFinalBossBattle(battleIndex) ? '最終ボス戦' : '中間ボス戦';
  if (slot === 'miniboss') return '中ボス戦';
  if (slot === 'elite') return '強敵戦';
  return '通常戦';
}

export function battleSlotLabel(state: RunState): string {
  return battleSlotLabelForIndex(state.battleIndex);
}

// --- ドロップ ---
// レアリティの決め方: 「敵の強さ(tier)に応じた基準レアリティ」をまず決め、候補のほとんどはそのレアリティに揃える。
// そのうえで低確率のみ1段階上のレアリティに“昇格”させる（たまに強い部位が混ざる）。
// 個々の部位アイテムの重み付き抽選ではなく先にレアリティを決める方式にすることで、
// プール内の部位構成（特殊部位の混在など）に左右されず、狙った通りの出現率を保てる。

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare'];

const BASE_RARITY_BY_TIER: Record<EnemyTier, Rarity> = {
  normal: 'common',
  elite: 'uncommon',
  miniboss: 'uncommon',
  boss: 'rare',
};

// 第2階層(9戦目以降)は基準レアリティを1段階引き上げ、「深層へ行くほど明確に強い部位」を表現する。
const BASE_RARITY_BY_TIER_DEEP: Record<EnemyTier, Rarity> = {
  normal: 'uncommon',
  elite: 'rare',
  miniboss: 'rare',
  boss: 'rare',
};

const JACKPOT_CHANCE = 0.18; // 通常時、1候補が1段階上のレアリティになる確率
const JACKPOT_CHANCE_DEEP = 0.25; // 第2階層はやや高め

function rarityForSlot(baseRarity: Rarity, jackpotChance: number): Rarity {
  const baseIdx = RARITY_ORDER.indexOf(baseRarity);
  if (baseIdx < RARITY_ORDER.length - 1 && Math.random() < jackpotChance) {
    return RARITY_ORDER[baseIdx + 1];
  }
  return baseRarity;
}

// 同レアリティ内では dropWeight（省略時1）による相対重み付き抽選を行う。
// 管理画面で個々の部位のドロップ重みを調整すると、ここにそのまま反映される。
function pickFromPoolByRarity(pool: PartDef[], rarity: Rarity, usedIds: Set<string>): PartDef | null {
  const candidates = pool.filter((p) => p.rarity === rarity && !usedIds.has(p.id));
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, p) => sum + Math.max(0.01, p.dropWeight ?? 1), 0);
  let roll = Math.random() * total;
  for (const p of candidates) {
    roll -= Math.max(0.01, p.dropWeight ?? 1);
    if (roll <= 0) return p;
  }
  return candidates[candidates.length - 1];
}

export function generateDropCandidates(enemy: EnemyDef, count = 3, isDeepTier = false): PartDef[] {
  const baseRarity = (isDeepTier ? BASE_RARITY_BY_TIER_DEEP : BASE_RARITY_BY_TIER)[enemy.tier];
  const jackpotChance = isDeepTier ? JACKPOT_CHANCE_DEEP : JACKPOT_CHANCE;
  const species = enemy.species === 'chimera' ? null : enemy.species;
  // 種族プール + 特殊部位（無属性のため、どの種族の敵からでもドロップし得る）。
  // 種族プールが無い場合（最終ボス等）は全部位から抽選。
  const pool = !species || species === 'none' ? getDroppableParts() : [...getPartsBySpecies(species), ...getSpecialPartDefs()];

  const result: PartDef[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < count; i++) {
    const rarity = rarityForSlot(baseRarity, jackpotChance);
    let pick = pickFromPoolByRarity(pool, rarity, usedIds);
    if (!pick) {
      // そのレアリティの在庫が尽きた場合は他のレアリティから補う
      for (const r of RARITY_ORDER) {
        pick = pickFromPoolByRarity(pool, r, usedIds);
        if (pick) break;
      }
    }
    if (!pick) break; // プール自体が尽きた
    usedIds.add(pick.id);
    result.push(pick);
  }
  return result;
}

// --- 戦闘後処理 ---

export function finishBattle(state: RunState, result: 'won' | 'lost', finalPlayerHp: number): RunState {
  if (result === 'lost') {
    return { ...state, coreHp: 0, phase: 'result', resultOutcome: 'defeat' };
  }

  const deepTier = isDeepTierBattle(state.battleIndex);
  const deepWinMult = deepTier ? 2 : 1; // 無限肉芽・増殖細胞は深層で効果2倍
  let capacityGain = 0;
  let extraDropCount = 0;
  for (const def of equippedDefs(state)) {
    for (const e of def.effects) {
      if (e.kind === 'capacity_bonus_on_win') capacityGain += e.amount * deepWinMult;
      if (e.kind === 'extra_drop_candidates') extraDropCount += e.amount;
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
  const candidates = enemy ? generateDropCandidates(enemy, 3 + extraDropCount, deepTier) : [];
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
