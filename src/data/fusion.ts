import type { PartDef, PartEffect } from './types';
import { PARTS_BY_ID, registerAdditionalParts } from './parts';

// ============================================================
// 部位融合（TEST16）
// ボス撃破後に任意で行える「2部位→1部位」の圧縮システムのデータ定義。
// レシピは代表5種（攻撃系・毒/状態異常系・防御系・多腕/連撃系・ボス部位系）に限定し、
// 第3階層・追加バイオーム・エンドレスモード等は今回のスコープに含めない。
// ============================================================

export type FusionCategory = 'attack' | 'status' | 'defense' | 'combo' | 'boss';

export const FUSION_CATEGORY_LABELS: Record<FusionCategory, string> = {
  attack: '攻撃系',
  status: '毒・状態異常系',
  defense: '防御系',
  combo: '多腕・連撃系',
  boss: 'ボス部位系',
};

// --- 能力継承の安全装置（無制限な連鎖・発動回数の暴走を防ぐための固定上限） ---
// 1) 継承できる能力(PartEffect)は最大2個まで。元の部位が持つ能力の一部だけを引き継ぐ。
export const MAX_INHERITED_EFFECTS = 2;
// 2) 継承する数値系ステータス・能力の量は元の合計値の約6割に丸める（“一部”継承の実装）。
export const FUSION_INHERIT_RATE = 0.6;
// 3) 融合部位(isFused)は再び融合の材料にはできない＝融合の再帰は深さ1までしか許さない。
//    （レシピが常に「通常部位のdefId」のみを材料として参照する設計自体がこれを構造的に保証し、
//    さらに engine/fusion.ts 側でも isFused な部位は材料として拾わないよう二重にガードする）
export const MAX_FUSION_DEPTH = 1;

// 発動回数・スタック数などが「装着数」「発動のたび」に応じて際限なく伸びる/連鎖しうる能力は
// 継承対象から除外する（暴走遺伝子の多重付与や、群体意識・巨大心臓などの装着数依存効果が
// 融合を経由して無制限に積み重なることを防ぐ）。フュージョン専用能力側で個別に
// 「1戦闘あたりの発動回数上限」を持たせるのは fusion_burst_on_hit のみとし、
// それ以外の継承能力は元々「発動のたびに際限なく強化される」性質を持たないもののみを許可する。
export const NON_INHERITABLE_EFFECT_KINDS: ReadonlySet<PartEffect['kind']> = new Set([
  'double_activation_chance_all',
  'fixed_damage_growth_per_proc',
  'duplicate_stack_pct',
  'heart_count_bonus',
  'empty_capacity_damage_bonus',
  'attack_speed_per_count',
  'cost_modifier',
  'capacity_bonus_on_win',
  'extra_drop_candidates',
  'revive_once',
]);

export interface FusionRecipe {
  id: string;
  category: FusionCategory;
  name: string;
  sourceDefIds: [string, string];
  resultDefId: string;
  // 継承した能力の説明用ラベル（プレビュー画面で「元の能力から引き継いだもの」として表示する）
  inheritedEffects: PartEffect[];
  // 融合でのみ得られる専用能力（通常ドロップの部位には存在しない）
  exclusiveEffect: PartEffect;
  exclusiveDescription: string;
  // 融合専用の画像（アイコン）が無いレシピは 'composite' とし、UI側で既存の2部位アイコンを
  // レイヤー合成して表示する（画像素材を持たないこのプロトタイプにおける「合成」の実装）。
  iconMode: 'custom' | 'composite';
  resultBase: Pick<
    PartDef,
    'name' | 'type' | 'species' | 'rarity' | 'cost' | 'hpBonus' | 'attack' | 'interval' | 'description' | 'passiveDescription' | 'tags' | 'icon' | 'color'
  >;
}

