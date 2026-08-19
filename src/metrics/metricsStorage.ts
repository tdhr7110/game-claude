// ============================================================
// 計測データ(RunMetricsRecord群)のlocalStorage読み書き。
//
// ラン途中保存(persistence/runPersistence.ts)・収集図鑑(persistence/codexPersistence.ts)と
// 同じ「安全な読み書き」方針(storageAvailability.ts)に従う:
// - localStorageが使えない環境でも例外を投げない
// - JSON.parseの結果は無条件で信用せず、必ず形を検証してから使う
// - 保存に失敗しても計測機能だけが無効化され、ゲーム進行自体には影響させない
//
// 保存件数には上限を設け、超えた分は開始日時が古いランから削除する
// (要件: 「保存件数には上限を設け、古いランから削除してください」)。
// ============================================================

import { METRICS_SAVE_KEY } from '../persistence/storageKeys';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../persistence/storageAvailability';
import type {
  BattleDamageBreakdown,
  BattleMetricRecord,
  CommandUsageRecord,
  FinalBuildRecord,
  MetricsExportPayload,
  MetricsStoreV1,
  PartChoiceRecord,
  RunEndReason,
  RunMetricsRecord,
  RunStatus,
  SurveyResponse,
} from './types';

// 保存するラン件数の上限。超過分は startedAt が古いものから削除する。
export const MAX_STORED_RUNS = 300;

