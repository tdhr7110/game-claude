// ============================================================
// 能力管理基盤の中核ストア。
//
// 役割:
//   - 部位マスターデータ(data/parts.ts の静的定義)を「唯一の初期値」として保持しつつ、
//     管理画面からの上書き(partPatches)・新規部位(customParts)・無効化(disabledPartIds)・
//     シナジー閾値の調整(synergyPatches)を重ねた「有効な部位データ」を1箇所から提供する。
//   - 戦闘・図鑑・ドロップ・管理画面はすべてこのストアの getPartDef 等を経由することで、
//     同じ数値を別々に管理する状態を避ける（要件3）。
//   - テスト版のみで使う機能のため、localStorage(chimera-battle:admin-overrides:v1)へ保存する。
//     正式版のゲームデータ(data/parts.ts等の静的ファイル)には一切書き込まない。
// ============================================================

import type { PartDef, PartType, Species, SynergyTier } from '../data/types';
import { ALL_PARTS, WEAK_ARM } from '../data/parts';
import { PART_TYPE_SYNERGIES, SPECIES_SYNERGIES } from '../data/synergies';
import { SPECIAL_ABILITIES } from '../data/specialAbilities';
import type { AdminPersistedState, ChangeLogEntry, PartPatch, SpecialAbilityDef } from '../data/adminTypes';
import { applySpecialAbilityParams, readSpecialAbilityParams } from './specialAbilityHandlers';

// TEST2環境専用のnamespaceを付与し、TEST1のBALANCE調整データと衝突しないようにする
const STORAGE_KEY = 'chimera-battle:test2:admin-overrides:v1';
const MAX_LOG_ENTRIES = 60;

function emptyState(): AdminPersistedState {
  return { version: 1, partPatches: {}, customParts: [], disabledPartIds: [], synergyPatches: {}, changeLog: [] };
}

function loadState(): AdminPersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      version: 1,
      partPatches: parsed.partPatches ?? {},
      customParts: Array.isArray(parsed.customParts) ? parsed.customParts : [],
      disabledPartIds: Array.isArray(parsed.disabledPartIds) ? parsed.disabledPartIds : [],
      synergyPatches: parsed.synergyPatches ?? {},
      changeLog: Array.isArray(parsed.changeLog) ? parsed.changeLog : [],
    };
  } catch {
    return emptyState();
  }
}

let state: AdminPersistedState = loadState();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存失敗（容量超過等）はテスト補助機能のため黙って無視する
  }
}

function notify() {
  persist();
  for (const l of listeners) l();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function pushLog(summary: string) {
  const entry: ChangeLogEntry = { id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), summary };
  state.changeLog = [entry, ...state.changeLog].slice(0, MAX_LOG_ENTRIES);
}

// --- 部位データの合成 ---

function applyPatch(base: PartDef): PartDef {
  const patch = state.partPatches[base.id];
  const disabled = state.disabledPartIds.includes(base.id);
  if (!patch && !disabled) return base;
  return { ...base, ...patch, enabled: disabled ? false : (patch?.enabled ?? base.enabled) };
}

function computeEffectiveParts(): PartDef[] {
  return [...ALL_PARTS.map(applyPatch), ...state.customParts.map(applyPatch)];
}

let cachedParts: PartDef[] = computeEffectiveParts();
let cachedMap: Map<string, PartDef> = new Map(cachedParts.map((p) => [p.id, p]));

function rebuildCache() {
  cachedParts = computeEffectiveParts();
  cachedMap = new Map(cachedParts.map((p) => [p.id, p]));
}
rebuildCache();

export function getAllParts(): PartDef[] {
  return cachedParts;
}

export function getPartDef(id: string): PartDef {
  const def = cachedMap.get(id);
  if (!def) throw new Error(`Unknown part id: ${id}`);
  return def;
}

export function tryGetPartDef(id: string): PartDef | null {
  return cachedMap.get(id) ?? null;
}

export function getPartsBySpecies(species: 'insect' | 'golem' | 'dragon'): PartDef[] {
  return cachedParts.filter((p) => p.species === species && p.id !== WEAK_ARM.id && p.enabled !== false);
}

export function getSpecialPartDefs(): PartDef[] {
  return cachedParts.filter((p) => p.species === 'none' && p.id !== WEAK_ARM.id && p.enabled !== false);
}

