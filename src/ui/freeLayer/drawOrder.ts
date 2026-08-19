// 自由合体レイヤー表示: 描画順(レイヤー仕様)の定義。
// 「後方 → 胴体 → 側面 → 前方 → 装飾」の5グループでzIndex帯を分け、
// カテゴリごとの前後関係が装着数や装着順に関わらず常に一定になるようにする。
export type DrawGroup = 'back' | 'torso' | 'side' | 'front' | 'decoration';

export const DRAW_GROUP_ORDER: DrawGroup[] = ['back', 'torso', 'side', 'front', 'decoration'];

// 各グループのzIndex帯(帯の中でカテゴリ別・リング別に細かく散らす)。
// 帯を100ずつ離しておくことで、リング分散やジッターで多少ずれても帯を飛び越えない。
export const DRAW_GROUP_Z_BASE: Record<DrawGroup, number> = {
  back: 0,
  torso: 100,
  side: 200,
  front: 300,
  decoration: 400,
};

// レイヤー画像カテゴリ → 描画順グループ。
// - back(後方): 背中側から生えて体の輪郭の後ろに見えるべきもの
// - torso(胴体): 素体そのもの
// - side(側面): 下半身側から左右へ張り出すもの
// - front(前方): 頭部・武器腕など、体の輪郭より手前に見えるべきもの
// - decoration(装飾): 素体の上に薄く重なる装甲・内臓などのアクセント
export const CATEGORY_DRAW_GROUP: Record<string, DrawGroup> = {
  base: 'torso',
  wing: 'back',
  tail: 'back',
  back: 'back',
  leg: 'side',
  arm: 'front',
  horn: 'front',
  face: 'front',
  eye: 'front',
  armor: 'decoration',
  organ: 'decoration',
};

export function drawGroupOf(category: string): DrawGroup {
  return CATEGORY_DRAW_GROUP[category] ?? 'decoration';
}
