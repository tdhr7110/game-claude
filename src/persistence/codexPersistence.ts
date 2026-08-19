import type { CodexState, EnemyCodexEntry } from '../engine/codex';
import { createEmptyCodex } from '../engine/codex';
import { PARTS_BY_ID } from '../data/parts';
import { ENEMY_ROSTER_BY_ID } from '../data/enemyRoster';
import { CODEX_SAVE_KEY } from './storageKeys';
import { safeGetItem, safeSetItem } from './storageAvailability';

// ============================================================
// 収集図鑑(部位図鑑・敵図鑑)の保存。命名キメラ図鑑は既存の
// GameContext.tsx 内の仕組み(chimera-battle:gallery:v1)をそのまま使い続けるため
// ここでは扱わない(既存データを失わないため、あえて統合・移行しない)。
//
// ラン途中保存とは異なり、壊れたJSONやバージョン不一致は「空の図鑑」として
// 継続し、部分的に読み取れるデータ(存在しない部位/敵idを除いた残り)は
// できるだけ活かす(図鑑データはRunStateのような整合性制約がなく、
// 部分喪失してもゲーム進行自体には影響しないため)。
// ============================================================

export const CODEX_SAVE_VERSION = 1;

interface CodexSaveEnvelope {
  saveVersion: number;
  savedAt: number;
  codex: CodexState;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeDiscoveredPartIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  for (const id of v) {
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(PARTS_BY_ID, id)) seen.add(id);
  }
  return Array.from(seen);
}

function sanitizeEnemyEntry(v: unknown): EnemyCodexEntry | null {
  if (!isPlainObject(v)) return null;
  const encounterCount = typeof v.encounterCount === 'number' && v.encounterCount >= 0 ? v.encounterCount : 0;
  const defeatCount = typeof v.defeatCount === 'number' && v.defeatCount >= 0 ? v.defeatCount : 0;
  const firstEncounteredAt = typeof v.firstEncounteredAt === 'number' ? v.firstEncounteredAt : 0;
  const firstDefeatedAt = typeof v.firstDefeatedAt === 'number' ? v.firstDefeatedAt : null;
  if (encounterCount === 0 && defeatCount === 0) return null;
  return { encounterCount, defeatCount, firstEncounteredAt, firstDefeatedAt };
}

function sanitizeEnemyEntries(v: unknown): Record<string, EnemyCodexEntry> {
  if (!isPlainObject(v)) return {};
  const result: Record<string, EnemyCodexEntry> = {};
  for (const [enemyId, entry] of Object.entries(v)) {
    if (!Object.prototype.hasOwnProperty.call(ENEMY_ROSTER_BY_ID, enemyId)) continue;
    const sanitized = sanitizeEnemyEntry(entry);
    if (sanitized) result[enemyId] = sanitized;
  }
  return result;
}

function sanitizeCodexState(v: unknown): CodexState {
  if (!isPlainObject(v)) return createEmptyCodex();
  return {
    discoveredPartIds: sanitizeDiscoveredPartIds(v.discoveredPartIds),
    enemyEntries: sanitizeEnemyEntries(v.enemyEntries),
  };
}

export function saveCodexState(codex: CodexState): void {
  const envelope: CodexSaveEnvelope = { saveVersion: CODEX_SAVE_VERSION, savedAt: Date.now(), codex };
  try {
    safeSetItem(CODEX_SAVE_KEY, JSON.stringify(envelope));
  } catch {
    // 保存失敗は図鑑の記録漏れに留め、ゲーム進行自体には影響させない。
  }
}

// 壊れたJSON・saveVersion不一致の場合は空の図鑑を返す(新規記録として継続)。
// 部分的に壊れた項目(存在しない部位/敵id等)は個別に除外するだけで、
// 図鑑全体は破棄しない。
export function loadCodexState(): CodexState {
  const raw = safeGetItem(CODEX_SAVE_KEY);
  if (!raw) return createEmptyCodex();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createEmptyCodex();
  }
  if (!isPlainObject(parsed) || typeof parsed.saveVersion !== 'number' || parsed.saveVersion !== CODEX_SAVE_VERSION) {
    return createEmptyCodex();
  }
  return sanitizeCodexState(parsed.codex);
}
