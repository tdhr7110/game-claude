// ============================================================
// 共通型定義（ゲームデータと処理を分離するための土台）
// ============================================================

export type Species = 'insect' | 'golem' | 'dragon' | 'none';
export type PartType = 'arm' | 'head' | 'heart' | 'leg' | 'skin';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type AbilityTag = 'poison' | 'fire' | 'multihit' | 'defense' | 'heal' | 'counter';

export const PART_TYPE_LABELS: Record<PartType, string> = {
  arm: '腕・触手',
  head: '頭・口・目',
  heart: '心臓・臓器',
  leg: '脚・翼',
  skin: '皮膚・外殻',
};

export const SPECIES_LABELS: Record<Species, string> = {
  insect: '昆虫',
  golem: 'ゴーレム',
  dragon: 'ドラゴン',
  none: '無属性',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'コモン',
  uncommon: 'アンコモン',
  rare: 'レア',
};

export const TAG_LABELS: Record<AbilityTag, string> = {
  poison: '毒',
  fire: '炎',
  multihit: '連撃',
  defense: '防御',
  heal: '回復',
  counter: '反撃',
};

// ------------------------------------------------------------
// パーツ効果（データ駆動のエフェクト記述子）
// engine 側が kind ごとに解釈する。data 層はロジックを持たない。
// ------------------------------------------------------------

export type PartEffect =
  // --- 攻撃に付随して発動（自分のヒット時） ---
  | { kind: 'apply_poison'; amount: number }
  | { kind: 'apply_burn'; dps: number; duration: number }
  // --- 他パーツの攻撃に効果を追加するオーラ（例: 毒腺） ---
  | { kind: 'aura_add_onhit'; targetType: PartType; effect: { kind: 'apply_poison'; amount: number } | { kind: 'apply_burn'; dps: number; duration: number } }
  // --- 独立タイマーで発動するパッシブ ---
  | { kind: 'heal_tick'; amount: number; isPercent?: boolean }
  // --- 常時適用の静的修飾 ---
  | { kind: 'damage_reduction_pct'; pct: number }
  | { kind: 'counter_on_hit'; damage: number }
  | { kind: 'evasion_bonus'; pct: number }
  | { kind: 'attack_speed_all'; pct: number }
  | { kind: 'attack_speed_type'; targetType: PartType; pct: number }
  | { kind: 'attack_speed_per_count'; countType: PartType; per: number; pctEach: number }
  | { kind: 'capacity_bonus'; amount: number }
  | { kind: 'capacity_bonus_on_win'; amount: number }
  | { kind: 'cost_modifier'; targetType: PartType | 'all_except'; exceptType?: PartType; delta: number }
  | { kind: 'battle_start_defense'; amount: number }
  | { kind: 'status_amount_bonus'; amount: number }
  | { kind: 'heal_multiplier'; mult: number }
  | { kind: 'burn_damage_mult'; mult: number }
  | { kind: 'damage_vs_burning_mult'; mult: number }
  | { kind: 'defense_to_damage'; pct: number }
  | { kind: 'poison_no_decay_chance'; chance: number }
  | { kind: 'on_poison_apply_gain_defense'; amount: number }
  | { kind: 'revive_once'; hpPct: number };

export interface PartDef {
  id: string;
  name: string;
  type: PartType;
  species: Species;
  rarity: Rarity;
  cost: number;
  hpBonus: number;
  attack: number; // 0 の場合はパッシブ専用（攻撃しない）
  interval: number; // 秒。attack>0 なら攻撃間隔、attack===0 ならパッシブ発動間隔（0の場合は常時静的効果のみ）
  description: string;
  passiveDescription?: string;
  tags: AbilityTag[];
  icon: string;
  color: string;
  effects: PartEffect[];
}

export interface PartInstance {
  instanceId: string;
  defId: string;
}

// ------------------------------------------------------------
// 敵データ
// ------------------------------------------------------------

export type EnemyTier = 'normal' | 'elite' | 'miniboss' | 'boss';

export interface EnemyMove {
  id: string;
  name: string;
  attack: number;
  interval: number; // 0 = パッシブ
  tags: AbilityTag[];
  effects: PartEffect[];
  icon: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  species: Species | 'chimera';
  tier: EnemyTier;
  hp: number;
  defense: number;
  damageReductionPct: number;
  evasionPct: number;
  moves: EnemyMove[];
  description: string;
  icon: string;
  color: string;
}

// ------------------------------------------------------------
// シナジー
// ------------------------------------------------------------

export type SynergyEffect =
  | { kind: 'attack_speed_type'; targetType: PartType; pct: number }
  | { kind: 'attack_speed_all'; pct: number }
  | { kind: 'on_type_attack_count'; targetType: PartType; every: number }
  | { kind: 'on_type_attack_chance'; targetType: PartType; chance: number }
  | { kind: 'status_amount_bonus'; amount: number }
  | { kind: 'type_double_activation_chance'; targetType: PartType; chance: number }
  | { kind: 'heal_multiplier'; mult: number }
  | { kind: 'revive_once'; hpPct: number }
  | { kind: 'evasion_bonus'; pct: number }
  | { kind: 'damage_reduction_pct'; pct: number }
  | { kind: 'counter_on_hit'; damage: number }
  | { kind: 'on_poison_apply_gain_defense'; amount: number }
  | { kind: 'poison_no_decay_chance'; chance: number }
  | { kind: 'battle_start_defense'; amount: number }
  | { kind: 'defense_to_damage'; pct: number }
  | { kind: 'burn_damage_mult'; mult: number }
  | { kind: 'damage_vs_burning_mult'; mult: number };

export interface SynergyTier {
  count: number;
  description: string;
  effect: SynergyEffect;
}
