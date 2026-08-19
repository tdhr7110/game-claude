import type { RunState, GamePhase } from '../engine/run';
import type { EnemyDef, EnemyMove, PartInstance, Species } from '../data/types';
import { PARTS_BY_ID } from '../data/parts';
import { RUN_SAVE_KEY } from './storageKeys';
import { safeGetItem, safeRemoveItem, safeSetItem } from './storageAvailability';

// ============================================================
// ラン途中保存(優先6)。
//
// 戦闘中の毎フレーム保存はコストが高く壊れやすいため行わない。
// GameContext側がRunState(フェーズ単位でしか変化しない)をそのまま渡すだけで、
// 結果的に「戦闘準備・敵選択・戦闘開始直前・戦闘勝利後・ドロップ選択・次戦移動」の
// 各チェックポイントで保存されることになる(戦闘のTick処理はRunStateを一切
// 変更しないため、戦闘中の毎フレーム保存にはならない)。
//
// JSON.parseの結果は無条件でRunStateとして扱わず、必ずスキーマ検証してから使う。
// 検証に失敗した場合(壊れたデータ・古いsaveVersion・localStorage不可)は
// nullを返し、呼び出し側は新規ランとして継続できるようにする。
// ============================================================

export const RUN_SAVE_VERSION = 1;

const PHASES: GamePhase[] = ['prep', 'battle', 'drop', 'result'];

export interface RunSaveEnvelope {
  saveVersion: number;
  savedAt: number;
  state: RunState;
  // 将来「敵候補から選ぶ」演出が追加された場合のための予約フィールド。
  // 現行仕様には敵候補選択の概念がないため、常に空配列で保存される。
  enemyCandidates: EnemyDef[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPartInstance(v: unknown): v is PartInstance {
  if (!isPlainObject(v)) return false;
  if (typeof v.instanceId !== 'string' || typeof v.defId !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(PARTS_BY_ID, v.defId);
}

function isPartInstanceArray(v: unknown): v is PartInstance[] {
  return Array.isArray(v) && v.every(isPartInstance);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isNullableStringArray(v: unknown): v is (string | null)[] {
  return Array.isArray(v) && v.every((x) => x === null || typeof x === 'string');
}

const SPECIES: (Species | 'chimera')[] = ['insect', 'golem', 'dragon', 'none', 'chimera'];
const TIERS = ['normal', 'elite', 'miniboss', 'boss'];

function isEnemyMove(v: unknown): v is EnemyMove {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.attack === 'number' &&
    typeof v.interval === 'number' &&
    Array.isArray(v.tags) &&
    Array.isArray(v.effects) &&
    typeof v.icon === 'string'
  );
}

function isEnemyDef(v: unknown): v is EnemyDef {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.species === 'string' &&
    SPECIES.includes(v.species as Species | 'chimera') &&
    typeof v.tier === 'string' &&
    TIERS.includes(v.tier as string) &&
    typeof v.hp === 'number' &&
    typeof v.defense === 'number' &&
    typeof v.damageReductionPct === 'number' &&
    typeof v.evasionPct === 'number' &&
    Array.isArray(v.moves) &&
    v.moves.every(isEnemyMove) &&
    typeof v.description === 'string' &&
    typeof v.icon === 'string' &&
    typeof v.color === 'string'
  );
}

function isRunState(v: unknown): v is RunState {
  if (!isPlainObject(v)) return false;
  if (typeof v.phase !== 'string' || !PHASES.includes(v.phase as GamePhase)) return false;
  if (typeof v.battleIndex !== 'number' || !Number.isFinite(v.battleIndex) || v.battleIndex < 1) return false;
  if (typeof v.coreHp !== 'number' || !Number.isFinite(v.coreHp)) return false;
  if (typeof v.permanentCapacityBonus !== 'number' || !Number.isFinite(v.permanentCapacityBonus)) return false;
  if (!isPartInstanceArray(v.equipped)) return false;
  if (!isPartInstanceArray(v.inventory)) return false;
  if (v.currentEnemy !== null && !isEnemyDef(v.currentEnemy)) return false;
  if (!Array.isArray(v.dropCandidates) || !v.dropCandidates.every((d) => isPlainObject(d) && typeof d.id === 'string' && Object.prototype.hasOwnProperty.call(PARTS_BY_ID, d.id))) {
    return false;
  }
  if (v.lastNormalEnemyId !== null && typeof v.lastNormalEnemyId !== 'string') return false;
  if (!isStringArray(v.usedEliteIds)) return false;
  if (v.resultOutcome !== null && v.resultOutcome !== 'victory' && v.resultOutcome !== 'defeat') return false;
  if (typeof v.instanceSeq !== 'number' || !Number.isFinite(v.instanceSeq)) return false;
  if (typeof v.verboseLog !== 'boolean') return false;
  if (!isNullableStringArray(v.commandLoadout)) return false;
  if (!isStringArray(v.knownCommandIds)) return false;
  if (!isStringArray(v.unseenCommandIds)) return false;
  return true;
}

// dropCandidatesはPartDef本体を保存しているため、復元時はマスターデータ(PARTS_BY_ID)
// から実体を引き直す(保存されたオブジェクトをそのまま信用しない)。
function reviveRunState(raw: RunState): RunState {
  return {
    ...raw,
    equipped: raw.equipped.map((i) => ({ instanceId: i.instanceId, defId: i.defId })),
    inventory: raw.inventory.map((i) => ({ instanceId: i.instanceId, defId: i.defId })),
    dropCandidates: raw.dropCandidates.map((d) => PARTS_BY_ID[d.id]),
  };
}

function isRunSaveEnvelope(v: unknown): v is RunSaveEnvelope {
  if (!isPlainObject(v)) return false;
  if (typeof v.saveVersion !== 'number') return false;
  if (typeof v.savedAt !== 'number') return false;
  if (!isRunState(v.state)) return false;
  if (!Array.isArray(v.enemyCandidates) || !v.enemyCandidates.every(isEnemyDef)) return false;
  return true;
}

export function saveRunState(state: RunState): void {
  const envelope: RunSaveEnvelope = {
    saveVersion: RUN_SAVE_VERSION,
    savedAt: Date.now(),
    state,
    enemyCandidates: [],
  };
  try {
    safeSetItem(RUN_SAVE_KEY, JSON.stringify(envelope));
  } catch {
    // JSON.stringifyが失敗するような循環参照等はRunStateの構造上起こり得ないが、
    // 念のため保存失敗はゲーム進行に影響させない。
  }
}

// 保存されたラン途中データを読み込む。壊れたJSON・スキーマ不一致・
// saveVersion不一致(将来の形式変更に対応しない)の場合はすべてnullを返し、
// 呼び出し側は新規ランとして安全に継続できる。
export function loadRunState(): RunState | null {
  const raw = safeGetItem(RUN_SAVE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRunSaveEnvelope(parsed)) return null;
  if (parsed.saveVersion !== RUN_SAVE_VERSION) return null;
  return reviveRunState(parsed.state);
}

export function hasValidRunSave(): boolean {
  return loadRunState() !== null;
}

export function clearRunSave(): void {
  safeRemoveItem(RUN_SAVE_KEY);
}
