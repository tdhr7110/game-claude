import type { AbilityTag, PartDef, PartType } from './types';

// ============================================================
// コマンドバトルTEST専用の技データ（本線のオートバトルとは完全に独立）。
// 「現在装着している部位」だけを見て、コマンド枠(通常/変異/防御)ごとに
// 条件を満たす技の中から優先度最大のものを採用する。
//
// 新しい技を追加する場合は、この配列に TurnSkillDef を1つ追加するだけでよい。
// 将来Googleスプレッドシート等の外部データから読み込む場合も、この配列を
// 置き換えるだけで済むようにデータと判定ロジック(meetsSkillCondition等)を分離している。
// ============================================================

export type TurnCommandSlot = 'normal' | 'mutation' | 'guard';

export const TURN_COMMAND_SLOTS: TurnCommandSlot[] = ['normal', 'mutation', 'guard'];

export const TURN_COMMAND_SLOT_LABELS: Record<TurnCommandSlot, string> = {
  normal: '通常技',
  mutation: '変異技',
  guard: '防御技',
};

// 技効果の種別。実行処理(effectId毎の解釈)は engine/turnBattle.ts に集約し、
// このファイルは「条件判定用のデータ」と「値(effectValues)」のみを持つ。
export type TurnEffectId =
  | 'wait' // 変異技フォールバック(条件を一つも満たさない場合の様子見)
  | 'single_hit'
  | 'multi_hit_flat'
  | 'multi_hit_finisher'
  | 'multi_hit_poison_stack'
  | 'poison_bolt'
  | 'poison_burst'
  | 'guard_reduce'
  | 'guard_reflect';

export interface TurnSkillCondition {
  // これらの部位IDを「1個以上」装着していること(全て満たす必要あり)
  requiredPartIds?: string[];
  // 特定の部位IDを「指定数以上」装着していること(同じ部位の重複装着数)
  requiredPartCounts?: { partId: string; count: number }[];
  // 部位種類(カテゴリ)を「指定数以上」装着していること(例: 腕・触手カテゴリ3個以上)
  requiredCategoryCounts?: { type: PartType; count: number }[];
  // 装着部位のいずれかがこのタグを持っていること(将来の拡張用フック。現状の10技では未使用)
  requiredTags?: AbilityTag[];
}

export interface TurnSkillDef extends TurnSkillCondition {
  skillId: string;
  commandSlot: TurnCommandSlot;
  name: string;
  description: string;
  priority: number; // 同じ枠内で条件を満たす技が複数あるとき、最大のものを採用
  cooldown: number; // ターン数。0 = クールダウンなし
  effectId: TurnEffectId;
  effectValues: Record<string, number>; // 数値調整はすべてここに集約する
}

// --- 判定処理（技効果の実行とは分離） ---

export function meetsSkillCondition(skill: TurnSkillCondition, equipped: PartDef[]): boolean {
  if (skill.requiredPartIds) {
    for (const id of skill.requiredPartIds) {
      if (!equipped.some((p) => p.id === id)) return false;
    }
  }
  if (skill.requiredPartCounts) {
    for (const req of skill.requiredPartCounts) {
      const count = equipped.filter((p) => p.id === req.partId).length;
      if (count < req.count) return false;
    }
  }
  if (skill.requiredCategoryCounts) {
    for (const req of skill.requiredCategoryCounts) {
      const count = equipped.filter((p) => p.type === req.type).length;
      if (count < req.count) return false;
    }
  }
  if (skill.requiredTags) {
    for (const tag of skill.requiredTags) {
      if (!equipped.some((p) => p.tags.includes(tag))) return false;
    }
  }
  return true;
}

export function resolveSkillForSlot(slot: TurnCommandSlot, equipped: PartDef[]): TurnSkillDef | null {
  let best: TurnSkillDef | null = null;
  for (const skill of TURN_SKILLS) {
    if (skill.commandSlot !== slot) continue;
    if (!meetsSkillCondition(skill, equipped)) continue;
    if (!best || skill.priority > best.priority) best = skill;
  }
  return best;
}

export function resolveActiveSkills(equipped: PartDef[]): Record<TurnCommandSlot, TurnSkillDef | null> {
  return {
    normal: resolveSkillForSlot('normal', equipped),
    mutation: resolveSkillForSlot('mutation', equipped),
    guard: resolveSkillForSlot('guard', equipped),
  };
}

// --- 技データ本体 ---

