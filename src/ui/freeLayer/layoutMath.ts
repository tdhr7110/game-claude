// 自由合体レイヤー表示: 描画位置計算(戦闘ロジックとは無関係な純粋関数のみ)。
// レンダリング(React)にもNode.js側の自動テスト(vitest)にも同じ関数を使う。
//
// 責務ごとに分離している:
//   - computeLayerStyle    : anchor+pivot+scale → CSS配置(%)への変換
//   - generateSlots        : カテゴリの配置ルール(profile)+個数 → 接続位置の動的分散
//   - resolveLayerAsset    : 部位ID → 表示する画像(カテゴリ数だけで同じ画像にしない)
//   - computeInstanceVariation : 個体ごとの角度/縮尺/明度ジッター(重複感の軽減)
//   - resolveChimeraLayers : 上記をまとめて「装着部位一覧 → 描画レイヤー一覧」に変換する本体
import type { CategoryProfile } from './categoryProfiles';
import { CATEGORY_PROFILES, CATEGORY_Z_BASE, FALLBACK_PROFILE } from './categoryProfiles';
import { DRAW_GROUP_Z_BASE } from './drawOrder';
import { seededRange, hashString } from './hash';
import type { EquippedPartRef, LayerAsset, LayerManifest, Vec2 } from './types';

export interface PlacedLayerStyle {
  leftPct: number;
  topPct: number;
  sizePct: number;
  originXPct: number;
  originYPct: number;
}

// left = anchor.x - pivot.x * scale / top = anchor.y - pivot.y * scale (仕様書の基本式)。
// 256基準のキャンバス内での割合(%)に変換して返すことで、コンテナのCSSサイズが
// clampでどう変化してもJS側の再計算なしに追従できるようにする。
export function computeLayerStyle(anchor: Vec2, pivot: Vec2, scale: number, canvasSize: number): PlacedLayerStyle {
  const left = anchor.x - pivot.x * scale;
  const top = anchor.y - pivot.y * scale;
  return {
    leftPct: (left / canvasSize) * 100,
    topPct: (top / canvasSize) * 100,
    sizePct: scale * 100,
    originXPct: (pivot.x / canvasSize) * 100,
    originYPct: (pivot.y / canvasSize) * 100,
  };
}

export interface GeneratedSlot {
  x: number;
  y: number;
  rotation: number;
  mirror: boolean;
  scale: number;
  z: number;
  ring: number;
}

export interface GeneratedSlots {
  slots: GeneratedSlot[];
  overflowCount: number;
}

const MIN_SCALE = 0.28;
// 黄金角(度)。中心から均等に埋まる螺旋(ひまわりの種)状に配置するための定数で、
// stacked-centerモードで個体数が増えても同じ場所に完全には重ならないようにする。
const GOLDEN_ANGLE_DEG = 137.50776405;

function pairStackSlots(profile: Extract<CategoryProfile, { mode: 'pair-stack' }>, zBase: number, count: number): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2);
    const isRight = i % 2 === 0;
    const gap = profile.columnGap + row * profile.columnGapGrowth;
    const x = profile.pivot.x + (isRight ? gap : -gap);
    const y = profile.pivot.y + profile.rowStart + row * profile.rowStep;
    const magnitude = profile.rotationBase + row * profile.rotationStep;
    slots.push({
      x,
      y,
      rotation: isRight ? magnitude : -magnitude,
      mirror: !isRight,
      scale: Math.max(MIN_SCALE, profile.scaleBase - row * profile.scaleFalloff),
      z: zBase + row * profile.zStep,
      ring: row,
    });
  }
  return slots;
}

