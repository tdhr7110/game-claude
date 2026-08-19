import type { RunState, GamePhase } from '../engine/run';
import type { EnemyDef, EnemyGimmickEffectDef, EnemyMove, GimmickKind, PartInstance, Species } from '../data/types';
import { PARTS_BY_ID, isKnownPartId } from '../data/parts';
import { RUN_SAVE_KEY } from './storageKeys';
import { safeGetItem, safeRemoveItem, safeSetItem } from './storageAvailability';

// ============================================================
// ラン途中保存(優先6)。TEST10でTEST7(敵候補選択・敵固有ギミック)と統合。
//
// 戦闘中の毎フレーム保存はコストが高く壊れやすいため行わない。
// GameContext側がRunState(フェーズ単位でしか変化しない)をそのまま渡すだけで、
// 結果的に「戦闘準備・敵候補選択・敵選択・戦闘開始直前・戦闘勝利後・ドロップ選択・
// 次戦移動」の各チェックポイントで保存されることになる(戦闘のTick処理はRunStateを
// 一切変更しないため、戦闘中の毎フレーム保存にはならない)。
//
// JSON.parseの結果は無条件でRunStateとして扱わず、必ずスキーマ検証してから使う。
// 検証に失敗した場合(壊れたデータ・古いsaveVersion・localStorage不可)は
// nullを返し、呼び出し側は新規ランとして継続できるようにする。
//
// 敵候補(RunState.enemyCandidates)はRunState内の1箇所でのみ保持する
// (TEST9時代のRunSaveEnvelope.enemyCandidatesという別枠の予約フィールドは廃止した。
// 二重管理すると復元時にどちらが正か曖昧になり、リロードのたびに再抽選される・
// 選んだ敵が変わる、といった不具合の原因になるため)。
// ============================================================

export const RUN_SAVE_VERSION = 2;

const PHASES: GamePhase[] = ['prep', 'enemySelect', 'battle', 'drop', 'result', 'fusion'];

export interface RunSaveEnvelope {
  saveVersion: number;
  savedAt: number;
  state: RunState;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPartInstance(v: unknown): v is PartInstance {
  if (!isPlainObject(v)) return false;
  if (typeof v.instanceId !== 'string' || typeof v.defId !== 'string') return false;
  // 通常部位に加え、融合(TEST16)で生成された部位のdefIdも有効な保存データとして扱う
  // (PARTS_BY_IDだけを見ると融合部位を「未知の部位」として誤って無効化してしまうため)。
  return isKnownPartId(v.defId);
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

// TEST7で追加された、enemyGimmickEngine.tsが解釈するギミック種別。
// ここに含まれない種別のデータは(将来の形式変更等で)復元時に拒否する。
const GIMMICK_KINDS: GimmickKind[] = [
  'poison_ramp',
  'enrage_below_hp',
  'periodic_reflect',
  'burn_stack_explode',
  'evade_charge',
  'stance_cycle',
  'phase_shift_below_hp',
];

function isNumberRecord(v: unknown): v is Record<string, number> {
  if (!isPlainObject(v)) return false;
  return Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isEnemyGimmick(v: unknown): v is EnemyGimmickEffectDef {
  if (!isPlainObject(v)) return false;
  return typeof v.kind === 'string' && GIMMICK_KINDS.includes(v.kind as GimmickKind) && isNumberRecord(v.params);
}

function isMoveTelegraph(v: unknown): boolean {
  if (v === undefined) return true;
  if (!isPlainObject(v)) return false;
  return typeof v.warnBeforeSec === 'number' && typeof v.message === 'string';
}

function isEnemyMove(v: unknown): v is EnemyMove {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.attack === 'number' &&
    typeof v.interval === 'number' &&
    Array.isArray(v.tags) &&
    Array.isArray(v.effects) &&
    typeof v.icon === 'string' &&
    isMoveTelegraph(v.telegraph)
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
    typeof v.color === 'string' &&
    // TEST7: 敵固有ドロップ・敵選択画面向けギミック情報。復元時もここで検証し、
    // 壊れた/旧形式のデータ(bodyPartIds等が欠けたセーブ)を安全に無効化する。
    isStringArray(v.bodyPartIds) &&
    isStringArray(v.rareDropPartIds) &&
    typeof v.gimmickSummary === 'string' &&
    Array.isArray(v.gimmicks) &&
    v.gimmicks.every(isEnemyGimmick)
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
  // TEST7: 敵選択画面用の候補。RunState.enemyCandidatesがこのデータの唯一の正である
  // (RunSaveEnvelope側に候補用の別枠は存在しない)。ここで厳密に検証することで、
  // enemySelectフェーズ中にリロードしても候補が再抽選されず、選んだ敵も
  // 正しく復元されることを保証する。
  if (!Array.isArray(v.enemyCandidates) || !v.enemyCandidates.every(isEnemyDef)) return false;
  if (!Array.isArray(v.dropCandidates) || !v.dropCandidates.every((d) => isPlainObject(d) && typeof d.id === 'string' && isKnownPartId(d.id))) {
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
  // 融合(TEST16)導入前のセーブにはfusionOfferUsedが存在しないため、
  // 型があればbooleanのみ許容し、欠けている場合はreviveRunState側でfalse補完する。
  if (v.fusionOfferUsed !== undefined && typeof v.fusionOfferUsed !== 'boolean') return false;
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
    // 融合(TEST16)導入前のセーブ(fusionOfferUsedが無い)を復元する場合のフォールバック。
    fusionOfferUsed: raw.fusionOfferUsed ?? false,
  };
}

function isRunSaveEnvelope(v: unknown): v is RunSaveEnvelope {
  if (!isPlainObject(v)) return false;
  if (typeof v.saveVersion !== 'number') return false;
  if (typeof v.savedAt !== 'number') return false;
  if (!isRunState(v.state)) return false;
  return true;
}

export function saveRunState(state: RunState): void {
  const envelope: RunSaveEnvelope = {
    saveVersion: RUN_SAVE_VERSION,
    savedAt: Date.now(),
    state,
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