export const TURN_SKILLS: TurnSkillDef[] = [
  // ===== 通常技（腕・触手系。常にどれか1つは使用可能） =====
  {
    skillId: 'normal_punch',
    commandSlot: 'normal',
    name: '殴る',
    description: '腕で殴りつける基本の一撃。',
    requiredCategoryCounts: [{ type: 'arm', count: 1 }],
    priority: 1,
    cooldown: 0,
    effectId: 'single_hit',
    effectValues: { damage: 7 },
  },
  {
    skillId: 'normal_flurry',
    commandSlot: 'normal',
    name: '乱打',
    description: '複数の腕で連続して殴りつける。1発は軽いが手数で上回る。',
    requiredCategoryCounts: [{ type: 'arm', count: 3 }],
    priority: 2,
    cooldown: 0,
    effectId: 'multi_hit_flat',
    effectValues: { hits: 3, damagePerHit: 4 },
  },
  {
    skillId: 'normal_sickle_slash',
    commandSlot: 'normal',
    name: '鎌鼬連斬',
    description: '鎌腕2本で斬りつけ、最後の一撃に力を込める。',
    requiredPartCounts: [{ partId: 'insect_sickle_arm', count: 2 }],
    priority: 3,
    cooldown: 0,
    effectId: 'multi_hit_finisher',
    effectValues: { hits: 3, damagePerHit: 4, finisherDamage: 11 },
  },
  {
    skillId: 'normal_poison_sickle_dance',
    commandSlot: 'normal',
    name: '毒鎌乱舞',
    description: '鎌腕2本と毒腺で5連撃。敵の毒が十分に溜まっていれば追撃が入る。',
    requiredPartCounts: [{ partId: 'insect_sickle_arm', count: 2 }],
    requiredPartIds: ['insect_poison_gland'],
    priority: 4,
    cooldown: 0,
    effectId: 'multi_hit_poison_stack',
    effectValues: { hits: 5, damagePerHit: 4, poisonPerHit: 1, poisonThreshold: 5, bonusDamage: 14 },
  },

  // ===== 変異技（毒・炎系。条件を満たさない間は様子見のみ） =====
  {
    skillId: 'mutation_wait',
    commandSlot: 'mutation',
    name: '様子を見る',
    description: '変異技の条件を満たしていない。軽く牽制するにとどまる。',
    priority: -1,
    cooldown: 0,
    effectId: 'wait',
    effectValues: { damage: 2 },
  },
  {
    skillId: 'mutation_poison_needle',
    commandSlot: 'mutation',
    name: '毒針',
    description: '毒針腕で刺し、毒を付与する。',
    requiredPartIds: ['insect_poison_needle_arm'],
    priority: 1,
    cooldown: 2,
    effectId: 'poison_bolt',
    effectValues: { damage: 8, poison: 3 },
  },
  {
    skillId: 'mutation_venom_injection',
    commandSlot: 'mutation',
    name: '猛毒注入',
    description: '毒針腕と毒腺を連動させ、濃縮した毒を叩き込む。',
    requiredPartIds: ['insect_poison_needle_arm', 'insect_poison_gland'],
    priority: 2,
    cooldown: 2,
    effectId: 'poison_bolt',
    effectValues: { damage: 10, poison: 7 },
  },
  {
    skillId: 'mutation_toxic_flame_burst',
    commandSlot: 'mutation',
    name: '毒炎爆発',
    description: '敵に蓄積した毒をすべて起爆させる。毒が多いほど大ダメージ。',
    requiredPartIds: ['insect_poison_gland', 'dragon_flame_head'],
    priority: 3,
    cooldown: 3,
    effectId: 'poison_burst',
    effectValues: { damagePerPoison: 4, minDamage: 6 },
  },

  // ===== 防御技（皮膚・外殻系。常にどれか1つは使用可能） =====
  {
    skillId: 'guard_brace',
    commandSlot: 'guard',
    name: '身構える',
    description: '次に受けるダメージを軽減する。',
    priority: 1,
    cooldown: 1,
    effectId: 'guard_reduce',
    effectValues: { reductionPct: 40 },
  },
  {
    skillId: 'guard_shell',
    commandSlot: 'guard',
    name: '甲殻防御',
    description: '硬い外殻で身を守り、大きくダメージを軽減する。',
    requiredCategoryCounts: [{ type: 'skin', count: 1 }],
    priority: 2,
    cooldown: 2,
    effectId: 'guard_reduce',
    effectValues: { reductionPct: 65 },
  },
  {
    skillId: 'guard_reflect_shell',
    commandSlot: 'guard',
    name: '反射甲殻',
    description: '反射装甲で軽減しつつ、軽減前ダメージの一部を敵へ跳ね返す。',
    requiredPartIds: ['golem_reflect_armor'],
    requiredCategoryCounts: [{ type: 'skin', count: 2 }],
    priority: 3,
    cooldown: 2,
    effectId: 'guard_reflect',
    effectValues: { reductionPct: 60, reflectPct: 30 },
  },
];
