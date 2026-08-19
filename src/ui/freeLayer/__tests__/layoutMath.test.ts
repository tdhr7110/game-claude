import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATEGORY_PROFILES, FALLBACK_PROFILE } from '../categoryProfiles';
import {
  computeInstanceVariation,
  computeLayerStyle,
  generateSlots,
  resolveChimeraLayers,
  resolveLayerAsset,
} from '../layoutMath';
import type { EquippedPartRef, LayerManifest } from '../types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL_MANIFEST: LayerManifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'public/assets/chimera-layers/layer-manifest.json'), 'utf-8'),
);

// テスト用の小さなmanifest。base-core + arm2種 + leg1種のみを持つ最小構成で、
// resolveLayerAsset/resolveChimeraLayersの純粋な挙動をmanifestの内容から独立して検証する。
const MOCK_MANIFEST: LayerManifest = {
  version: 1,
  canvas: { width: 256, height: 256 },
  assets: [
    { id: 'base-core', category: 'base', file: 'base.png', pivot: { x: 128, y: 128 }, defaultScale: 1, mirrorable: false, rotatable: false, zGroup: 10 },
    { id: 'arm-a', category: 'arm', file: 'arm-a.png', pivot: { x: 40, y: 130 }, defaultScale: 0.58, mirrorable: true, rotatable: true, zGroup: 30 },
    { id: 'arm-b', category: 'arm', file: 'arm-b.png', pivot: { x: 40, y: 130 }, defaultScale: 0.58, mirrorable: true, rotatable: true, zGroup: 30 },
    { id: 'leg-a', category: 'leg', file: 'leg-a.png', pivot: { x: 132, y: 43 }, defaultScale: 0.58, mirrorable: true, rotatable: true, zGroup: 8 },
  ],
};

function makeParts(category: string, partIds: string[], count: number, tag = category): EquippedPartRef[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `${tag}-${String(i).padStart(3, '0')}`,
    partId: partIds[i % partIds.length],
    category,
  }));
}

describe('computeLayerStyle', () => {
  it('基本式どおりにleft/topを計算する(left = anchor.x - pivot.x*scale)', () => {
    const s = computeLayerStyle({ x: 174, y: 96 }, { x: 43, y: 132 }, 0.58, 256);
    const expectedLeft = 174 - 43 * 0.58;
    const expectedTop = 96 - 132 * 0.58;
    expect(s.leftPct).toBeCloseTo((expectedLeft / 256) * 100, 9);
    expect(s.topPct).toBeCloseTo((expectedTop / 256) * 100, 9);
    expect(s.sizePct).toBeCloseTo(58, 9);
    expect(s.originXPct).toBeCloseTo((43 / 256) * 100, 9);
  });

  it('素体(pivot=anchor=中央, scale=1)はキャンバス全面(0,0起点・100%)になる', () => {
    const s = computeLayerStyle({ x: 128, y: 128 }, { x: 128, y: 128 }, 1, 256);
    expect(s.leftPct).toBe(0);
    expect(s.topPct).toBe(0);
    expect(s.sizePct).toBe(100);
  });
});

