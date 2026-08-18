// ============================================================
// 特殊能力Custom Handlerレジストリ。
//
// 新しい特殊能力を追加する手順:
//   1. この配列に handler 関数を1つ追加する
//   2. src/data/specialAbilities.ts に SpecialAbilityDef を1つ追加し、handler欄でこの関数を参照する
//   3. 対応する部位のPartDef.effectsに、パラメータが書き込まれる先の初期Effectを用意する
// これだけでゲーム本体（battle.ts/run.ts等）を変更せずに済む構造を狙っている。
//
// 現時点で登録されている5つの初期特殊能力は、いずれも既存の汎用Effect（PartEffect）
// だけで表現できるため、genericPartEffectParam という「パラメータをeffects配列の
// 指定フィールドへそのまま書き込むだけ」の汎用ハンドラ1つで動作する。
// 将来、既存Effectでは表現できない真に専用のロジックが必要な特殊能力（例: 部位を捕食して
// 能力をコピーする等）を追加する場合は、この registry に新しい handler 関数を追加すればよい。
// ============================================================

import type { PartDef, PartEffect } from '../data/types';
import type { SpecialAbilityDef } from '../data/adminTypes';

export type SpecialAbilityHandler = (part: PartDef, ability: SpecialAbilityDef, params: Record<string, number>) => PartEffect[];

// 汎用ブリッジ: editableParams で宣言された effectIndex/field へ、渡された値をそのまま書き込む。
function genericPartEffectParam(part: PartDef, ability: SpecialAbilityDef, params: Record<string, number>): PartEffect[] {
  const effects = part.effects.map((e) => ({ ...e })) as PartEffect[];
  for (const paramSpec of ability.editableParams) {
    const value = params[paramSpec.key];
    if (value === undefined) continue;
    const target = effects[paramSpec.effectIndex] as unknown as Record<string, unknown>;
    if (target) target[paramSpec.field] = value;
  }
  return effects;
}

export const specialAbilityHandlers: Record<string, SpecialAbilityHandler> = {
  genericPartEffectParam,
};

export function applySpecialAbilityParams(part: PartDef, ability: SpecialAbilityDef, params: Record<string, number>): PartEffect[] {
  const handler = specialAbilityHandlers[ability.handler];
  if (!handler) return part.effects;
  return handler(part, ability, params);
}

// 現在のeffects配列から、editableParamsで宣言された値を読み出す（管理画面の初期表示・差分表示用）
export function readSpecialAbilityParams(part: PartDef, ability: SpecialAbilityDef): Record<string, number> {
  const result: Record<string, number> = {};
  for (const paramSpec of ability.editableParams) {
    const effect = part.effects[paramSpec.effectIndex] as unknown as Record<string, unknown> | undefined;
    const raw = effect ? effect[paramSpec.field] : undefined;
    result[paramSpec.key] = typeof raw === 'number' ? raw : (paramSpec.key === 'maxChain' ? 1 : 0);
  }
  return result;
}