export const FUSION_RECIPES: FusionRecipe[] = [
  // --- 攻撃系: 竜爪 + 竜尾 → 双牙の断裂爪 ---
  {
    id: 'fusion_attack_twinfang',
    category: 'attack',
    name: '双牙の断裂爪',
    sourceDefIds: ['dragon_claw', 'dragon_tail'],
    resultDefId: 'fusion_twinfang_claw',
    inheritedEffects: [{ kind: 'counter_on_hit', damage: 2 }], // 竜尾の反撃4の6割を継承
    exclusiveEffect: { kind: 'fusion_burst_on_hit', chance: 0.25, bonusDamagePct: 60, maxActivationsPerBattle: 3 },
    exclusiveDescription: '断裂の一撃（融合専用）: 攻撃命中時25%で追加ダメージ+60%。1戦闘につき最大3回まで発動',
    iconMode: 'custom',
    resultBase: {
      name: '双牙の断裂爪',
      type: 'arm',
      species: 'dragon',
      rarity: 'rare',
      cost: 2,
      hpBonus: 3,
      attack: 8,
      interval: 1.2,
      description: '竜爪の鋭さと竜尾の強靭さを1本の腕へ圧縮した、融合でしか生まれない断裂の腕。',
      passiveDescription: '被弾時、敵へ固定ダメージ2で反撃。攻撃命中時25%で追加ダメージ+60%(1戦闘最大3回)',
      tags: ['counter', 'multihit'],
      icon: '🗡️',
      color: '#b91c1c',
    },
  },
  // --- 毒・状態異常系: 毒針腕 + 糸吐き口 → 猛毒の重顎 ---
  {
    id: 'fusion_status_venomjaw',
    category: 'status',
    name: '猛毒の重顎',
    sourceDefIds: ['insect_poison_needle_arm', 'insect_web_mouth'],
    resultDefId: 'fusion_venom_jaw',
    inheritedEffects: [{ kind: 'apply_poison', amount: 3 }], // 毒2+毒3=5の6割を継承
    exclusiveEffect: { kind: 'poison_no_decay_chance', chance: 0.3 },
    exclusiveDescription: '猛毒の膜（融合専用）: 付与した毒が30%の確率で減衰しない',
    iconMode: 'custom',
    resultBase: {
      name: '猛毒の重顎',
      type: 'head',
      species: 'insect',
      rarity: 'rare',
      cost: 2,
      hpBonus: 0,
      attack: 7,
      interval: 1.6,
      description: '毒針腕の一撃必殺の毒と、糸吐き口の絡め取る顎を1つに圧縮した重顎。',
      passiveDescription: '攻撃命中時、毒+3を付与。付与した毒が30%の確率で減衰しない',
      tags: ['poison'],
      icon: '🦷',
      color: '#4d7c0f',
    },
  },
  // --- 防御系: 甲殻 + 岩石外殻 → 複合甲殻（融合専用画像を持たないため、既存アイコンをレイヤー合成する） ---
  {
    id: 'fusion_defense_compositeshell',
    category: 'defense',
    name: '複合甲殻',
    sourceDefIds: ['insect_carapace', 'golem_rock_shell'],
    resultDefId: 'fusion_composite_shell',
    inheritedEffects: [{ kind: 'damage_reduction_pct', pct: 8 }], // 5+8=13の6割を継承
    exclusiveEffect: { kind: 'counter_on_hit', damage: 8 },
    exclusiveDescription: '合わせ鏡の殻（融合専用）: 被弾時、敵へ固定ダメージ8で反撃する',
    iconMode: 'composite',
    resultBase: {
      name: '複合甲殻',
      type: 'skin',
      species: 'none',
      rarity: 'rare',
      cost: 1,
      hpBonus: 23,
      attack: 0,
      interval: 0,
      description: '虫の甲殻とゴーレムの外殻を重ね合わせた複合装甲。単体の画像は存在せず、2つの部位アイコンを重ねて表示する。',
      passiveDescription: '受けるダメージ-8%。被弾時、敵へ固定ダメージ8で反撃',
      tags: ['defense', 'counter'],
      icon: '🛡️',
      color: '#57534e',
    },
  },
  // --- 多腕・連撃系: 鎌腕 + 巨大拳 → 疾風連牙拳 ---
  {
    id: 'fusion_combo_galefist',
    category: 'combo',
    name: '疾風連牙拳',
    sourceDefIds: ['insect_sickle_arm', 'golem_giant_fist'],
    resultDefId: 'fusion_gale_fist',
    inheritedEffects: [],
    exclusiveEffect: { kind: 'attack_speed_type', targetType: 'arm', pct: 18 },
    exclusiveDescription: '連牙の律動（融合専用）: 装着中の全ての腕・触手の攻撃速度+18%',
    iconMode: 'custom',
    resultBase: {
      name: '疾風連牙拳',
      type: 'arm',
      species: 'none',
      rarity: 'rare',
      cost: 2,
      hpBonus: 0,
      attack: 12,
      interval: 1.5,
      description: '鎌腕の速さと巨大拳の重さを1本へ圧縮し、全身の腕・触手を煽動する連撃の要。',
      passiveDescription: '装着中の全ての腕・触手の攻撃速度+18%',
      tags: ['multihit'],
      icon: '💥',
      color: '#ca8a04',
    },
  },
  // --- ボス部位系: 女王の腹部 + 古代核 → 古代女王核 ---
  {
    id: 'fusion_boss_ancientqueen',
    category: 'boss',
    name: '古代女王核',
    sourceDefIds: ['insect_queen_abdomen', 'golem_ancient_core'],
    resultDefId: 'fusion_ancient_queen_core',
    // 継承候補は4種(heal_tick/status_amount_bonus/capacity_bonus/battle_start_defense)あるが、
    // MAX_INHERITED_EFFECTS=2の上限により2種のみ選抜する（残りは継承されない＝一部継承）。
    inheritedEffects: [
      { kind: 'capacity_bonus', amount: 2 }, // 古代核の接続容量+3の6割を継承
      { kind: 'heal_tick', amount: 5 }, // 女王の腹部の回復8の6割を継承
    ],
    exclusiveEffect: { kind: 'battle_start_defense', amount: 10 },
    exclusiveDescription: '古の女王権（融合専用）: 戦闘開始時に防御+10（継承から漏れた古代核の守りを、より大きな数値で融合専用能力として取り戻す）',
    iconMode: 'custom',
    resultBase: {
      name: '古代女王核',
      type: 'heart',
      species: 'none',
      rarity: 'rare',
      cost: 4,
      hpBonus: 23,
      attack: 0,
      interval: 3.0,
      description: 'エリート級の女王の腹部と古代核、2つのボス級部位を融合した中核器官。',
      passiveDescription: '接続容量+2。3秒毎にHP5回復。戦闘開始時に防御+10',
      tags: ['heal', 'defense'],
      icon: '👑',
      color: '#a16207',
    },
  },
];

