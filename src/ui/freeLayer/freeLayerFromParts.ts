// TEST11: 実際の装着部位(PartType: arm/head/heart/leg/skin)を、自由合体レイヤー素材の
// カテゴリ(arm/wing/horn/tail/leg/organ/eye/face/armor/back)へ対応付ける。
// あくまで見た目の表示先を決めるだけの対応表で、能力計算・戦闘ロジックには一切影響しない。
import type { PartType } from '../../data/types';

const PART_TYPE_TO_LAYER_CATEGORY: Record<PartType, string> = {
  arm: 'arm', // 腕・触手 → 腕レイヤー
  leg: 'leg', // 脚・翼 → 脚レイヤー
  head: 'horn', // 頭・口・目 → 頭部の角レイヤー
  heart: 'organ', // 心臓・臓器 → 内臓レイヤー
  skin: 'armor', // 皮膚・外殻 → 装甲レイヤー
};

export function layerCountsFromPartTypeCounts(counts: Partial<Record<PartType, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of Object.keys(PART_TYPE_TO_LAYER_CATEGORY) as PartType[]) {
    out[PART_TYPE_TO_LAYER_CATEGORY[type]] = counts[type] ?? 0;
  }
  return out;
}

export function groupPartTypeCounts(parts: { type: PartType }[]): Record<PartType, number> {
  const out: Record<PartType, number> = { arm: 0, head: 0, heart: 0, leg: 0, skin: 0 };
  for (const p of parts) out[p.type] += 1;
  return out;
}
