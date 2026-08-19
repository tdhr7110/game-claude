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
  | { kind: 'double_activation_chance_all'; chance: number }
  // 心臓・臓器の装着数に応じて最大HPと攻撃力が上昇する（巨大心臓）
  | { kind: 'heart_count_bonus'; hpPerHeart: number; attackPctPerHeart: number }
  // --- 融合専用能力（ボス撃破後の任意融合でのみ付与される。通常ドロップの部位には付かない） ---
  // 攻撃命中時、一定確率で追加ダメージを発生させる。ただし1戦闘あたりの発動回数に上限を設け、
  // 「能力発動が無限に連鎖しない」ことを構造的に保証する（上限はbattle.ts側でmaxActivationsPerBattleを厳守）。
  | { kind: 'fusion_burst_on_hit'; chance: number; bonusDamagePct: number; maxActivationsPerBattle: number };

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
  // --- 融合部位のみ設定される（通常ドロップの部位にはundefined） ---
  isFused?: boolean; // trueの場合、この部位自体をさらに融合の材料にすることはできない（再帰・無限連鎖の防止）
  fusionSourceIds?: [string, string]; // 融合元となった2部位のdefId
  fusionRecipeId?: string; // 由来レシピID（図鑑・重複登録判定に使用）
}

export interface PartInstance {
  instanceId: string;
  defId: string;
}

// ------------------------------------------------------------
// 敵データ
// ------------------------------------------------------------

export type EnemyTier = 'normal' | 'elite' | 'miniboss' | 'boss';

// 大技の予兆表示（TEST7: 敵選択で事前説明したうえで、身構える等の対策コマンドで軽減できるようにするための
// 純粋にデータ駆動な仕組み。特定moveの発動タイマーが残りwarnBeforeSec以内になったら一度だけログを出す）
export interface MoveTelegraph {
  warnBeforeSec: number;
  message: string;
}

export interface EnemyMove {
  id: string;
  name: string;
  attack: number;
  interval: number; // 0 = パッシブ
  tags: AbilityTag[];
  effects: PartEffect[];
  icon: string;
  telegraph?: MoveTelegraph;
}

// ------------------------------------------------------------
// 敵固有ギミック（TEST7: enemyGimmickEngine.ts が解釈する実行時ギミック）
// ここに列挙された種類だけを engine 側が処理する。敵IDごとの分岐は持たず、
// kind + params の組み合わせだけで全敵の挙動を表現する。
// ------------------------------------------------------------

export type GimmickKind =
  | 'poison_ramp' // 時間経過で毒の付与量(status_amount_bonus相当)が増えていく
  | 'enrage_below_hp' // HP割合が閾値以下になると攻撃速度が上昇する
  | 'periodic_reflect' // 一定周期・一定時間だけ反射状態になる
  | 'burn_stack_explode' // 相手が炎上中のとき、一定間隔で追加の爆発ダメージ
  | 'evade_charge' // 回避の構え→直後に突撃、突撃後は自身の防御が下がる
  | 'stance_cycle' // 防御姿勢(被ダメ軽減)⇄攻撃姿勢(被ダメ増加の隙)を周期で切り替える
  | 'phase_shift_below_hp'; // HP割合が閾値を下回った瞬間に一度だけ強化される(中ボス/ボス向け)

export interface EnemyGimmickEffectDef {
  kind: GimmickKind;
  params: Record<string, number>;
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
  // --- TEST7: 敵撃破ドロップの部位限定 + 敵選択画面用ギミック情報 ---
  // この敵が実際に持つ通常部位。通常ドロップはここからのみ抽選する(最低3個)。
  bodyPartIds: string[];
  // 低確率でのみ入手できるレア部位。0件でもよい。
  rareDropPartIds: string[];
  // 敵選択画面に事前表示する固有ギミックの説明文(必須。予兆・複数周期攻撃など
  // move側だけで表現されるギミックの説明もここに含める)。
  gimmickSummary: string;
  // enemyGimmickEngine.ts が実際に処理する数値ギミック。0件でもよい
  // (telegraphや複数moveの非同期発動などmoves側だけで完結するギミックはここに含めない)。
  gimmicks: EnemyGimmickEffectDef[];
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
