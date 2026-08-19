import { describe, expect, it } from 'vitest';
import { getPartArtUrl, getEnemyArtUrl, SILHOUETTE_ART_URL } from './collectionArt';
import { COLLECTION_ART_ENTRIES } from '../data/collectionArtManifest.generated';

describe('collectionArt resolver', () => {
  it('マニフェストに登録済みの部位IDはURLを返す', () => {
    const entry = COLLECTION_ART_ENTRIES.find((e) => e.domain === 'part');
    expect(entry).toBeDefined();
    const url = getPartArtUrl(entry!.id);
    expect(url).not.toBeNull();
    expect(url).toContain(entry!.file);
  });

  it('マニフェストに無いIDはnullを返す(欠損時フォールバック)', () => {
    expect(getPartArtUrl('this_part_id_does_not_exist')).toBeNull();
    expect(getEnemyArtUrl('this_enemy_id_does_not_exist')).toBeNull();
  });

  it('中ボスIDでも元の強敵と同じ画像URLを解決する', () => {
    const entry = COLLECTION_ART_ENTRIES.find((e) => e.domain === 'enemy');
    if (!entry) return; // この段階ではまだ敵画像が代表数点しか無い場合はスキップ
    expect(getEnemyArtUrl(`${entry.id}_miniboss`)).toBe(getEnemyArtUrl(entry.id));
  });

  it('シルエットURLはcollection-artディレクトリ配下を指す', () => {
    expect(SILHOUETTE_ART_URL).toContain('collection-art/_silhouette.png');
  });
});
