import { ALL_COMMANDS, type CommandDef } from '../data/commandDefs';
import { ALL_PARTS } from '../data/parts';
import { ENEMY_ROSTER } from '../data/enemyRoster';

// ============================================================
// 収集図鑑(優先7)の状態管理。ランの進行状況(RunState)とは別の
// 「メタ進行(ラン跨ぎで蓄積される記録)」であり、ラン途中保存(runPersistence)や
// ラン本体のロジック(engine/run.ts)には一切触れない純粋関数群。
// ============================================================

export const TOTAL_PART_COUNT = ALL_PARTS.length;

export interface EnemyCodexEntry {
  encounterCount: number;
  defeatCount: number;
  firstEncounteredAt: number;
  firstDefeatedAt: number | null;
}

export interface CodexState {
  discoveredPartIds: string[];
  enemyEntries: Record<string, EnemyCodexEntry>;
}

export function createEmptyCodex(): CodexState {
  return { discoveredPartIds: [], enemyEntries: {} };
}

export function isPartDiscovered(codex: CodexState, partId: string): boolean {
  return codex.discoveredPartIds.includes(partId);
}

// 既に発見済みなら同じ参照をそのまま返す(Reactのstate更新で無駄な再レンダーを起こさないため)。
export function markPartDiscovered(codex: CodexState, partId: string): CodexState {
  if (isPartDiscovered(codex, partId)) return codex;
  return { ...codex, discoveredPartIds: [...codex.discoveredPartIds, partId] };
}

// 複数の部位idをまとめて発見済みにする(装着中+インベントリの差分監視から呼ばれる想定)。
// 同じ部位を複数個所持している場合(例: 初期装備の弱い腕2個)に備え、バッチ内でも重複排除する。
export function markPartsDiscovered(codex: CodexState, partIds: string[]): CodexState {
  const newIds = Array.from(new Set(partIds.filter((id) => !isPartDiscovered(codex, id))));
  if (newIds.length === 0) return codex;
  return { ...codex, discoveredPartIds: [...codex.discoveredPartIds, ...newIds] };
}

function getOrCreateEnemyEntry(codex: CodexState, enemyId: string): EnemyCodexEntry {
  return codex.enemyEntries[enemyId] ?? { encounterCount: 0, defeatCount: 0, firstEncounteredAt: 0, firstDefeatedAt: null };
}

export function isEnemyEncountered(codex: CodexState, enemyId: string): boolean {
  return (codex.enemyEntries[enemyId]?.encounterCount ?? 0) > 0;
}

export function isEnemyDefeated(codex: CodexState, enemyId: string): boolean {
  return (codex.enemyEntries[enemyId]?.defeatCount ?? 0) > 0;
}

export function recordEnemyEncounter(codex: CodexState, enemyId: string, now: number = Date.now()): CodexState {
  const prev = getOrCreateEnemyEntry(codex, enemyId);
  const next: EnemyCodexEntry = {
    ...prev,
    encounterCount: prev.encounterCount + 1,
    firstEncounteredAt: prev.encounterCount === 0 ? now : prev.firstEncounteredAt,
  };
  return { ...codex, enemyEntries: { ...codex.enemyEntries, [enemyId]: next } };
}

export function recordEnemyDefeat(codex: CodexState, enemyId: string, now: number = Date.now()): CodexState {
  const prev = getOrCreateEnemyEntry(codex, enemyId);
  const next: EnemyCodexEntry = {
    ...prev,
    // 撃破は必ず遭遇済みであるはずだが、万一データ不整合があっても遭遇回数を0のままにしない。
    encounterCount: Math.max(prev.encounterCount, 1),
    firstEncounteredAt: prev.encounterCount === 0 ? now : prev.firstEncounteredAt,
    defeatCount: prev.defeatCount + 1,
    firstDefeatedAt: prev.firstDefeatedAt ?? now,
  };
  return { ...codex, enemyEntries: { ...codex.enemyEntries, [enemyId]: next } };
}

export function discoveredPartCount(codex: CodexState): number {
  return codex.discoveredPartIds.length;
}

export function discoveredEnemyCount(codex: CodexState): number {
  return ENEMY_ROSTER.filter((e) => isEnemyEncountered(codex, e.id)).length;
}

// ある部位を装着することで新規解放・進化に関わるコマンドの一覧(部位図鑑の詳細表示用)。
// 部位種類やレアリティによる緩い条件(requiredCategoryCounts等)は「その部位固有」とは
// 言えないため対象外とし、その部位id自身が明示的に関与する条件のみを対象にする。
export function commandsForPart(partId: string): CommandDef[] {
  const result: CommandDef[] = [];
  for (const cmd of ALL_COMMANDS) {
    const direct = cmd.requiredPartIds?.includes(partId) || cmd.requiredPartCounts?.some((r) => r.partId === partId);
    const viaPrefix = cmd.requiredAnyOf?.some((pred) => pred.idPrefix && partId.startsWith(pred.idPrefix));
    if (direct || viaPrefix) result.push(cmd);
  }
  return result;
}
