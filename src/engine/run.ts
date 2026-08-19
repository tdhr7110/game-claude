import type { EnemyDef, EnemyTier, PartDef, PartInstance, Rarity } from '../data/types';
import { getPartDef, WEAK_ARM } from '../data/parts';
import {
  buildDeepFinalBoss,
  buildEliteCandidates,
  buildFinalBoss,
  buildMinibossCandidates,
  buildNormalCandidates,
  TIER1_BATTLE_COUNT,
} from '../data/enemies';
import { computeCapacity, previewCostForNewPart, type CapacityInfo } from './capacity';
import { computeBonusHp } from './modifiers';
import { COMMAND_BALANCE, DEFAULT_COMMAND_LOADOUT, resolveFamilyBestCommand } from '../data/commandDefs';

export type GamePhase = 'prep' | 'enemySelect' | 'battle' | 'drop' | 'result';
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
  // TEST7: 敵選択画面用に生成した候補。再描画・画面移動で再抽選されないようRunStateへ保持する。
  enemyCandidates: EnemyDef[];
  dropCandidates: PartDef[];
  lastNormalEnemyId: string | null;
  usedEliteIds: string[];
  resultOutcome: 'victory' | 'defeat' | null;
  instanceSeq: number;
  verboseLog: boolean;
  // コマンドシステム(TEST5): 4枠ぶんのfamilyId。nullは空き枠。
  // familyIdで持つことで、部位構成によって進化後の技が自動的に反映される。
  commandLoadout: (string | null)[];
  // コマンド獲得・進化演出(TEST6): 一度でも解放・進化を確認したcommandIdの一覧。
  // 同じコマンドを再度装着し直しても演出が重複発生しないようにするための既知リスト。
  knownCommandIds: string[];
  // まだ報酬演出またはコマンド編集画面で確認していないcommandIdの一覧。
  // 下部ナビゲーション「コマンド」のNEWバッジ表示に使う。
  unseenCommandIds: string[];
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
    enemyCandidates: [],
    dropCandidates: [],
    lastNormalEnemyId: null,
    usedEliteIds: [],
    resultOutcome: null,
    instanceSeq: 0,
    verboseLog: false,
    commandLoadout: [...DEFAULT_COMMAND_LOADOUT],
    knownCommandIds: [],
    unseenCommandIds: [],
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

// 装着部位が変わったことで条件を満たさなくなったコマンド枠を自動的に解除する。
// （「部位条件を満たさなくなったコマンドは装備解除する」要件のための共通処理）
function pruneIneligibleCommandSlots(state: RunState): RunState {
  const defs = equippedDefs(state);
  const nextLoadout = state.commandLoadout.map((familyId) => {
    if (!familyId) return null;
    return resolveFamilyBestCommand(familyId, defs) ? familyId : null;
  });
  return { ...state, commandLoadout: nextLoadout };
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
  return { state: pruneIneligibleCommandSlots(newState), ok: true };
}

export function unequipPart(state: RunState, instanceId: string): RunState {
  const item = state.equipped.find((i) => i.instanceId === instanceId);
  if (!item) return state;
  const newEquipped = state.equipped.filter((i) => i.instanceId !== instanceId);
  const newMaxHp = Math.max(1, CORE_HP_BASE + computeBonusHp(newEquipped.map((i) => getPartDef(i.defId))));
  const newState: RunState = {
    ...state,
    equipped: newEquipped,
    inventory: [...state.inventory, item],
    coreHp: Math.min(state.coreHp, newMaxHp),
  };
  return pruneIneligibleCommandSlots(newState);
}

// --- コマンド装備 ---

export interface SetCommandSlotResult {
  state: RunState;
  ok: boolean;
  reason?: string;
}