function radialFanSlots(profile: Extract<CategoryProfile, { mode: 'radial-fan' }>, zBase: number, count: number): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  let idx = 0;
  let ring = 0;
  while (idx < count && ring < 4096) {
    const capacity = ring === 0 ? 1 : 2;
    const take = Math.min(capacity, count - idx);
    const radius = profile.baseRadius + ring * profile.radiusStep;
    const span = ring === 0 ? 0 : profile.ringSpanFirst + (ring - 1) * profile.ringSpanGrowth;
    const scale = Math.max(MIN_SCALE, profile.scaleBase - ring * profile.scaleFalloff);
    const z = zBase + ring * profile.zStep;
    for (let i = 0; i < take; i++) {
      // ring===0は中心1個、以降は「左→右」の順でspan角度の両端に配置する。
      const angle = ring === 0 ? profile.angleCenter : profile.angleCenter + (i === 0 ? -span / 2 : span / 2);
      const rad = (angle * Math.PI) / 180;
      const x = profile.pivot.x + Math.sin(rad) * radius;
      const y = profile.pivot.y - Math.cos(rad) * radius;
      slots.push({
        x,
        y,
        rotation: (angle - profile.angleCenter) * profile.rotationFactor,
        mirror: angle < profile.angleCenter,
        scale,
        z,
        ring,
      });
      idx++;
    }
    ring++;
  }
  return slots;
}

function stackedCenterSlots(profile: Extract<CategoryProfile, { mode: 'stacked-center' }>, zBase: number, count: number): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  for (let i = 0; i < count; i++) {
    // フィロタキシス(ひまわりの種)配置: golden angleで回転しつつ半径をsqrt(i)で広げると、
    // 個数が増えても中心からの距離が均等に散らばり、同一座標への完全な重なりが起きない。
    const angle = i * GOLDEN_ANGLE_DEG;
    const rad = (angle * Math.PI) / 180;
    const radius = profile.jitterRadius * Math.sqrt(i);
    slots.push({
      x: profile.pivot.x + Math.cos(rad) * radius,
      y: profile.pivot.y + Math.sin(rad) * radius,
      rotation: (angle % 360) * 0.15,
      mirror: i % 2 === 1,
      scale: Math.max(MIN_SCALE, profile.scaleBase - i * profile.scaleFalloff * 0.4),
      z: zBase + i * profile.zStep,
      ring: i,
    });
  }
  return slots;
}

// カテゴリの配置ルール(profile)と個数から、接続位置を動的に生成する。
// 手作業で用意した固定リストではなく数式で生成するため、装着数が増えても
// (装着順に関わらず)常に接続位置が分散し、上限を超えた分だけが安全弁として
// バッジ表示(overflowCount)に回る。
export function generateSlots(profile: CategoryProfile, zBase: number, count: number): GeneratedSlots {
  const clamped = Math.max(0, count);
  const take = Math.min(clamped, profile.hardCap);
  const overflowCount = Math.max(0, clamped - take);
  if (take === 0) return { slots: [], overflowCount };

  switch (profile.mode) {
    case 'pair-stack':
      return { slots: pairStackSlots(profile, zBase, take), overflowCount };
    case 'radial-fan':
      return { slots: radialFanSlots(profile, zBase, take), overflowCount };
    case 'stacked-center':
      return { slots: stackedCenterSlots(profile, zBase, take), overflowCount };
  }
}

// 部位ID → 表示画像。同じカテゴリ内でも部位IDが異なれば(素材が複数ある限り)
// 別の画像に解決されるため、装着数(カテゴリ数)だけを見て同じ画像を並べることがない。
// 該当カテゴリの画像が1枚も無い場合はnullを返し、呼び出し側でフォールバック表示にする。
export function resolveLayerAsset(category: string, partId: string, manifest: LayerManifest): LayerAsset | null {
  const candidates = manifest.assets.filter((a) => a.category === category);
  if (candidates.length === 0) return null;
  const index = hashString(partId) % candidates.length;
  return candidates[index];
}

export interface InstanceVariation {
  rotationJitterDeg: number;
  scaleJitter: number;
  brightness: number;
}

// 個体(instanceId)ごとの見た目バリエーション。装着順ではなくinstanceIdだけで決まるため、
// 同じ編成なら装着した順番が変わっても各個体の見た目は変わらない。
export function computeInstanceVariation(instanceId: string): InstanceVariation {
  return {
    rotationJitterDeg: seededRange(instanceId, 'rotation', -6, 6),
    scaleJitter: seededRange(instanceId, 'scale', -0.06, 0.04),
    brightness: seededRange(instanceId, 'brightness', 0.88, 1.08),
  };
}