export function emptyMetricsStore(): MetricsStoreV1 {
  return { schemaVersion: 1, activeRunId: null, runs: [] };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isNullableStringArray(v: unknown): v is (string | null)[] {
  return Array.isArray(v) && v.every((x) => x === null || typeof x === 'string');
}

const RUN_END_REASONS: RunEndReason[] = ['victory', 'defeat', 'reset', 'abandoned'];
const RUN_STATUSES: RunStatus[] = ['in_progress', 'completed'];

function isCommandUsageRecord(v: unknown): v is CommandUsageRecord {
  return isPlainObject(v) && typeof v.count === 'number' && typeof v.damage === 'number' && typeof v.heal === 'number';
}

function isCommandUsageMap(v: unknown): v is Record<string, CommandUsageRecord> {
  return isPlainObject(v) && Object.values(v).every(isCommandUsageRecord);
}

function isDamageBreakdown(v: unknown): v is BattleDamageBreakdown {
  return isPlainObject(v) && typeof v.auto === 'number' && typeof v.command === 'number' && typeof v.status === 'number';
}

function isPartChoiceRecord(v: unknown): v is PartChoiceRecord {
  if (!isPlainObject(v)) return false;
  if (v.action !== 'equip' && v.action !== 'store' && v.action !== 'skip') return false;
  return v.defId === null || typeof v.defId === 'string';
}

function isBattleMetricRecord(v: unknown): v is BattleMetricRecord {
  if (!isPlainObject(v)) return false;
  if (typeof v.battleIndex !== 'number') return false;
  if (typeof v.slotType !== 'string') return false;
  if (!isStringArray(v.enemyCandidateIds)) return false;
  if (v.chosenEnemyId !== null && typeof v.chosenEnemyId !== 'string') return false;
  if (v.outcome !== 'win' && v.outcome !== 'lose' && v.outcome !== 'abandoned') return false;
  if (v.battleTimeSeconds !== null && typeof v.battleTimeSeconds !== 'number') return false;
  if (v.playerHpRemaining !== null && typeof v.playerHpRemaining !== 'number') return false;
  if (v.playerMaxHp !== null && typeof v.playerMaxHp !== 'number') return false;
  if (v.deathCause !== null && typeof v.deathCause !== 'string') return false;
  if (!isDamageBreakdown(v.damage)) return false;
  if (typeof v.healed !== 'number') return false;
  if (!isCommandUsageMap(v.commandUsage)) return false;
  if (!isNullableStringArray(v.equippedCommandIds)) return false;
  if (v.partCandidateIds !== null && !isStringArray(v.partCandidateIds)) return false;
  if (v.partChoice !== null && !isPartChoiceRecord(v.partChoice)) return false;
  return true;
}

function isFinalBuildRecord(v: unknown): v is FinalBuildRecord {
  return isPlainObject(v) && isStringArray(v.equippedPartIds) && isStringArray(v.activeSynergies);
}

function isSurveyResponse(v: unknown): v is SurveyResponse {
  if (!isPlainObject(v)) return false;
  if (v.fun !== null && ![1, 2, 3, 4, 5].includes(v.fun as number)) return false;
  if (typeof v.confusingPoint !== 'string') return false;
  if (v.wantsReplay !== null && v.wantsReplay !== 'yes' && v.wantsReplay !== 'no' && v.wantsReplay !== 'unsure') return false;
  return typeof v.answeredAt === 'number';
}

function isRunMetricsRecord(v: unknown): v is RunMetricsRecord {
  if (!isPlainObject(v)) return false;
  if (typeof v.runId !== 'string') return false;
  if (typeof v.gameVersion !== 'string') return false;
  if (typeof v.balanceVersion !== 'string') return false;
  if (typeof v.startedAt !== 'number') return false;
  if (v.endedAt !== null && typeof v.endedAt !== 'number') return false;
  if (!RUN_STATUSES.includes(v.status as RunStatus)) return false;
  if (v.endReason !== null && !RUN_END_REASONS.includes(v.endReason as RunEndReason)) return false;
  if (typeof v.battleReached !== 'number') return false;
  if (typeof v.clearedBattles !== 'number') return false;
  if (typeof v.playtimeMs !== 'number') return false;
  if (typeof v.resetCount !== 'number') return false;
  if (!Array.isArray(v.battles) || !v.battles.every(isBattleMetricRecord)) return false;
  if (v.finalBuild !== null && !isFinalBuildRecord(v.finalBuild)) return false;
  if (v.survey !== null && !isSurveyResponse(v.survey)) return false;
  return true;
}

function isMetricsStore(v: unknown): v is MetricsStoreV1 {
  if (!isPlainObject(v)) return false;
  if (v.schemaVersion !== 1) return false;
  if (v.activeRunId !== null && typeof v.activeRunId !== 'string') return false;
  return Array.isArray(v.runs) && v.runs.every(isRunMetricsRecord);
}

// 壊れたJSON・スキーマ不一致の場合は空ストアへフォールバックする
// (要件: 計測の失敗はゲーム進行に影響させない。読み込み失敗を理由に例外を投げない)。
export function loadMetricsStore(): MetricsStoreV1 {
  const raw = safeGetItem(METRICS_SAVE_KEY);
  if (!raw) return emptyMetricsStore();
  try {
    const parsed = JSON.parse(raw);
    if (!isMetricsStore(parsed)) return emptyMetricsStore();
    return parsed;
  } catch {
    return emptyMetricsStore();
  }
}

// startedAtが新しいものを優先して残し、MAX_STORED_RUNS件を超える分は古い順に切り捨てる。
export function trimRuns(runs: RunMetricsRecord[], max = MAX_STORED_RUNS): RunMetricsRecord[] {
  if (runs.length <= max) return runs;
  return [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, max);
}

export function saveMetricsStore(store: MetricsStoreV1): void {
  const trimmed: MetricsStoreV1 = { ...store, runs: trimRuns(store.runs) };
  try {
    safeSetItem(METRICS_SAVE_KEY, JSON.stringify(trimmed));
  } catch {
    // JSON.stringifyが失敗するような循環参照はこのデータ構造上起こらないが、
    // 念のため保存失敗はゲーム進行に影響させない。
  }
}

// 同じrunIdのランを差し替える(なければ追加する)。呼び出し側は完成した1件を渡すだけでよい。
export function upsertRun(store: MetricsStoreV1, run: RunMetricsRecord): MetricsStoreV1 {
  const idx = store.runs.findIndex((r) => r.runId === run.runId);
  const runs = idx >= 0 ? store.runs.map((r, i) => (i === idx ? run : r)) : [...store.runs, run];
  return { ...store, runs: trimRuns(runs) };
}

export function clearAllMetrics(): void {
  safeRemoveItem(METRICS_SAVE_KEY);
}

export function buildExportPayload(store: MetricsStoreV1, gameVersion: string, balanceVersion: string): MetricsExportPayload {
  return { schemaVersion: 1, exportedAt: Date.now(), gameVersion, balanceVersion, runs: store.runs };
}

export function exportMetricsJson(store: MetricsStoreV1, gameVersion: string, balanceVersion: string): string {
  return JSON.stringify(buildExportPayload(store, gameVersion, balanceVersion), null, 2);
}

export interface ImportResult {
  ok: boolean;
  importedCount: number;
  reason?: string;
}

// インポートしたランは、runIdが既存と衝突する場合のみ上書きし、それ以外は追加する(マージ)。
// 形式が不正なJSONは何も変更せずエラー理由を返す。
export function parseImportedRuns(json: string): { ok: true; runs: RunMetricsRecord[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'JSONの形式が不正です' };
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.runs) || !parsed.runs.every(isRunMetricsRecord)) {
    return { ok: false, reason: '計測データの形式が不正です(schemaVersion不一致・壊れたデータの可能性があります)' };
  }
  return { ok: true, runs: parsed.runs as RunMetricsRecord[] };
}

export function mergeImportedRuns(store: MetricsStoreV1, imported: RunMetricsRecord[]): MetricsStoreV1 {
  let next = store;
  for (const run of imported) next = upsertRun(next, run);
  return next;
}