describe('generateSlots: カテゴリごとの動的分散', () => {
  it('pair-stackモード(腕・脚等)は個数分だけ座標の異なるスロットを返す(重ならない)', () => {
    for (let n = 1; n <= 8; n++) {
      const { slots, overflowCount } = generateSlots(CATEGORY_PROFILES.arm, 300, n);
      expect(slots).toHaveLength(n);
      expect(overflowCount).toBe(0);
      const coords = new Set(slots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
      expect(coords.size).toBe(n);
    }
  });

  it('radial-fanモード(角・尻尾・目等)も個数分の異なる座標を返す', () => {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      const { slots } = generateSlots(CATEGORY_PROFILES.horn, 300, n);
      expect(slots).toHaveLength(n);
      const coords = new Set(slots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
      expect(coords.size).toBe(n);
    }
  });

  it('stacked-centerモード(装甲・内臓等)も個数分の異なる座標を返す(フィロタキシス配置)', () => {
    for (const n of [1, 2, 5, 10]) {
      const { slots } = generateSlots(CATEGORY_PROFILES.organ, 300, n);
      expect(slots).toHaveLength(n);
      const coords = new Set(slots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
      expect(coords.size).toBe(n);
    }
  });

  it('装着数が増えるほど接続位置の広がり(重心からの最大距離)が単調に拡大する(段/リングが追加される)', () => {
    const spreadFor = (n: number) => {
      const { slots } = generateSlots(CATEGORY_PROFILES.arm, 300, n);
      const pivot = CATEGORY_PROFILES.arm.pivot;
      return Math.max(...slots.map((s) => Math.hypot(s.x - pivot.x, s.y - pivot.y)));
    };
    const spreads = [2, 4, 6, 8].map(spreadFor);
    for (let i = 1; i < spreads.length; i++) {
      expect(spreads[i]).toBeGreaterThanOrEqual(spreads[i - 1]);
    }
  });

  it('hardCapを超える装着数は安全弁としてoverflowCountに積まれ、無限にレイヤーを生成しない', () => {
    const profile = CATEGORY_PROFILES.arm;
    const { slots, overflowCount } = generateSlots(profile, 300, profile.hardCap + 5);
    expect(slots).toHaveLength(profile.hardCap);
    expect(overflowCount).toBe(5);
  });

  it('個数0はスロットなし・overflowなし', () => {
    const { slots, overflowCount } = generateSlots(CATEGORY_PROFILES.leg, 200, 0);
    expect(slots).toHaveLength(0);
    expect(overflowCount).toBe(0);
  });

  it('すべての座標がキャンバス(256x256)から極端に外れない範囲に収まる(スマホ縦画面でもはみ出しにくい)', () => {
    for (const profile of Object.values(CATEGORY_PROFILES)) {
      const { slots } = generateSlots(profile, 300, profile.hardCap);
      for (const s of slots) {
        expect(s.x).toBeGreaterThan(-64);
        expect(s.x).toBeLessThan(320);
        expect(s.y).toBeGreaterThan(-64);
        expect(s.y).toBeLessThan(320);
      }
    }
  });
});

describe('resolveLayerAsset: 部位ID単位の画像解決', () => {
  it('同じpartIdは常に同じ画像に解決される(決定論的)', () => {
    const a = resolveLayerAsset('arm', 'insect_sickle_arm', MOCK_MANIFEST);
    const b = resolveLayerAsset('arm', 'insect_sickle_arm', MOCK_MANIFEST);
    expect(a?.id).toBe(b?.id);
  });

  it('同じカテゴリでもpartIdが違えば異なる画像に解決されうる(カテゴリ数だけで同じ画像にしない)', () => {
    const ids = ['weak_arm', 'insect_sickle_arm', 'golem_giant_fist', 'dragon_claw', 'special_multi_arm_core'];
    const resolved = new Set(ids.map((id) => resolveLayerAsset('arm', id, MOCK_MANIFEST)?.id));
    // MOCK_MANIFESTのarmカテゴリには2種類の画像しかないため、5つの異なる部位IDが
    // 全て同じ1枚に固まらない(2種類とも使われる)ことを確認する。
    expect(resolved.size).toBeGreaterThan(1);
  });

  it('該当カテゴリの画像が1枚も無ければnullを返す(フォールバック表示のトリガー)', () => {
    expect(resolveLayerAsset('unregistered-category', 'anything', MOCK_MANIFEST)).toBeNull();
  });

  it('実際のlayer-manifest.jsonに対しても解決できる(統合チェック)', () => {
    const asset = resolveLayerAsset('arm', 'insect_sickle_arm', REAL_MANIFEST);
    expect(asset).not.toBeNull();
    expect(asset?.category).toBe('arm');
  });
});

describe('computeInstanceVariation: 個体ごとの重複感軽減バリエーション', () => {
  it('同じinstanceIdなら常に同じバリエーションになる(装着順に依存しない)', () => {
    const a = computeInstanceVariation('arm-000');
    const b = computeInstanceVariation('arm-000');
    expect(a).toEqual(b);
  });

  it('異なるinstanceIdなら基本的に異なるバリエーションになる(重複感の軽減)', () => {
    const variations = Array.from({ length: 8 }, (_, i) => computeInstanceVariation(`arm-${i}`));
    const rotations = new Set(variations.map((v) => v.rotationJitterDeg));
    const brightness = new Set(variations.map((v) => v.brightness));
    expect(rotations.size).toBeGreaterThan(1);
    expect(brightness.size).toBeGreaterThan(1);
  });
});

describe('resolveChimeraLayers: 装着部位一覧 → 描画レイヤー一覧(本体)', () => {
  it('腕1〜8本すべてが完全に重ならず表示できる(受け入れ条件: 座標が全て異なる)', () => {
    for (let n = 1; n <= 8; n++) {
      const parts = makeParts('arm', ['weak_arm', 'insect_sickle_arm'], n);
      const { layers, overflow } = resolveChimeraLayers(parts, REAL_MANIFEST);
      expect(layers).toHaveLength(n);
      expect(overflow).toHaveLength(0);
      const coords = new Set(layers.map((l) => `${l.style.leftPct.toFixed(4)},${l.style.topPct.toFixed(4)}`));
      expect(coords.size).toBe(n);
    }
  });

  it('全く同じ部位ID(同一画像)を複数装着しても、接続位置・角度・明度のいずれかで区別できる', () => {
    const parts = makeParts('arm', ['weak_arm'], 8);
    const { layers } = resolveChimeraLayers(parts, REAL_MANIFEST);
    expect(layers).toHaveLength(8);
    // 画像は全個体で同じはずだが、座標(接続位置)は互いに異なる。
    const positions = new Set(layers.map((l) => `${l.style.leftPct.toFixed(4)},${l.style.topPct.toFixed(4)}`));
    expect(positions.size).toBe(8);
    const assetIds = new Set(layers.map((l) => l.asset?.id));
    expect(assetIds.size).toBe(1);
    // 角度・明度のどちらかは個体ごとに違う値になっている(重複感の軽減)。
    const rotations = new Set(layers.map((l) => l.rotationDeg.toFixed(3)));
    const brightness = new Set(layers.map((l) => l.brightness.toFixed(4)));
    expect(rotations.size + brightness.size).toBeGreaterThan(2);
  });

  it('装着順(配列の並び)が変わっても結果が変わらない(安定ソート)', () => {
    const base = makeParts('arm', ['weak_arm', 'insect_sickle_arm', 'golem_giant_fist'], 6);
    const shuffled = [base[3], base[0], base[5], base[1], base[4], base[2]];
    const a = resolveChimeraLayers(base, REAL_MANIFEST);
    const b = resolveChimeraLayers(shuffled, REAL_MANIFEST);
    const normalize = (layers: typeof a.layers) =>
      [...layers]
        .sort((x, y) => x.key.localeCompare(y.key))
        .map((l) => ({ key: l.key, left: l.style.leftPct, top: l.style.topPct, rotation: l.rotationDeg, asset: l.asset?.id }));
    expect(normalize(a.layers)).toEqual(normalize(b.layers));
  });

  it('画像が未登録のカテゴリでも部位を消さず、asset=nullのレイヤーとして描画対象に残す(フォールバック用)', () => {
    const parts: EquippedPartRef[] = [
      { instanceId: 'unreg-000', partId: 'debug_unregistered', category: 'unregistered-future-part' },
    ];
    const { layers } = resolveChimeraLayers(parts, REAL_MANIFEST);
    expect(layers).toHaveLength(1);
    expect(layers[0].asset).toBeNull();
  });

  it('装着数0は素体相当のレイヤー一覧(空配列)になる', () => {
    const { layers, overflow } = resolveChimeraLayers([], REAL_MANIFEST);
    expect(layers).toHaveLength(0);
    expect(overflow).toHaveLength(0);
  });

  it('全カテゴリを混在させても、それぞれ描画順グループどおりのzIndex帯に収まる', () => {
    const parts: EquippedPartRef[] = [
      ...makeParts('wing', ['w'], 2, 'wing'),
      ...makeParts('leg', ['l'], 2, 'leg'),
      ...makeParts('arm', ['a'], 2, 'arm'),
      ...makeParts('organ', ['o'], 2, 'organ'),
    ];
    const { layers } = resolveChimeraLayers(parts, REAL_MANIFEST);
    const zByCategory = (category: string) => layers.filter((l) => l.category === category).map((l) => l.z);
    const maxWing = Math.max(...zByCategory('wing'));
    const minLeg = Math.min(...zByCategory('leg'));
    const maxLeg = Math.max(...zByCategory('leg'));
    const minArm = Math.min(...zByCategory('arm'));
    const maxArm = Math.max(...zByCategory('arm'));
    const minOrgan = Math.min(...zByCategory('organ'));
    // 後方(wing) < 側面(leg) < 前方(arm) < 装飾(organ) の順でzIndex帯が並ぶ。
    expect(maxWing).toBeLessThan(minLeg);
    expect(maxLeg).toBeLessThan(minArm);
    expect(maxArm).toBeLessThan(minOrgan);
  });

  it('大量装着(合計40個)でも例外を投げず、有限時間で解決できる(ゲーム進行を止めない)', () => {
    const parts: EquippedPartRef[] = [
      ...makeParts('arm', ['weak_arm', 'insect_sickle_arm', 'golem_giant_fist'], 12, 'arm'),
      ...makeParts('leg', ['insect_spider_leg', 'golem_stone_leg'], 10, 'leg'),
      ...makeParts('organ', ['insect_poison_gland', 'dragon_heart'], 10, 'organ'),
      ...makeParts('armor', ['insect_carapace'], 8, 'armor'),
    ];
    const t0 = performance.now();
    const { layers } = resolveChimeraLayers(parts, REAL_MANIFEST);
    const elapsed = performance.now() - t0;
    expect(layers.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});

describe('FALLBACK_PROFILE', () => {
  it('hardCapを持ち、無限に増殖しない安全弁になっている', () => {
    expect(FALLBACK_PROFILE.hardCap).toBeGreaterThan(0);
    expect(Number.isFinite(FALLBACK_PROFILE.hardCap)).toBe(true);
  });
});