function buildFusionResultDef(recipe: FusionRecipe): PartDef {
  return {
    id: recipe.resultDefId,
    ...recipe.resultBase,
    effects: [...recipe.inheritedEffects, recipe.exclusiveEffect],
    isFused: true,
    fusionSourceIds: recipe.sourceDefIds,
    fusionRecipeId: recipe.id,
  };
}

function validateFusionRecipes(recipes: FusionRecipe[]): void {
  const seenResultIds = new Set<string>();
  const seenRecipeIds = new Set<string>();
  for (const r of recipes) {
    if (seenRecipeIds.has(r.id)) throw new Error(`[fusion] duplicate recipe id "${r.id}"`);
    seenRecipeIds.add(r.id);

    const [srcA, srcB] = r.sourceDefIds;
    if (srcA === srcB) throw new Error(`[fusion] recipe ${r.id}: sourceDefIds must reference two distinct parts`);
    for (const srcId of r.sourceDefIds) {
      const src = PARTS_BY_ID[srcId];
      if (!src) throw new Error(`[fusion] recipe ${r.id}: unknown source part "${srcId}"`);
      if (src.isFused) {
        throw new Error(`[fusion] recipe ${r.id}: source "${srcId}" is itself a fused part (MAX_FUSION_DEPTH=${MAX_FUSION_DEPTH} violated)`);
      }
    }

    if (r.inheritedEffects.length > MAX_INHERITED_EFFECTS) {
      throw new Error(`[fusion] recipe ${r.id}: inherits ${r.inheritedEffects.length} effects, exceeds MAX_INHERITED_EFFECTS=${MAX_INHERITED_EFFECTS}`);
    }
    for (const e of r.inheritedEffects) {
      if (NON_INHERITABLE_EFFECT_KINDS.has(e.kind)) {
        throw new Error(`[fusion] recipe ${r.id}: effect kind "${e.kind}" is not inheritable (risk of runaway proc/stack chains)`);
      }
    }

    if (seenResultIds.has(r.resultDefId)) throw new Error(`[fusion] duplicate resultDefId "${r.resultDefId}"`);
    seenResultIds.add(r.resultDefId);
  }
}

validateFusionRecipes(FUSION_RECIPES);

export const FUSION_RESULT_DEFS: Record<string, PartDef> = Object.fromEntries(
  FUSION_RECIPES.map((r) => [r.resultDefId, buildFusionResultDef(r)])
);

export const FUSION_RECIPES_BY_ID: Record<string, FusionRecipe> = Object.fromEntries(FUSION_RECIPES.map((r) => [r.id, r]));

// getPartDef()（data/parts.ts）が融合結果の部位idも解決できるように登録する。
// fusion.ts → parts.ts の一方向importのみで完結し、循環参照は発生しない。
registerAdditionalParts(Object.values(FUSION_RESULT_DEFS));
