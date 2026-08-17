// ============================================================
// 特殊能力マスターデータ。
// 各エントリは対応する部位(PartDef.id と同一のid)の effects 配列に対して
// 「どのフィールドを、どんな見た目のUIで、どの範囲まで管理画面から調整可能にするか」を宣言する。
// 実際の適用は specialAbilityHandlers.ts の genericPartEffectParam ハンドラが行う
// （5種いずれも既存の汎用Effectシステムだけで表現できるため、専用の実行ロジックは持たない）。
// ============================================================

import type { SpecialAbilityDef } from './adminTypes';

export const SPECIAL_ABILITIES: SpecialAbilityDef[] = [
  {
    id: 'special_multi_arm_core',
    name: '多腕核',
    description: '腕・触手の接続コストを下げる代わりに、それ以外の接続コストを上げる。',
    tags: ['接続容量', '腕'],
    trigger: 'onPartAdded (passive)',
    handler: 'genericPartEffectParam',
    editableParams: [{ key: 'armCostDelta', label: '腕・触手コスト増減', type: 'number', min: -3, max: 0, step: 1, effectIndex: 0, field: 'delta' }],
    enabled: true,
  },
  {
    id: 'special_plague_core',
    name: '疫病核',
    description: '毒の継続ダメージ発生時、一定確率で毒が減少しない。',
    tags: ['毒'],
    trigger: 'onPoisonTick',
    handler: 'genericPartEffectParam',
    editableParams: [{ key: 'chance', label: '毒が減少しない確率', type: 'percent', min: 0, max: 1, step: 0.05, effectIndex: 0, field: 'chance' }],
    enabled: true,
  },
  {
    id: 'special_piercing_heart',
    name: '穿孔心臓',
    description: '固定ダメージが発生するたび、その戦闘中は固定ダメージ量が成長する。',
    tags: ['固定ダメージ'],
    trigger: 'onFixedDamage',
    handler: 'genericPartEffectParam',
    editableParams: [{ key: 'growthAmount', label: '1回あたりの成長量', type: 'number', min: 0, max: 10, step: 0.5, effectIndex: 0, field: 'amount' }],
    enabled: true,
  },
  {
    id: 'special_hollow_core',
    name: '空洞核',
    description: '未使用の接続容量1につき、最終ダメージが上昇する。',
    tags: ['ダメージ倍率', '少数精鋭'],
    trigger: 'onBattleStart (passive)',
    handler: 'genericPartEffectParam',
    editableParams: [
      { key: 'multiplierPerUnusedCapacity', label: '未使用容量1あたりの倍率(%)', type: 'percent', min: 0, max: 20, step: 1, effectIndex: 0, field: 'pctPerUnused' },
    ],
    enabled: true,
  },
  {
    id: 'special_rampant_gene',
    name: '暴走遺伝子',
    description: '全ての部位の能力発動時、一定確率でもう一度発動する（最大連鎖回数まで）。',
    tags: ['連鎖', '再発動'],
    trigger: 'onAttack / onHeal / periodic',
    handler: 'genericPartEffectParam',
    editableParams: [
      { key: 'chance', label: '再発動確率', type: 'percent', min: 0, max: 1, step: 0.05, effectIndex: 0, field: 'chance' },
      { key: 'maxChain', label: '最大連鎖回数（絶対上限10）', type: 'number', min: 1, max: 10, step: 1, effectIndex: 0, field: 'maxChain' },
    ],
    enabled: true,
  },
];