export interface ResolvedLayer {
  key: string;
  category: string;
  asset: LayerAsset | null;
  z: number;
  style: PlacedLayerStyle;
  rotationDeg: number;
  mirror: boolean;
  brightness: number;
}

export interface CategoryOverflow {
  category: string;
  count: number;
  mode: 'badge';
}

export interface ChimeraLayersResult {
  layers: ResolvedLayer[];
  overflow: CategoryOverflow[];
}

// 装着部位一覧(カテゴリ混在)から、実際に描画するレイヤー一覧を作る本体の純粋関数。
// FreeLayerFigure(React)とテストの両方から同じ関数を呼ぶことで、見た目のロジックを
// 二重管理しない。
export function resolveChimeraLayers(parts: EquippedPartRef[], manifest: LayerManifest): ChimeraLayersResult {
  const canvasSize = manifest.canvas.width;
  const byCategory = new Map<string, EquippedPartRef[]>();
  for (const part of parts) {
    const list = byCategory.get(part.category);
    if (list) list.push(part);
    else byCategory.set(part.category, [part]);
  }

  const layers: ResolvedLayer[] = [];
  const overflow: CategoryOverflow[] = [];

  for (const [category, categoryParts] of byCategory) {
    if (category === 'base') continue; // 素体は別枠で描画する
    // 未定義カテゴリ(画像未登録の部位)でも部位自体は消さず、汎用配置+フォールバック表示にする。
    const profile = CATEGORY_PROFILES[category] ?? FALLBACK_PROFILE;

    // 装着順に依存して表示が毎回変わらないよう、instanceIdの文字列昇順で安定ソートする。
    const sorted = [...categoryParts].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
    const zBase = CATEGORY_Z_BASE[category] ?? DRAW_GROUP_Z_BASE.decoration;
    const { slots, overflowCount } = generateSlots(profile, zBase, sorted.length);

    for (let i = 0; i < slots.length; i++) {
      const part = sorted[i];
      const slot = slots[i];
      const asset = resolveLayerAsset(category, part.partId, manifest);
      const variation = computeInstanceVariation(part.instanceId);
      const scale = Math.max(MIN_SCALE, slot.scale + variation.scaleJitter) * (asset?.defaultScale ?? 1);
      const pivot = asset?.pivot ?? profile.pivot;
      const style = computeLayerStyle({ x: slot.x, y: slot.y }, pivot, scale, canvasSize);
      layers.push({
        key: part.instanceId,
        category,
        asset,
        z: slot.z,
        style,
        rotationDeg: slot.rotation + variation.rotationJitterDeg,
        mirror: slot.mirror,
        brightness: variation.brightness,
      });
    }

    if (overflowCount > 0) {
      overflow.push({ category, count: overflowCount, mode: 'badge' });
    }
  }

  return { layers, overflow };
}

// FreeLayerTestScreenの「自動配置OFF」比較表示専用: 動的分散をかけず、カテゴリの基準点
// (profile.pivot)1点に全個体を重ねて表示する(ON/OFFの見た目比較用。実戦闘・図鑑では使わない)。
export function resolveChimeraLayersWithoutAutoLayout(parts: EquippedPartRef[], manifest: LayerManifest): ChimeraLayersResult {
  const canvasSize = manifest.canvas.width;
  const layers: ResolvedLayer[] = [];
  for (const part of parts) {
    if (part.category === 'base') continue;
    const profile = CATEGORY_PROFILES[part.category] ?? FALLBACK_PROFILE;
    const asset = resolveLayerAsset(part.category, part.partId, manifest);
    const pivot = asset?.pivot ?? profile.pivot;
    const scale = asset?.defaultScale ?? profile.scaleBase;
    const style = computeLayerStyle(profile.pivot, pivot, scale, canvasSize);
    layers.push({
      key: part.instanceId,
      category: part.category,
      asset,
      z: CATEGORY_Z_BASE[part.category] ?? DRAW_GROUP_Z_BASE.decoration,
      style,
      rotationDeg: 0,
      mirror: false,
      brightness: 1,
    });
  }
  return { layers, overflow: [] };
}