// 指定した枠にfamilyIdを装備する。同じfamilyIdが他の枠に既にあれば、そちらは空にする
// (「同じコマンドを複数枠へ装備できない」要件を、上書きではなく移動として扱う)。
// nullを渡すとその枠を空にする。
export function setCommandSlot(state: RunState, slotIndex: number, familyId: string | null): SetCommandSlotResult {
  if (slotIndex < 0 || slotIndex >= COMMAND_BALANCE.maxCommandSlots) {
    return { state, ok: false, reason: '不正な枠番号です' };
  }
  if (familyId) {
    const resolved = resolveFamilyBestCommand(familyId, equippedDefs(state));
    if (!resolved) return { state, ok: false, reason: '現在の装着部位ではこのコマンドを解放できません' };
  }
  const nextLoadout = state.commandLoadout.map((f, i) => {
    if (i === slotIndex) return familyId;
    if (familyId && f === familyId) return null; // 他の枠にあれば移動
    return f;
  });
  return { state: { ...state, commandLoadout: nextLoadout }, ok: true };
}

// 部位獲得後に新しく解放・進化したコマンドを「既知」「未確認」として記録する。
// (「同じコマンドを二重獲得しない」「NEWバッジ表示」要件のための共通処理)
export function recordCommandDiscoveries(state: RunState, commandIds: string[]): RunState {
  if (commandIds.length === 0) return state;
  const known = new Set(state.knownCommandIds);
  const unseen = new Set(state.unseenCommandIds);
  for (const id of commandIds) {
    known.add(id);
    unseen.add(id);
  }
  return { ...state, knownCommandIds: Array.from(known), unseenCommandIds: Array.from(unseen) };
}

// 指定したcommandId(省略時は全て)を「確認済み」にし、NEWバッジを解除する。
export function markCommandsSeen(state: RunState, commandIds?: string[]): RunState {
  if (!commandIds) return state.unseenCommandIds.length === 0 ? state : { ...state, unseenCommandIds: [] };
  const remove = new Set(commandIds);
  return { ...state, unseenCommandIds: state.unseenCommandIds.filter((id) => !remove.has(id)) };
}

// --- 敵生成(TEST7: 敵選択) ---
// 通常戦・強敵戦・中ボス戦は同じ戦闘ランクから重複しない3体を提示し、
// 最終ボス戦(中間ボスも含む'boss'スロット)は固定1体のみを提示する。
// 生成した候補はRunStateへ保持し、再描画や画面移動で再抽選されないようにする。

function buildCandidatesForSlot(state: RunState): EnemyDef[] {
  const slot = BATTLE_SEQUENCE[state.battleIndex - 1];
  if (slot === 'boss') {
    // 8戦目は第1階層ボス（中間ボス）、16戦目(最終戦)は覚醒した真の最終ボス。母体は1体のみ。
    const enemy = state.battleIndex >= TOTAL_BATTLES ? buildDeepFinalBoss() : buildFinalBoss();
    return [enemy];
  }
  if (slot === 'miniboss') {
    return buildMinibossCandidates(state.battleIndex, 3);
  }
  if (slot === 'elite') {
    return buildEliteCandidates(state.battleIndex, 3);
  }
  return buildNormalCandidates(state.battleIndex, state.lastNormalEnemyId ?? undefined, 3);
}

export function enterEnemySelect(state: RunState): RunState {
  return { ...state, phase: 'enemySelect', enemyCandidates: buildCandidatesForSlot(state) };
}

// 敵選択元のidから、通常敵/強敵の素体idを推定する(中ボスは"<eliteId>_miniboss"の形式)。
// lastNormalEnemyId・usedEliteIdsの更新にのみ使う表示非依存の内部ヘルパー。
function baseEnemyId(enemy: EnemyDef): string {
  return enemy.id.endsWith('_miniboss') ? enemy.id.slice(0, -'_miniboss'.length) : enemy.id;
}

export interface ChooseEnemyResult {
  state: RunState;
  ok: boolean;
  reason?: string;
}

export function chooseEnemy(state: RunState, enemyId: string): ChooseEnemyResult {
  const chosen = state.enemyCandidates.find((e) => e.id === enemyId);
  if (!chosen) return { state, ok: false, reason: '指定された敵候補が見つかりません' };

  const slot = BATTLE_SEQUENCE[state.battleIndex - 1];
  let next: RunState = { ...state, phase: 'battle', currentEnemy: chosen, enemyCandidates: [] };
  if (slot === 'normal') next = { ...next, lastNormalEnemyId: baseEnemyId(chosen) };
  if (slot === 'elite') next = { ...next, usedEliteIds: [...next.usedEliteIds, baseEnemyId(chosen)] };
  return { state: next, ok: true };
}

