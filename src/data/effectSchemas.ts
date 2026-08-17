// ============================================================
// 管理画面の「通常能力」ビルダーが扱えるEffect kindのスキーマ一覧。
// 既存の PartEffect をそのまま使う（新しい実行エンジンは作らない）。
// ここに載っていないkind（aura_add_onhit や cost_modifier の all_except 指定等）は、
// 複雑な入れ子・特殊指定を含むため今回のジェネリックUIでは編集対象外とし、
// 管理画面上では読み取り専用のサマリー表示にとどめる（既存の挙動は保持される）。
//
// 各kindの「Trigger」はエンジン内で暗黙的に決まっている（表示用ラベルとして付与）。
// ============================================================

import type { EffectKindSchema } from './adminTypes';

export const EFFECT_KIND_SCHEMAS: EffectKindSchema[] = [
  { kind: 'apply_poison', label: '毒付与 (addPoison)', trigger: 'onHit', fields: [{ key: 'amount', label: '毒付与量', type: 'number' }] },
  {
    kind: 'apply_burn',
    label: '炎上付与 (addBurn)',
    trigger: 'onHit',
    fields: [
      { key: 'dps', label: '秒間ダメージ', type: 'number' },
      { key: 'duration', label: '持続秒数', type: 'number' },
    ],
  },
  { kind: 'heal_tick', label: '回復 (heal)', trigger: 'periodic', fields: [{ key: 'amount', label: '回復量', type: 'number' }] },
  { kind: 'fixed_damage_tick', label: '固定ダメージ (fixedDamage)', trigger: 'periodic', fields: [{ key: 'amount', label: '固定ダメージ量', type: 'number' }] },
  { kind: 'damage_reduction_pct', label: '被ダメージ軽減 (modifyDefense)', trigger: 'onReceiveDamage (passive)', fields: [{ key: 'pct', label: '軽減率(%)', type: 'percent' }] },
  { kind: 'counter_on_hit', label: '被弾時の固定反撃 (additionalAttack)', trigger: 'onReceiveDamage', fields: [{ key: 'damage', label: '反撃ダメージ', type: 'number' }] },
  { kind: 'evasion_bonus', label: '回避率上昇', trigger: 'passive', fields: [{ key: 'pct', label: '回避率(%)', type: 'percent' }] },
  { kind: 'attack_speed_all', label: '全部位の攻撃速度 (modifyAttackSpeed)', trigger: 'passive', fields: [{ key: 'pct', label: '速度変化(%)', type: 'percent' }] },
  {
    kind: 'attack_speed_type',
    label: '特定部位種類の攻撃速度',
    trigger: 'passive',
    fields: [
      { key: 'targetType', label: '対象部位種類', type: 'partType' },
      { key: 'pct', label: '速度変化(%)', type: 'percent' },
    ],
  },
  { kind: 'capacity_bonus', label: '接続容量ボーナス (modifyConnectionCapacity)', trigger: 'onPartAdded (passive)', fields: [{ key: 'amount', label: '容量+', type: 'number' }] },
  { kind: 'capacity_bonus_on_win', label: '勝利時に接続容量+ (modifyDropCount系)', trigger: 'onBattleWin', fields: [{ key: 'amount', label: '容量+', type: 'number' }] },
  {
    kind: 'cost_modifier',
    label: '接続コスト変更 (modifyConnectionCost)',
    trigger: 'onPartAdded (passive)',
    fields: [
      { key: 'targetType', label: '対象部位種類', type: 'partType' },
      { key: 'delta', label: 'コスト増減', type: 'number' },
    ],
  },
  { kind: 'battle_start_defense', label: '戦闘開始時防御 (onBattleStart)', trigger: 'onBattleStart', fields: [{ key: 'amount', label: '防御+', type: 'number' }] },
  { kind: 'status_amount_bonus', label: '状態異常の付与量+', trigger: 'onPoisonApply / onHit', fields: [{ key: 'amount', label: '付与量+', type: 'number' }] },
  { kind: 'heal_multiplier', label: '回復量の倍率', trigger: 'onHeal (passive)', fields: [{ key: 'mult', label: '倍率', type: 'number', step: 0.05 }] },
  { kind: 'burn_damage_mult', label: '炎上ダメージ倍率', trigger: 'passive', fields: [{ key: 'mult', label: '倍率', type: 'number', step: 0.05 }] },
  { kind: 'damage_vs_burning_mult', label: '炎上中の敵への全ダメージ倍率', trigger: 'onAttack', fields: [{ key: 'mult', label: '倍率', type: 'number', step: 0.05 }] },
  { kind: 'defense_to_damage', label: '防御力の一部をダメージに加算', trigger: 'onAttack', fields: [{ key: 'pct', label: '加算割合(%)', type: 'percent' }] },
  { kind: 'poison_no_decay_chance', label: '毒が減少しない確率', trigger: 'onPoisonTick', fields: [{ key: 'chance', label: '確率', type: 'percent' }] },
  { kind: 'on_poison_apply_gain_defense', label: '毒付与時に防御+', trigger: 'onPoisonApply', fields: [{ key: 'amount', label: '防御+', type: 'number' }] },
  { kind: 'revive_once', label: '致死ダメージから復活(1戦に1回)', trigger: 'onDamage (lethal)', fields: [{ key: 'hpPct', label: '復活時HP割合', type: 'percent' }] },
  { kind: 'crit_multiplier_bonus', label: '会心ダメージ倍率+', trigger: 'onCritical', fields: [{ key: 'amount', label: '倍率+', type: 'number', step: 0.05 }] },
  { kind: 'fixed_damage_growth_per_proc', label: '固定ダメージが発動毎に成長', trigger: 'onFixedDamage', fields: [{ key: 'amount', label: '成長量', type: 'number', step: 0.5 }] },
  { kind: 'duplicate_stack_pct', label: '同名部位の重複で攻撃力上昇', trigger: 'onBattleStart (passive)', fields: [{ key: 'pctPerExtra', label: '重複1個あたり(%)', type: 'percent' }] },
  { kind: 'empty_capacity_damage_bonus', label: '未使用容量1につき最終ダメージ上昇', trigger: 'onBattleStart (passive)', fields: [{ key: 'pctPerUnused', label: '容量1あたり(%)', type: 'percent' }] },
  { kind: 'extra_drop_candidates', label: 'ドロップ候補数+ (modifyDropCount)', trigger: 'onBattleWin', fields: [{ key: 'amount', label: '候補数+', type: 'number' }] },
  {
    kind: 'double_activation_chance_all',
    label: '能力の連鎖再発動',
    trigger: 'onAttack / onHeal / periodic',
    fields: [
      { key: 'chance', label: '再発動確率', type: 'percent' },
      { key: 'maxChain', label: '最大連鎖回数', type: 'number' },
    ],
  },
  {
    kind: 'heart_count_bonus',
    label: '心臓・臓器の装着数に応じたHP/攻撃力上昇',
    trigger: 'onBattleStart (passive)',
    fields: [
      { key: 'hpPerHeart', label: '心臓1個あたりHP+', type: 'number' },
      { key: 'attackPctPerHeart', label: '心臓1個あたり攻撃力(%)', type: 'percent' },
    ],
  },
  {
    kind: 'attack_speed_per_count',
    label: '特定部位数ごとの攻撃速度上昇',
    trigger: 'passive',
    fields: [
      { key: 'countType', label: 'カウント対象部位種類', type: 'partType' },
      { key: 'per', label: '何個ごとか', type: 'number' },
      { key: 'pctEach', label: '1段階あたり(%)', type: 'percent' },
    ],
  },
];

export function getEffectSchema(kind: string): EffectKindSchema | undefined {
  return EFFECT_KIND_SCHEMAS.find((s) => s.kind === kind);
}
