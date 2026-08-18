// ============================================================
// 戦闘中コマンドのマスターデータ（TEST2フェーズ2限定）。
// 新しいコマンドを追加する手順:
//   1. この配列にCommandDefを1つ追加する
//   2. src/engine/battle.ts の executeCommand() に case を1つ追加し、実際の処理を書く
// 部位由来コマンド（例: 竜の頭→火炎放射）は requiresPartId を指定すると、
// その部位を装着している場合のみ使用可能になる。
// ============================================================

export interface CommandDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseCooldown: number; // 秒
  requiresPartId?: string; // 指定した場合、その部位を装着していないと使用不可（部位由来コマンド）
}

export const COMMAND_DEFS: CommandDef[] = [
  {
    id: 'alpha_strike',
    name: '一斉発動',
    icon: '⚡',
    description: '装着中の攻撃可能な部位を全て即時発動する。腕・触手が多いほど追加の一斉攻撃が発生する。',
    // TEST2再調整: 15→18秒。多腕ビルドでの威力(スケーリング)自体は維持しつつ、連発しにくくして
    // 暴走・防御が使われる場面を増やす（一斉発動が他コマンドの見せ場を食っている問題への対応）。
    baseCooldown: 18,
  },
  {
    id: 'rampage',
    name: '暴走',
    icon: '🔥',
    description: '5秒間、全部位の攻撃速度が倍増する。効果終了後4秒間は反動で低下する。',
    baseCooldown: 20,
  },
  {
    id: 'guard',
    name: '防御',
    icon: '🛡️',
    description: '数秒間、受けるダメージを大幅に軽減する。敵の大技の前に使うと効果的。',
    baseCooldown: 15,
  },
  {
    id: 'flame_breath',
    name: '火炎放射',
    icon: '🐲',
    description: '竜の頭部（火炎頭）を装着している場合のみ使用可能。敵に大ダメージと炎上を与える。',
    baseCooldown: 18,
    requiresPartId: 'dragon_flame_head',
  },
];
