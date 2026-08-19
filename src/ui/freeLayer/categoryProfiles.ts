// 自由合体レイヤー表示: カテゴリ(腕・脚・頭の角・尻尾…)ごとの配置ルール。
// 「腕、脚、頭、皮膚、装飾ごとに配置ルールを分離する」要件に対応する部分で、
// カテゴリごとに別々のジオメトリ(左右対の段積み/放射状の扇/中心へのスタック)を持たせる。
//
// ここに置くのは「配置の規則(パラメータ)」だけで、実際の座標計算はlayoutMath.tsの
// 純粋関数(generateSlots)が担う。座標系はlayer-manifest.jsonと同じ256x256基準。
import type { Vec2 } from './types';
import { drawGroupOf, DRAW_GROUP_Z_BASE } from './drawOrder';

export type PlacementMode = 'pair-stack' | 'radial-fan' | 'stacked-center';

interface ProfileBase {
  category: string;
  mode: PlacementMode;
  pivot: Vec2;
  scaleBase: number;
  scaleFalloff: number; // リング(段)が進むごとの縮小率
  zStep: number; // リングが進むごとのzIndex変化(負なら奥へ後退)
  hardCap: number; // これ以上は動的分散をやめてバッジ表示に切り替える安全弁
}

// 左右対称に段状(row)で積み上げる配置(腕・脚・翼・背中の対称パーツ向け)。
export interface PairStackProfile extends ProfileBase {
  mode: 'pair-stack';
  rowStart: number; // 1段目のpivotからのY方向オフセット
  rowStep: number; // 段が進むごとのYオフセット増分
  columnGap: number; // 1段目の左右オフセット(X方向)
  columnGapGrowth: number; // 段が進むごとの左右オフセット増分
  rotationBase: number; // 1段目の回転角(度)
  rotationStep: number; // 段が進むごとの回転角増分
}

// 中心点から放射状に扇形展開する配置(角・尻尾・目のように、中心1個+左右対で
// 広がっていくパーツ向け)。
export interface RadialFanProfile extends ProfileBase {
  mode: 'radial-fan';
  baseRadius: number;
  radiusStep: number;
  angleCenter: number; // 度。0=真上
  ringSpanFirst: number; // 中心の次のリング(左右ペア)が扇状に開く角度
  ringSpanGrowth: number; // リングが進むごとの開き角増分
  rotationFactor: number; // 角度オフセットに対して画像自体をどれだけ回転させるか
}

// 中心点付近に小さくスタックする配置(装甲・内臓のような装飾/上乗せパーツ向け)。
export interface StackedCenterProfile extends ProfileBase {
  mode: 'stacked-center';
  jitterRadius: number; // 個体ごとに中心からわずかにずらす最大半径
}

export type CategoryProfile = PairStackProfile | RadialFanProfile | StackedCenterProfile;

function zBaseFor(category: string, offset: number): number {
  return DRAW_GROUP_Z_BASE[drawGroupOf(category)] + offset;
}

