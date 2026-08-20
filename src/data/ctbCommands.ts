// ============================================================
// TEST19: CTB(行動順可視化型コマンドバトル)プロトタイプ専用のコマンド定義。
//
// 本線のコマンドシステム(data/commandDefs.ts / engine/battle.ts)とは
// 完全に独立している。理由:
//   - 本線コマンドの効果実行(executeCommandEffect)はBattleEngineの private
//     メソッドに密結合しており、CTBの「行動順(CT)への影響」という概念を
//     持たないため、そのまま流用すると大規模な改修が必要になる。
//   - 一方で「強打」「身構える」など"性質"は本線コマンドと重複させたくない
//     ため、命名・アイコン・カテゴリ色は本線のCOMMAND_CATEGORY_COLORSを再利用する。
//
// 数値(metabolismCost / ctMultiplier / powerMult)はすべて仮の値。
// CTB採用が決まった後のバランス調整で作り直す前提。
// ============================================================

import { COMMAND_CATEGORY_COLORS } from './commandDefs';

export type CtbCommandKind = 'attack' | 'guard';

export interface CtbCommandDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  kind: CtbCommandKind;
  metabolismCost: number;
  // 1.0 = 標準。小さいほど次の自分の行動が早くなり、大きいほど遅くなる。
  ctMultiplier: number;
  // 攻撃コマンドの威力倍率(基礎攻撃力に対する倍率)。防御コマンドは0。
  powerMult: number;
  // 防御コマンドのみ: 次に受ける1回の攻撃のダメージを軽減する割合(%)。
  guardReductionPct?: number;
}

export const CTB_COMMANDS: CtbCommandDef[] = [
  {
    id: 'ctb_normal',
    name: '通常攻撃',
    icon: '👊',
    color: COMMAND_CATEGORY_COLORS.attack,
    description: '標準威力の攻撃。代謝を消費しない、CTBの基本行動。',
    kind: 'attack',
    metabolismCost: 0,
    ctMultiplier: 1.0,
    powerMult: 1.0,
  },
  {
    id: 'ctb_quick',
    name: '高速攻撃',
    icon: '⚡',
    color: COMMAND_CATEGORY_COLORS.spell,
    description: '威力は低いが、代謝を消費して次の行動を大きく早める。',
    kind: 'attack',
    metabolismCost: 10,
    ctMultiplier: 0.6,
    powerMult: 0.6,
  },
  {
    id: 'ctb_heavy',
    name: '強打',
    icon: '💥',
    color: COMMAND_CATEGORY_COLORS.debuff,
    description: '代謝を消費して高威力の一撃を放つが、次の行動が遅くなる。',
    kind: 'attack',
    metabolismCost: 25,
    ctMultiplier: 1.7,
    powerMult: 1.8,
  },
  {
    id: 'ctb_guard',
    name: '防御',
    icon: '🛡️',
    color: COMMAND_CATEGORY_COLORS.buff,
    description: '少量の代謝で次に受ける1回の攻撃ダメージを軽減する。次の行動は比較的早い。',
    kind: 'guard',
    metabolismCost: 5,
    ctMultiplier: 0.8,
    powerMult: 0,
    guardReductionPct: 50,
  },
];

export function getCtbCommand(id: string): CtbCommandDef | undefined {
  return CTB_COMMANDS.find((c) => c.id === id);
}