// デバッグ・シミュレーション用: 選択画面を経由せず最初の候補で即座に戦闘へ入る。
export function enterBattle(state: RunState): RunState {
  const withCandidates = enterEnemySelect(state);
  const first = withCandidates.enemyCandidates[0];
  return chooseEnemy(withCandidates, first.id).state;
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

// TEST7: 敵が実際に持つ部位(bodyPartIds)からのみ通常ドロップを抽選する。
// レア部位(rareDropPartIds)は敵ランクに応じた低確率の別枠として扱う。
const RARE_DROP_CHANCE_BY_TIER: Record<EnemyTier, number> = {
  normal: 0.06,
  elite: 0.1,
  miniboss: 0.13,
  boss: 0.16,
};
const RARE_DROP_CHANCE_DEEP_BONUS = 0.04; // 深層はレア枠の出現確率をやや底上げする

function rarityForSlot(baseRarity: Rarity, jackpotChance: number): Rarity {
  const baseIdx = RARITY_ORDER.indexOf(baseRarity);
  if (baseIdx < RARITY_ORDER.length - 1 && Math.random() < jackpotChance) {
    return RARITY_ORDER[baseIdx + 1];
  }
  return baseRarity;
}

function pickFromPoolByRarity(pool: PartDef[], rarity: Rarity, usedIds: Set<string>): PartDef | null {
  const candidates = pool.filter((p) => p.rarity === rarity && !usedIds.has(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function pickRandomExcluding(pool: PartDef[], usedIds: Set<string>): PartDef | null {
  const candidates = pool.filter((p) => !usedIds.has(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// 敵選択画面に表示されなかった部位が通常ドロップとして出現しないよう、
// 抽選プールは常にこの敵のbodyPartIds(通常枠)とrareDropPartIds(レア枠)だけに限定する。
// extra_drop_candidates(完全捕食)はcountを増やすだけで、プール自体は変えない。
export function generateDropCandidates(enemy: EnemyDef, count = 3, isDeepTier = false): PartDef[] {
  const baseRarity = (isDeepTier ? BASE_RARITY_BY_TIER_DEEP : BASE_RARITY_BY_TIER)[enemy.tier];
  const jackpotChance = isDeepTier ? JACKPOT_CHANCE_DEEP : JACKPOT_CHANCE;
  const rareChance = RARE_DROP_CHANCE_BY_TIER[enemy.tier] + (isDeepTier ? RARE_DROP_CHANCE_DEEP_BONUS : 0);

  const bodyPool = enemy.bodyPartIds.map(getPartDef);
  const rarePool = enemy.rareDropPartIds.map(getPartDef);

  const result: PartDef[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < count; i++) {
    let pick: PartDef | null = null;
    if (rarePool.length > 0 && Math.random() < rareChance) {
      pick = pickRandomExcluding(rarePool, usedIds);
    }
    if (!pick) {
      const rarity = rarityForSlot(baseRarity, jackpotChance);
      pick = pickFromPoolByRarity(bodyPool, rarity, usedIds);
      if (!pick) {
        // そのレアリティの在庫が尽きた場合は、この敵の通常部位プール内の他レアリティから補う
        for (const r of RARITY_ORDER) {
          pick = pickFromPoolByRarity(bodyPool, r, usedIds);
          if (pick) break;
        }
      }
    }
    if (!pick) pick = pickRandomExcluding(rarePool, usedIds); // 通常枠が尽きた場合のみレア枠から補う
    if (!pick) break; // この敵のドロッププール自体が尽きた
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
  return { ...state, battleIndex: state.battleIndex + 1, phase: 'prep', currentEnemy: null, enemyCandidates: [], dropCandidates: [] };
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

// コマンドシステムTEST用: 部位を付与し、容量が足りればその場で装着まで行う(条件確認をすばやく試すため)。
export function debugGrantAndEquipPart(state: RunState, defId: string): RunState {
  const [instanceId, next] = nextInstanceId(state);
  const withInventory: RunState = { ...next, inventory: [...next.inventory, { instanceId, defId }] };
  return equipPart(withInventory, instanceId).state;
}

export function toggleVerboseLog(state: RunState): RunState {
  return { ...state, verboseLog: !state.verboseLog };
}
