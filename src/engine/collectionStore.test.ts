import { beforeEach, describe, expect, it } from 'vitest';
import { installLocalStorageStub } from '../test/localStorageStub';
import {
  COLLECTION_SAVE_VERSION,
  addNamedChimeraToStore,
  loadCollectionStore,
  markEnemiesSeen,
  markPartsSeen,
  registerEnemyDiscovery,
  registerPartDiscovery,
  saveCollectionStore,
  type CollectionStoreV2,
} from './collectionStore';

const STORAGE_KEY = 'chimera-battle:collection:v2';
const LEGACY_GALLERY_KEY = 'chimera-battle:gallery:v1';

beforeEach(() => {
  installLocalStorageStub();
});

describe('loadCollectionStore', () => {
  it('新規環境ではsaveVersion付きの空ストアを返す', () => {
    const store = loadCollectionStore();
    expect(store.saveVersion).toBe(COLLECTION_SAVE_VERSION);
    expect(store.parts).toEqual({});
    expect(store.enemies).toEqual({});
    expect(store.chimeras).toEqual([]);
  });

  it('旧chimera-battle:gallery:v1のキメラ図鑑データを削除せずv2ストアへ移行する', () => {
    const legacy = [
      { id: 'c1', name: '旧キメラ', outcome: 'victory', battleReached: 8, icons: ['🦴'], partIds: ['weak_arm'], permanentCapacityBonus: 0, createdAt: 111 },
    ];
    localStorage.setItem(LEGACY_GALLERY_KEY, JSON.stringify(legacy));

    const store = loadCollectionStore();
    expect(store.chimeras).toHaveLength(1);
    expect(store.chimeras[0].name).toBe('旧キメラ');
    // 旧キーは削除されず残る(要件: 既存図鑑データを削除しない)
    expect(localStorage.getItem(LEGACY_GALLERY_KEY)).not.toBeNull();
  });

  it('壊れたJSONは無視して空ストアにフォールバックする', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    const store = loadCollectionStore();
    expect(store.saveVersion).toBe(COLLECTION_SAVE_VERSION);
    expect(store.parts).toEqual({});
  });

  it('保存済みのv2ストアをそのまま読み込む', () => {
    const store: CollectionStoreV2 = {
      saveVersion: 2,
      parts: { weak_arm: { firstAcquiredAt: 100, runsDiscovered: 1, seenRunIds: ['run_a'] } },
      enemies: {},
      chimeras: [],
      unseenPartIds: ['weak_arm'],
      unseenEnemyIds: [],
    };
    saveCollectionStore(store);
    const loaded = loadCollectionStore();
    expect(loaded.parts.weak_arm.runsDiscovered).toBe(1);
    expect(loaded.unseenPartIds).toEqual(['weak_arm']);
  });
});

describe('registerPartDiscovery', () => {
  it('初回発見はisNewDiscovery=trueで、firstAcquiredAt・runsDiscovered=1・unseenPartIdsを記録する', () => {
    const empty: CollectionStoreV2 = { saveVersion: 2, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
    const result = registerPartDiscovery(empty, 'insect_sickle_arm', 'run_1', 1000);
    expect(result.isNewDiscovery).toBe(true);
    expect(result.store.parts.insect_sickle_arm).toEqual({ firstAcquiredAt: 1000, runsDiscovered: 1, seenRunIds: ['run_1'] });
    expect(result.store.unseenPartIds).toEqual(['insect_sickle_arm']);
  });

  it('同一ラン内での再発見はrunsDiscoveredを増やさない', () => {
    const empty: CollectionStoreV2 = { saveVersion: 2, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
    const first = registerPartDiscovery(empty, 'insect_sickle_arm', 'run_1', 1000);
    const second = registerPartDiscovery(first.store, 'insect_sickle_arm', 'run_1', 2000);
    expect(second.isNewDiscovery).toBe(false);
    expect(second.store.parts.insect_sickle_arm.runsDiscovered).toBe(1);
    expect(second.store.parts.insect_sickle_arm.firstAcquiredAt).toBe(1000); // 初入手日時は更新されない
  });

  it('別のランでの再発見は「発見したラン数」を増やすが、isNewDiscoveryはfalseのまま', () => {
    const empty: CollectionStoreV2 = { saveVersion: 2, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
    const first = registerPartDiscovery(empty, 'insect_sickle_arm', 'run_1', 1000);
    const second = registerPartDiscovery(first.store, 'insect_sickle_arm', 'run_2', 2000);
    expect(second.isNewDiscovery).toBe(false);
    expect(second.store.parts.insect_sickle_arm.runsDiscovered).toBe(2);
  });
});

describe('registerEnemyDiscovery', () => {
  it('部位と同じ規則で発見を記録する', () => {
    const empty: CollectionStoreV2 = { saveVersion: 2, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
    const result = registerEnemyDiscovery(empty, 'poison_spider', 'run_1', 500);
    expect(result.isNewDiscovery).toBe(true);
    expect(result.store.enemies.poison_spider.runsDiscovered).toBe(1);
    expect(result.store.unseenEnemyIds).toEqual(['poison_spider']);
  });
});

describe('markPartsSeen / markEnemiesSeen', () => {
  it('指定したIDだけをunseenから取り除く', () => {
    const store: CollectionStoreV2 = {
      saveVersion: 2,
      parts: {},
      enemies: {},
      chimeras: [],
      unseenPartIds: ['a', 'b'],
      unseenEnemyIds: ['x'],
    };
    expect(markPartsSeen(store, ['a']).unseenPartIds).toEqual(['b']);
    expect(markEnemiesSeen(store).unseenEnemyIds).toEqual([]); // 省略時は全件既読
  });
});

describe('addNamedChimeraToStore', () => {
  it('新しいキメラを先頭に追加する', () => {
    const store: CollectionStoreV2 = { saveVersion: 2, parts: {}, enemies: {}, chimeras: [], unseenPartIds: [], unseenEnemyIds: [] };
    const next = addNamedChimeraToStore(store, {
      name: 'テストキメラ',
      outcome: 'victory',
      battleReached: 16,
      icons: ['🦴'],
      partIds: ['weak_arm'],
      permanentCapacityBonus: 0,
    });
    expect(next.chimeras).toHaveLength(1);
    expect(next.chimeras[0].name).toBe('テストキメラ');
    expect(next.chimeras[0].id).toMatch(/^chimera_/);
  });
});
