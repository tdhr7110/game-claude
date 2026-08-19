import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG, ENEMY_CATALOG_BY_ID, baseEnemyIdForCollection, getEnemyCatalogEntry } from './enemyCatalog';

describe('ENEMY_CATALOG', () => {
  it('IDが重複しない', () => {
    const ids = ENEMY_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('通常・強敵・ボス(第1階層/第2階層)を含む', () => {
    expect(ENEMY_CATALOG_BY_ID['poison_spider']).toBeDefined();
    expect(ENEMY_CATALOG_BY_ID['insect_queen']).toBeDefined();
    expect(ENEMY_CATALOG_BY_ID['final_chimera']).toBeDefined();
    expect(ENEMY_CATALOG_BY_ID['final_chimera_awakened']).toBeDefined();
  });
});

describe('baseEnemyIdForCollection', () => {
  it('_miniboxサフィックスを取り除いて元の強敵IDへ正規化する', () => {
    expect(baseEnemyIdForCollection('insect_queen_miniboss')).toBe('insect_queen');
  });

  it('サフィックスが無いIDはそのまま返す', () => {
    expect(baseEnemyIdForCollection('poison_spider')).toBe('poison_spider');
  });
});

describe('getEnemyCatalogEntry', () => {
  it('中ボスIDを渡しても元の強敵のカタログ情報を返す', () => {
    const entry = getEnemyCatalogEntry('colossus_golem_miniboss');
    expect(entry?.id).toBe('colossus_golem');
  });
});