export function getDroppableParts(): PartDef[] {
  return cachedParts.filter((p) => p.id !== WEAK_ARM.id && p.enabled !== false);
}

// --- 編集操作 ---

function summarizeDiff(before: PartDef, after: PartPatch): string[] {
  const lines: string[] = [];
  const fieldLabels: Record<string, string> = {
    name: '名前',
    rarity: 'レアリティ',
    species: '種族',
    type: 'カテゴリ',
    cost: '接続コスト',
    attack: '攻撃力',
    interval: '攻撃間隔',
    hpBonus: 'HP補正',
    dropWeight: 'ドロップ重み',
    enabled: '有効',
  };
  for (const key of Object.keys(after) as (keyof PartPatch)[]) {
    if (!(key in fieldLabels)) continue;
    const beforeVal = (before as unknown as Record<string, unknown>)[key];
    const afterVal = (after as unknown as Record<string, unknown>)[key];
    if (beforeVal !== afterVal) lines.push(`${before.name}: ${fieldLabels[key]} ${String(beforeVal)} → ${String(afterVal)}`);
  }
  return lines;
}

export function applyPartPatch(id: string, patch: PartPatch): { ok: boolean; error?: string } {
  const current = tryGetPartDef(id);
  if (!current) return { ok: false, error: `部位が見つかりません: ${id}` };

  const validationError = validatePatch(patch);
  if (validationError) return { ok: false, error: validationError };

  const diffLines = summarizeDiff(current, patch);
  state.partPatches[id] = { ...state.partPatches[id], ...patch };
  diffLines.forEach(pushLog);
  if (diffLines.length === 0) pushLog(`${current.name}: 能力を変更`);
  rebuildCache();
  notify();
  return { ok: true };
}

function validatePatch(patch: PartPatch): string | undefined {
  if (patch.interval !== undefined && patch.interval < 0) return '攻撃間隔は0以上である必要があります';
  if (patch.cost !== undefined && patch.cost < 0) return '接続コストは0以上である必要があります';
  if (patch.attack !== undefined && patch.attack < 0) return '攻撃力は0以上である必要があります';
  if (patch.dropWeight !== undefined && patch.dropWeight <= 0) return 'ドロップ重みは1以上である必要があります';
  if (patch.effects) {
    for (const e of patch.effects) {
      if (!e || typeof e.kind !== 'string') return '不正なEffectが含まれています';
    }
  }
  return undefined;
}

export function setPartEnabled(id: string, enabled: boolean) {
  const isCustom = state.customParts.some((p) => p.id === id);
  if (isCustom) {
    applyPartPatch(id, { enabled });
    return;
  }
  state.disabledPartIds = enabled ? state.disabledPartIds.filter((x) => x !== id) : [...new Set([...state.disabledPartIds, id])];
  const def = tryGetPartDef(id);
  pushLog(`${def?.name ?? id}: ${enabled ? '有効化' : '無効化（ドロップ対象から除外）'}`);
  rebuildCache();
  notify();
}

export function createCustomPart(def: PartDef): { ok: boolean; error?: string } {
  if (!def.id || !/^[a-z0-9_]+$/.test(def.id)) return { ok: false, error: 'IDは英小文字・数字・アンダースコアのみ使用できます' };
  if (cachedMap.has(def.id)) return { ok: false, error: `ID「${def.id}」は既に使用されています` };
  const validationError = validatePatch(def);
  if (validationError) return { ok: false, error: validationError };

  state.customParts = [...state.customParts, { ...def, enabled: def.enabled ?? true }];
  pushLog(`新規部位「${def.name}」を作成`);
  rebuildCache();
  notify();
  return { ok: true };
}

export function duplicatePart(sourceId: string, newId: string, newName: string): { ok: boolean; error?: string } {
  const source = tryGetPartDef(sourceId);
  if (!source) return { ok: false, error: `複製元の部位が見つかりません: ${sourceId}` };
  const clone: PartDef = {
    ...source,
    id: newId,
    name: newName,
    effects: source.effects.map((e) => ({ ...e })),
    tags: [...source.tags],
    specialAbilityId: undefined, // 特殊能力は複製元と紐づけない（重複編集を避けるため）
  };
  return createCustomPart(clone);
}

