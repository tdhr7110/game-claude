import type { PartType, Species, SynergyTier } from './types';

// 部位数シナジー（同じ部位種類を複数装着すると発動）
export const PART_TYPE_SYNERGIES: Record<PartType, SynergyTier[]> = {
  arm: [
    { count: 4, description: '腕・触手の攻撃速度+10%', effect: { kind: 'attack_speed_type', targetType: 'arm', pct: 10 } },
    { count: 6, description: '6回攻撃するたび、装着中の全ての腕・触手が追加攻撃', effect: { kind: 'on_type_attack_count', targetType: 'arm', every: 6 } },
    { count: 10, description: '攻撃時、20%の確率で別の腕・触手が追撃', effect: { kind: 'on_type_attack_chance', targetType: 'arm', chance: 0.2 } },
  ],
  head: [
    { count: 3, description: '状態異常の付与量+1', effect: { kind: 'status_amount_bonus', amount: 1 } },
    { count: 5, description: '頭・口・目の能力が20%の確率で2回発動', effect: { kind: 'type_double_activation_chance', targetType: 'head', chance: 0.2 } },
  ],
  heart: [
    { count: 3, description: '全ての回復量+30%', effect: { kind: 'heal_multiplier', mult: 1.3 } },
    { count: 5, description: '1戦に1回、致死ダメージを受けたときHP20%で復活', effect: { kind: 'revive_once', hpPct: 0.2 } },
  ],
  leg: [
    { count: 4, description: '全部位の攻撃速度+10%', effect: { kind: 'attack_speed_all', pct: 10 } },
    { count: 8, description: '回避率+15%', effect: { kind: 'evasion_bonus', pct: 15 } },
  ],
  skin: [
    { count: 3, description: '受けるダメージ-10%', effect: { kind: 'damage_reduction_pct', pct: 10 } },
    { count: 5, description: 'ダメージを受けるたび敵へ固定ダメージ(8)', effect: { kind: 'counter_on_hit', damage: 8 } },
  ],
};

// 種族シナジー（同じ種族の部位を一定数装着すると発動）
export const SPECIES_SYNERGIES: Record<Exclude<Species, 'none'>, SynergyTier[]> = {
  insect: [
    { count: 3, description: '毒を与えるたび、自分に防御を1付与', effect: { kind: 'on_poison_apply_gain_defense', amount: 1 } },
    { count: 6, description: '毒の継続ダメージ発生時、毒が減少しない確率50%', effect: { kind: 'poison_no_decay_chance', chance: 0.5 } },
  ],
  golem: [
    { count: 3, description: '戦闘開始時に防御10', effect: { kind: 'battle_start_defense', amount: 10 } },
    { count: 6, description: '現在の防御値の一部(30%)を攻撃ダメージに加算', effect: { kind: 'defense_to_damage', pct: 0.3 } },
  ],
  dragon: [
    { count: 3, description: '炎上ダメージ+30%', effect: { kind: 'burn_damage_mult', mult: 1.3 } },
    { count: 6, description: '炎上中の敵への全ダメージ+50%', effect: { kind: 'damage_vs_burning_mult', mult: 1.5 } },
  ],
};
