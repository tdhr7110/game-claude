// 自由合体レイヤー表示: 実際の装着部位を、自由合体レイヤー素材のカテゴリへ対応付ける。
// あくまで見た目の表示先を決めるだけの対応表で、能力計算・戦闘ロジックには一切影響しない。
//
// 重要: ここでは「カテゴリの個数」ではなく「部位ID(defId・敵の技ID)」単位でEquippedPartRefを
// 作る。同じ部位を複数装着しても、装着インスタンスごとに安定したinstanceIdを持たせることで、
// resolveChimeraLayers側が部位IDに応じて画像を出し分け・接続位置を動的分散できるようにする。
import type { PartType } from '../../data/types';
import type { EquippedPartRef } from './types';

const PART_TYPE_TO_LAYER_CATEGORY: Record<PartType, string> = {
  arm: 'arm', // 腕・触手 → 腕レイヤー
  leg: 'leg', // 脚・翼 → 脚レイヤー
  head: 'horn', // 頭・口・目 → 頭部の角レイヤー
  heart: 'organ', // 心臓・臓器 → 内臓レイヤー
  skin: 'armor', // 皮膚・外殻 → 装甲レイヤー
};

// プレイヤー側: state.equipped(instanceId + defId)をそのままEquippedPartRefへ変換する。
export function playerPartsToLayerRefs(equipped: { instanceId: string; defId: string; type: PartType }[]): EquippedPartRef[] {
  return equipped.map((e) => ({
    instanceId: e.instanceId,
    partId: e.defId,
    category: PART_TYPE_TO_LAYER_CATEGORY[e.type],
  }));
}

// 敵側: 技(PartSnapshot相当。type自体は戦闘エンジン内部の分類で常に'arm'扱いだが、
// 見た目はicon+nameで十分に区別できるため、instanceId(=技ID)をそのままpartIdとして使う。
export function enemyPartsToLayerRefs(parts: { instanceId: string }[]): EquippedPartRef[] {
  return parts.map((p) => ({
    instanceId: p.instanceId,
    partId: p.instanceId,
    category: 'arm',
  }));
}
