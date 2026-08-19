// ============================================================
// 図鑑（部位・敵・キメラ）の永続化ストア。
//
// ラン進行状況(RunState)とは別に、ブラウザへ永続保存する「図鑑」データを1つに
// まとめて扱う。以前は「キメラ図鑑」だけが chimera-battle:gallery:v1 として
// 単独保存されていたが、部位・敵の発見記録を追加するにあたり saveVersion付きの
// 統合ストアへ移行する。
//
// マイグレーション方針:
//   - 新キー(STORAGE_KEY)にv2形式のデータがあればそのまま使う。
//   - 無ければ旧キー(LEGACY_GALLERY_KEY)からキメラ図鑑だけを読み込み、
//     部位・敵の発見記録は空の状態でv2ストアを新規作成する。
//   - 旧キーのデータは削除しない(将来のロールバックや検証のため残す)。
//   - 将来saveVersionが上がった場合はMIGRATIONSに変換関数を追記していく。
// ============================================================

export interface NamedChimera {
  id: string;
  name: string;
  outcome: 'victory' | 'defeat';
  battleReached: number;
  icons: string[]; // 命名時点で装着していた部位アイコンのスナップショット（表示用）
  partIds: string[]; // 命名時点で装着していた部位のID（図鑑の詳細表示で参照する）
  permanentCapacityBonus: number; // 命名時点の永続接続容量ボーナス（図鑑のビルド全体表示で接続容量を正しく計算するため）
  createdAt: number;
}

export interface DiscoveryRecord {
  firstAcquiredAt: number; // 初入手日時(epoch ms)
  runsDiscovered: number; // 発見したラン数(同一ラン内での複数回発見は1回に数える)
  seenRunIds: string[]; // runsDiscoveredの重複加算を防ぐための既知runId一覧
}

export const COLLECTION_SAVE_VERSION = 2 as const;

export interface CollectionStoreV2 {
  saveVersion: typeof COLLECTION_SAVE_VERSION;
  parts: Record<string, DiscoveryRecord>;
  enemies: Record<string, DiscoveryRecord>;
  chimeras: NamedChimera[];
  unseenPartIds: string[]; // NEWバッジ(部位図鑑)
  unseenEnemyIds: string[]; // NEWバッジ(敵図鑑)
}

const STORAGE_KEY = 'chimera-battle:collection:v2';
const LEGACY_GALLERY_KEY = 'chimera-battle:gallery:v1';

function emptyStore(): CollectionStoreV2 {
  return { saveVersion: COLLECTION_SAVE_VERSION, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
}

function isNamedChimera(c: unknown): c is Omit<NamedChimera, 'partIds' | 'permanentCapacityBonus'> & { partIds?: unknown; permanentCapacityBonus?: unknown } {
  if (!c || typeof c !== 'object') return false;
  const r = c as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.icons) && typeof r.createdAt === 'number';
}

function normalizeChimeras(raw: unknown): NamedChimera[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNamedChimera).map((c) => ({
    ...c,
    partIds: Array.isArray(c.partIds) ? (c.partIds as string[]) : [],
    permanentCapacityBonus: typeof c.permanentCapacityBonus === 'number' ? c.permanentCapacityBonus : 0,
  }));
}

function loadLegacyChimeras(): NamedChimera[] {
  try {
    const raw = localStorage.getItem(LEGACY_GALLERY_KEY);
    if (!raw) return [];
    return normalizeChimeras(JSON.parse(raw));
  } catch {
    return [];
  }
}

function isDiscoveryRecord(v: unknown): v is DiscoveryRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.firstAcquiredAt === 'number' && typeof r.runsDiscovered === 'number' && Array.isArray(r.seenRunIds);
}

function normalizeDiscoveryMap(raw: unknown): Record<string, DiscoveryRecord> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, DiscoveryRecord> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isDiscoveryRecord(v)) out[id] = { firstAcquiredAt: v.firstAcquiredAt, runsDiscovered: v.runsDiscovered, seenRunIds: v.seenRunIds as string[] };
  }
  return out;
}

// v1(saveVersionフィールドを持たない、旧gallery.v1キーのみ存在する状態)からv2への変換。
function migrateV1ToV2(): CollectionStoreV2 {
  return { ...emptyStore(), chimeras: loadLegacyChimeras() };
}

// 将来saveVersionが上がった場合はここへ`[from]: (store) => nextStore`の形で追記する。
const MIGRATIONS: Record<number, (store: CollectionStoreV2) => CollectionStoreV2> = {};