export function deleteCustomPart(id: string): { ok: boolean; error?: string } {
  if (!state.customParts.some((p) => p.id === id)) return { ok: false, error: '既存部位（初期データ）は削除できません。無効化を使用してください' };
  const def = tryGetPartDef(id);
  state.customParts = state.customParts.filter((p) => p.id !== id);
  delete state.partPatches[id];
  pushLog(`部位「${def?.name ?? id}」を削除`);
  rebuildCache();
  notify();
  return { ok: true };
}

export function resetAll() {
  state = emptyState();
  pushLog('すべての変更を初期状態へリセット');
  rebuildCache();
  notify();
}

// --- 特殊能力パラメータ ---

export function getSpecialAbilities(): SpecialAbilityDef[] {
  return SPECIAL_ABILITIES;
}

export function getSpecialAbilityCurrentParams(abilityId: string): Record<string, number> {
  const ability = SPECIAL_ABILITIES.find((a) => a.id === abilityId);
  const part = tryGetPartDef(abilityId);
  if (!ability || !part) return {};
  return readSpecialAbilityParams(part, ability);
}

export function setSpecialAbilityParams(abilityId: string, params: Record<string, number>): { ok: boolean; error?: string } {
  const ability = SPECIAL_ABILITIES.find((a) => a.id === abilityId);
  const part = tryGetPartDef(abilityId);
  if (!ability || !part) return { ok: false, error: `特殊能力が見つかりません: ${abilityId}` };
  const newEffects = applySpecialAbilityParams(part, ability, params);
  return applyPartPatch(abilityId, { effects: newEffects });
}

// --- シナジー閾値の調整 ---

function synergyKey(group: 'partType' | 'species', key: string) {
  return `${group}:${key}`;
}

export function getPartTypeSynergies(): Record<PartType, SynergyTier[]> {
  return applySynergyPatches('partType', PART_TYPE_SYNERGIES) as Record<PartType, SynergyTier[]>;
}

export function getSpeciesSynergies(): Record<Exclude<Species, 'none'>, SynergyTier[]> {
  return applySynergyPatches('species', SPECIES_SYNERGIES) as Record<Exclude<Species, 'none'>, SynergyTier[]>;
}

function applySynergyPatches(group: 'partType' | 'species', base: Record<string, SynergyTier[]>): Record<string, SynergyTier[]> {
  const result: Record<string, SynergyTier[]> = {};
  for (const key of Object.keys(base)) {
    const patches = state.synergyPatches[synergyKey(group, key)];
    result[key] = base[key].map((tier, i) => {
      const p = patches?.[i];
      if (!p) return tier;
      return {
        count: p.count ?? tier.count,
        description: p.description ?? tier.description,
        effect: p.effectPatch ? ({ ...tier.effect, ...p.effectPatch } as SynergyTier['effect']) : tier.effect,
      };
    });
  }
  return result;
}

export function patchSynergyTier(
  group: 'partType' | 'species',
  key: string,
  tierIndex: number,
  patch: { count?: number; effectPatch?: Record<string, number> }
) {
  const k = synergyKey(group, key);
  const existing = state.synergyPatches[k] ?? [];
  existing[tierIndex] = { ...existing[tierIndex], ...patch };
  state.synergyPatches = { ...state.synergyPatches, [k]: existing };
  pushLog(`シナジー(${group}:${key}) ${tierIndex + 1}段階目の閾値/数値を調整`);
  notify();
}

// --- 変更履歴・エクスポート/インポート ---

export function getChangeLog(): ChangeLogEntry[] {
  return state.changeLog;
}

export function exportStateJSON(): string {
  return JSON.stringify(state, null, 2);
}

export function importStateJSON(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.customParts)) {
      return { ok: false, error: '形式が不正です（customPartsが見つかりません）' };
    }
    state = {
      version: 1,
      partPatches: parsed.partPatches ?? {},
      customParts: parsed.customParts ?? [],
      disabledPartIds: parsed.disabledPartIds ?? [],
      synergyPatches: parsed.synergyPatches ?? {},
      changeLog: parsed.changeLog ?? [],
    };
    pushLog('JSONから設定をインポート');
    rebuildCache();
    notify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `JSONの読み込みに失敗しました: ${(e as Error).message}` };
  }
}

export function hasPatch(id: string): boolean {
  return id in state.partPatches || state.disabledPartIds.includes(id);
}

export function isCustomPart(id: string): boolean {
  return state.customParts.some((p) => p.id === id);
}

export function getBasePartDef(id: string): PartDef | null {
  return ALL_PARTS.find((p) => p.id === id) ?? null;
}
