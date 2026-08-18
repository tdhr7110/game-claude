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
  | { kind: 'revive_once'; hpPct: number }
  | { kind: 'crit_multiplier_bonus'; amount: number }
  // --- 第1回アップデートで追加した特殊能力用 ---
  // 固定ダメージ（防御・被ダメージ軽減を無視する別ダメージ種）を自分のタイマーで敵に発生させる（千本骨）
  | { kind: 'fixed_damage_tick'; amount: number }
  // 固定ダメージが発生するたび、その戦闘中だけ固定ダメージ量が成長する（穿孔心臓）
  | { kind: 'fixed_damage_growth_per_proc'; amount: number }
  // 同名の部位を複数装着すると、その部位の攻撃力が重複数に応じて上昇する（群体意識）
  | { kind: 'duplicate_stack_pct'; pctPerExtra: number }
  // 未使用の接続容量1につき、最終ダメージが上昇する（空洞核）
  | { kind: 'empty_capacity_damage_bonus'; pctPerUnused: number }
  // 戦闘後のドロップ候補数を増やす（完全捕食）
  | { kind: 'extra_drop_candidates'; amount: number }
  // 全ての部位種類について、能力発動時に低確率でもう一度発動する（暴走遺伝子）
  // maxChain: 1戦闘・1発動あたりの最大連鎖回数（省略時は1=従来通り1回だけ追加発動）。
  // 安全のため、実際の適用時にさらに絶対上限(10)でクランプされる（無限ループ対策）。
  | { kind: 'double_activation_chance_all'; chance: number; maxChain?: number }
  // 心臓・臓器の装着数に応じて最大HPと攻撃力が上昇する（巨大心臓）
  | { kind: 'heart_count_bonus'; hpPerHeart: number; attackPctPerHeart: number };

export interface PartDef {
  id: string;
  name: string;
  type: PartType; // = 管理画面上の「カテゴリ」
  species: Species;
  rarity: Rarity;
  cost: number; // = 接続コスト(connectionCost)
  hpBonus: number; // = HP補正(hpModifier)
  attack: number; // 0 の場合はパッシブ専用（攻撃しない）
  interval: number; // 秒。attack>0 なら攻撃間隔、attack===0 ならパッシブ発動間隔（0の場合は常時静的効果のみ）
  description: string;
  passiveDescription?: string;
  tags: AbilityTag[];
  icon: string;
  color: string;
  effects: PartEffect[];
  // --- 能力管理基盤で追加したメタ情報（すべて省略可・既存データへの後方互換あり） ---
  specialAbilityId?: string; // specialAbilities.ts のエントリと紐づく場合のID（管理画面でのパラメータ編集導線用）
  dropWeight?: number; // 同レアリティ内での相対ドロップ重み（省略時は1として扱う）
  enabled?: boolean; // false の場合、ドロップ候補プールから除外される（省略時はtrue扱い。装備済み部位の解決には影響しない）
  // TEST4: 正式な部位イラストを後から差し替えるための画像パス（省略時はicon絵文字を表示する）。
  image?: string;
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

// ------------------------------------------------------------
// 敵ギミック（TEST2フェーズ2限定: 予告つき特殊行動）
// 敵を強くするためのものではなく、プレイヤーにコマンド使用の判断を促すための仕組み。
// ------------------------------------------------------------
export type EnemyGimmick =
  // ゴーレム系: 一定周期で「防御態勢準備」→「防御態勢」（被ダメージ軽減）→解除、を繰り返す
  | { kind: 'golem_fortify'; cycleSeconds: number; telegraphSeconds: number; fortifyDurationSeconds: number; damageReductionBonusPct: number }
  // ドラゴン系: 大技をチャージし、チャージ完了時に一度だけ強力な一撃を放つ
  | { kind: 'dragon_charge'; chargeSeconds: number; burstMultiplier: number; cooldownSeconds: number }
  // 昆虫系: 予告後、一定時間だけ攻撃速度が大幅上昇する「狂乱状態」になる
  | { kind: 'insect_frenzy'; cycleSeconds: number; telegraphSeconds: number; frenzyDurationSeconds: number; attackSpeedMult: number };

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
  gimmick?: EnemyGimmick;
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