function runMigrations(store: CollectionStoreV2): CollectionStoreV2 {
  let current = store;
  while (MIGRATIONS[current.saveVersion]) {
    current = MIGRATIONS[current.saveVersion](current);
  }
  return current;
}

export function loadCollectionStore(): CollectionStoreV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CollectionStoreV2>;
      if (parsed && typeof parsed === 'object' && typeof parsed.saveVersion === 'number') {
        const normalized: CollectionStoreV2 = {
          saveVersion: COLLECTION_SAVE_VERSION,
          parts: normalizeDiscoveryMap(parsed.parts),
          enemies: normalizeDiscoveryMap(parsed.enemies),
          chimeras: normalizeChimeras(parsed.chimeras),
          unseenPartIds: Array.isArray(parsed.unseenPartIds) ? (parsed.unseenPartIds as string[]) : [],
          unseenEnemyIds: Array.isArray(parsed.unseenEnemyIds) ? (parsed.unseenEnemyIds as string[]) : [],
        };
        return runMigrations({ ...normalized, saveVersion: (parsed.saveVersion as 2) ?? COLLECTION_SAVE_VERSION });
      }
    }
  } catch {
    // 壊れたデータは無視して以下のマイグレーション/新規作成へフォールバックする
  }
  return migrateV1ToV2();
}

export function saveCollectionStore(store: CollectionStoreV2): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 保存容量オーバーなどは無視(図鑑保存は補助機能のため、ゲーム進行自体には影響させない)
  }
}

export interface RegisterDiscoveryResult {
  store: CollectionStoreV2;
  isNewDiscovery: boolean;
}

function registerDiscovery(
  map: Record<string, DiscoveryRecord>,
  id: string,
  runId: string,
  now: number
): { map: Record<string, DiscoveryRecord>; isNewDiscovery: boolean } {
  const existing = map[id];
  if (!existing) {
    return { map: { ...map, [id]: { firstAcquiredAt: now, runsDiscovered: 1, seenRunIds: [runId] } }, isNewDiscovery: true };
  }
  if (existing.seenRunIds.includes(runId)) return { map, isNewDiscovery: false };
  return {
    map: { ...map, [id]: { ...existing, runsDiscovered: existing.runsDiscovered + 1, seenRunIds: [...existing.seenRunIds, runId] } },
    isNewDiscovery: false,
  };
}

// 部位を初めて(あるいは新しいランで)発見したことを記録する。
// isNewDiscovery(=初めてこのIDを見た)の場合のみNEWバッジ(unseenPartIds)を立てる。
export function registerPartDiscovery(store: CollectionStoreV2, partId: string, runId: string, now = Date.now()): RegisterDiscoveryResult {
  const { map, isNewDiscovery } = registerDiscovery(store.parts, partId, runId, now);
  if (map === store.parts) return { store, isNewDiscovery: false };
  const unseenPartIds = isNewDiscovery ? [...store.unseenPartIds, partId] : store.unseenPartIds;
  return { store: { ...store, parts: map, unseenPartIds }, isNewDiscovery };
}

export function registerEnemyDiscovery(store: CollectionStoreV2, enemyId: string, runId: string, now = Date.now()): RegisterDiscoveryResult {
  const { map, isNewDiscovery } = registerDiscovery(store.enemies, enemyId, runId, now);
  if (map === store.enemies) return { store, isNewDiscovery: false };
  const unseenEnemyIds = isNewDiscovery ? [...store.unseenEnemyIds, enemyId] : store.unseenEnemyIds;
  return { store: { ...store, enemies: map, unseenEnemyIds }, isNewDiscovery };
}

export function markPartsSeen(store: CollectionStoreV2, ids?: string[]): CollectionStoreV2 {
  if (!ids) return store.unseenPartIds.length === 0 ? store : { ...store, unseenPartIds: [] };
  const remove = new Set(ids);
  return { ...store, unseenPartIds: store.unseenPartIds.filter((id) => !remove.has(id)) };
}

export function markEnemiesSeen(store: CollectionStoreV2, ids?: string[]): CollectionStoreV2 {
  if (!ids) return store.unseenEnemyIds.length === 0 ? store : { ...store, unseenEnemyIds: [] };
  const remove = new Set(ids);
  return { ...store, unseenEnemyIds: store.unseenEnemyIds.filter((id) => !remove.has(id)) };
}

export function addNamedChimeraToStore(store: CollectionStoreV2, entry: Omit<NamedChimera, 'id' | 'createdAt'>): CollectionStoreV2 {
  const chimera: NamedChimera = { ...entry, id: `chimera_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
  return { ...store, chimeras: [chimera, ...store.chimeras] };
}