export const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  arm: {
    category: 'arm',
    mode: 'pair-stack',
    pivot: { x: 128, y: 118 },
    rowStart: -24,
    rowStep: 26,
    columnGap: 44,
    columnGapGrowth: 8,
    rotationBase: 15,
    rotationStep: 9,
    scaleBase: 1,
    scaleFalloff: 0.05,
    zStep: -8,
    // 390px縦画面でも接続位置がキャンバス外へ大きくはみ出さない範囲(段が進むごとの
    // 左右オフセット増加を踏まえた安全な上限)。腕8本+最大想定シナリオ(10本)を
    // 十分に超える余裕を持たせつつ、それ以上は超過バッジに回す。
    hardCap: 18,
  },
  leg: {
    category: 'leg',
    mode: 'pair-stack',
    pivot: { x: 128, y: 150 },
    rowStart: 10,
    rowStep: 14,
    columnGap: 24,
    columnGapGrowth: 16,
    rotationBase: 5,
    rotationStep: 13,
    scaleBase: 1,
    scaleFalloff: 0.05,
    zStep: -8,
    hardCap: 20,
  },
  wing: {
    category: 'wing',
    mode: 'pair-stack',
    pivot: { x: 128, y: 100 },
    rowStart: 12,
    rowStep: 24,
    columnGap: 38,
    columnGapGrowth: 10,
    rotationBase: 24,
    rotationStep: 16,
    scaleBase: 1,
    scaleFalloff: 0.05,
    zStep: -4,
    hardCap: 16,
  },
  back: {
    category: 'back',
    mode: 'pair-stack',
    pivot: { x: 128, y: 108 },
    rowStart: 0,
    rowStep: 20,
    columnGap: 16,
    columnGapGrowth: 10,
    rotationBase: 20,
    rotationStep: 10,
    scaleBase: 1,
    scaleFalloff: 0.05,
    zStep: -4,
    hardCap: 12,
  },
  horn: {
    category: 'horn',
    mode: 'radial-fan',
    pivot: { x: 128, y: 100 },
    baseRadius: 45,
    radiusStep: 6,
    angleCenter: 0,
    ringSpanFirst: 60,
    ringSpanGrowth: 45,
    rotationFactor: 0.85,
    scaleBase: 1,
    scaleFalloff: 0.06,
    zStep: -6,
    hardCap: 16,
  },
  tail: {
    category: 'tail',
    mode: 'radial-fan',
    pivot: { x: 128, y: 150 },
    baseRadius: 30,
    radiusStep: 10,
    angleCenter: 25,
    ringSpanFirst: 70,
    ringSpanGrowth: 50,
    rotationFactor: 0.6,
    scaleBase: 1,
    scaleFalloff: 0.05,
    zStep: -4,
    hardCap: 14,
  },
  eye: {
    category: 'eye',
    mode: 'radial-fan',
    pivot: { x: 128, y: 80 },
    baseRadius: 4,
    radiusStep: 18,
    angleCenter: 0,
    ringSpanFirst: 150,
    ringSpanGrowth: 30,
    rotationFactor: 0.2,
    scaleBase: 1,
    scaleFalloff: 0.08,
    zStep: -3,
    hardCap: 10,
  },
  face: {
    category: 'face',
    mode: 'stacked-center',
    pivot: { x: 128, y: 88 },
    jitterRadius: 4,
    scaleBase: 1,
    scaleFalloff: 0.1,
    zStep: -2,
    hardCap: 6,
  },
  armor: {
    category: 'armor',
    mode: 'stacked-center',
    pivot: { x: 128, y: 127 },
    jitterRadius: 6,
    scaleBase: 1,
    scaleFalloff: 0.08,
    zStep: -2,
    hardCap: 8,
  },
  organ: {
    category: 'organ',
    mode: 'stacked-center',
    pivot: { x: 128, y: 128 },
    jitterRadius: 10,
    scaleBase: 1,
    scaleFalloff: 0.1,
    zStep: -2,
    hardCap: 10,
  },
};

// カテゴリごとのzIndexの基準値(描画順グループの帯 + カテゴリ内オフセット)。
// オフセットは元々の素材(layer-manifest.json)のzGroupの相対関係を踏襲した値。
export const CATEGORY_Z_BASE: Record<string, number> = {
  wing: zBaseFor('wing', 15),
  tail: zBaseFor('tail', 20),
  back: zBaseFor('back', 45),
  leg: zBaseFor('leg', 20),
  arm: zBaseFor('arm', 30),
  horn: zBaseFor('horn', 50),
  face: zBaseFor('face', 60),
  eye: zBaseFor('eye', 85),
  armor: zBaseFor('armor', 35),
  organ: zBaseFor('organ', 10),
};

// manifest/profile未定義の未知カテゴリ(=画像未登録)でも部位を消さずに描画するための
// 汎用フォールバック配置。resolveLayerAssetは該当画像が無いためnullを返し、
// FreeLayerFigure側が既存アイコンへフォールバックする(壊れた画像や表示欠落を避ける)。
export const FALLBACK_PROFILE: StackedCenterProfile = {
  category: '__fallback__',
  mode: 'stacked-center',
  pivot: { x: 128, y: 128 },
  jitterRadius: 16,
  scaleBase: 0.4,
  scaleFalloff: 0.05,
  zStep: -2,
  hardCap: 16,
};
