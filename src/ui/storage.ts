import type { RunState } from '../engine/run';

// ============================================================
// セーブ領域まわりの共通ユーティリティ。
//
// GitHub PagesではTESTごとのビルドが同じオリジン配下の別サブパス
// （/game-claude/ , /game-claude/test10/ , /game-claude/test13/ ...）へ
// 同時デプロイされる。localStorageはオリジン単位でしか分離されないため、
// キーにビルドのベースパス（import.meta.env.BASE_URL）を混ぜ込み、
// TESTバージョン間・本番とTESTの間でセーブ領域が混ざらないようにする。
// ============================================================

function currentNamespace(): string {
  try {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL;
    return typeof base === 'string' && base.length > 0 ? base : '/';
  } catch {
    return '/';
  }
}

function storageKey(name: string): string {
  return `chimera-battle:${currentNamespace()}:${name}`;
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readRaw(key: string): string | null {
  if (!hasLocalStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存容量オーバーなどは無視する（補助的な永続化のため、進行自体は止めない）
  }
}

function removeRaw(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // 無視
  }
}

// ------------------------------------------------------------
// ラン進行セーブ（「つづきから」用）
// ------------------------------------------------------------

export const RUN_SAVE_VERSION = 1;

interface RunSaveEnvelopeV1 {
  saveVersion: 1;
  run: RunState;
  savedAt: number;
}

const RUN_SAVE_KEY = storageKey('run-save');

// バージョン不明・壊れたセーブは復元を諦めて null を返す（新しいランを始めれば上書きされる）。
// 将来saveVersionを上げる際は、ここに `if (raw.saveVersion === N) return migrateFromN(raw)` を
// 追加していく（migrationチェーン）。
export function parseRunSave(raw: string): RunState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const envelope = parsed as Partial<RunSaveEnvelopeV1>;
  if (envelope.saveVersion !== RUN_SAVE_VERSION) return null;
  if (!envelope.run || typeof envelope.run !== 'object') return null;
  const run = envelope.run as RunState;
  if (typeof run.phase !== 'string' || typeof run.battleIndex !== 'number' || !Array.isArray(run.equipped)) return null;
  return run;
}

export function serializeRunSave(run: RunState): string {
  const envelope: RunSaveEnvelopeV1 = { saveVersion: RUN_SAVE_VERSION, run, savedAt: Date.now() };
  return JSON.stringify(envelope);
}

export function saveRun(run: RunState): void {
  writeRaw(RUN_SAVE_KEY, serializeRunSave(run));
}

export function loadRun(): RunState | null {
  const raw = readRaw(RUN_SAVE_KEY);
  if (!raw) return null;
  return parseRunSave(raw);
}

export function clearRunSave(): void {
  removeRaw(RUN_SAVE_KEY);
}

export function hasContinuableRun(): boolean {
  const run = loadRun();
  return run !== null && !!run.coreId;
}

// ------------------------------------------------------------
// キメラ図鑑（既存機能。TEST領域分離のためキーだけ新しい命名規則に揃える）
// ------------------------------------------------------------

export interface NamedChimeraLike {
  id: string;
  name: string;
  outcome: 'victory' | 'defeat';
  battleReached: number;
  icons: string[];
  partIds: string[];
  permanentCapacityBonus: number;
  createdAt: number;
}

const GALLERY_KEY = storageKey('gallery-v1');

export function loadGallery<T extends NamedChimeraLike>(): T[] {
  const raw = readRaw(GALLERY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Omit<T, 'partIds' | 'permanentCapacityBonus'> & { partIds?: unknown; permanentCapacityBonus?: unknown } =>
          !!c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.icons) && typeof c.createdAt === 'number'
      )
      .map(
        (c) =>
          ({
            ...c,
            partIds: Array.isArray(c.partIds) ? c.partIds : [],
            permanentCapacityBonus: typeof c.permanentCapacityBonus === 'number' ? c.permanentCapacityBonus : 0,
          }) as T
      );
  } catch {
    return [];
  }
}

export function saveGallery<T extends NamedChimeraLike>(gallery: T[]): void {
  writeRaw(GALLERY_KEY, JSON.stringify(gallery));
}

// ------------------------------------------------------------
// 設定（音量・ヒント既読状態）
// ------------------------------------------------------------

export interface Settings {
  volume: number; // 0-100
}

const DEFAULT_SETTINGS: Settings = { volume: 70 };
const SETTINGS_KEY = storageKey('settings-v1');

export function loadSettings(): Settings {
  const raw = readRaw(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    const volume = typeof parsed?.volume === 'number' && Number.isFinite(parsed.volume) ? Math.max(0, Math.min(100, parsed.volume)) : DEFAULT_SETTINGS.volume;
    return { volume };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  writeRaw(SETTINGS_KEY, JSON.stringify(settings));
}

const HINTS_SEEN_KEY = storageKey('hints-seen-v1');

export function loadSeenHintIds(): string[] {
  const raw = readRaw(HINTS_SEEN_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function saveSeenHintIds(ids: string[]): void {
  writeRaw(HINTS_SEEN_KEY, JSON.stringify(ids));
}

export function clearSeenHintIds(): void {
  removeRaw(HINTS_SEEN_KEY);
}
