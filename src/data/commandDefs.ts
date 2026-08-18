import type { AbilityTag, PartDef, PartType, Rarity } from './types';

// ============================================================
// 「代謝ゲージ」駆動のコマンドシステム（オートバトルを維持したまま、
// プレイヤーが任意タイミングで発動できる技）のマスターデータ。
// 本線のオートバトル(部位データ・シナジー・敵データ)には一切触れない。
//
// 新しいコマンドを追加する場合は ALL_COMMANDS に1件追加するだけでよい。
// 判定処理(meetsCommandCondition)・解決処理(resolveFamilyBestCommand)は
// この配列を読むだけの共通処理で、if文を増やす必要はない。
// 将来Googleスプレッドシート等からコマンド定義を読み込む場合も、
// この配列を差し替えるだけで済むよう、数値・条件・表示文をすべてここへ集約している。
// ============================================================

export type CommandCategory = 'attack' | 'spell' | 'buff' | 'debuff' | 'heal' | 'ultimate';

export const COMMAND_CATEGORY_LABELS: Record<CommandCategory, string> = {
  attack: '攻撃',
  spell: '呪文',
  buff: 'バフ',
  debuff: 'デバフ',
  heal: '回復',
  ultimate: '奥義',
};

// 戦闘画面で分類ごとに色分けするための表示色（要件: 攻撃/呪文/バフ/デバフ/回復で色分け。
// 奥義には専用色を追加している）。
export const COMMAND_CATEGORY_COLORS: Record<CommandCategory, string> = {
  attack: '#f87171',
  spell: '#38bdf8',
  buff: '#4ade80',
  debuff: '#c084fc',
  heal: '#34d399',
  ultimate: '#fbbf24',
};

// --- バランス設定: 数値はすべてここから変更できる ---
export const COMMAND_BALANCE = {
  metabolismMax: 100,
  metabolismStart: 30,
  metabolismRegenPerSecond: 5,
  metabolismRegenPerHit: 1,
  // 命中による回復は多段攻撃の連打で無限回復しないよう、1秒あたりの上限を設ける
  metabolismRegenPerHitCapPerSecond: 5,
  // コマンド使用直後の共通入力ロック(秒)。二重発動防止。
  commandInputLockSeconds: 0.35,
  maxCommandSlots: 4,
  // 追加発動(連撃コンボ等)の安全な連鎖深度上限
  maxChainDepth: 2,
  // 神経麻痺はボス/中ボスに対して効果時間を短縮する（bossDurationMultは%指定）
  bossTierStunDurationMultPct: 50,
} as const;

// ------------------------------------------------------------
// 条件判定（「現在装着している部位」だけを見る。所持・過去入手は含めない）
// ------------------------------------------------------------

export interface CommandAnyOfPredicate {
  rarity?: Rarity;
  type?: PartType;
  idPrefix?: string;
}

export interface CommandCondition {
  requiredPartIds?: string[]; // これらを1個以上装着(すべて必須)
  requiredPartCounts?: { partId: string; count: number }[]; // 特定部位を指定数以上装着
  requiredCategoryCounts?: { type: PartType; count: number }[]; // 部位種類(カテゴリ)を指定数以上装着
  requiredTags?: AbilityTag[]; // いずれかの装着部位がこのタグを持つこと（拡張用フック）
  requiredAnyOf?: CommandAnyOfPredicate[]; // いずれか1つの装着部位が、いずれか1つの条件を満たせばOK
}

export function meetsCommandCondition(cmd: CommandCondition, equipped: PartDef[]): boolean {
  if (cmd.requiredPartIds) {
    for (const id of cmd.requiredPartIds) {
      if (!equipped.some((p) => p.id === id)) return false;
    }
  }
  if (cmd.requiredPartCounts) {
    for (const req of cmd.requiredPartCounts) {
      if (equipped.filter((p) => p.id === req.partId).length < req.count) return false;
    }
  }
  if (cmd.requiredCategoryCounts) {
    for (const req of cmd.requiredCategoryCounts) {
      if (equipped.filter((p) => p.type === req.type).length < req.count) return false;
    }
  }
  if (cmd.requiredTags) {
    for (const tag of cmd.requiredTags) {
      if (!equipped.some((p) => p.tags.includes(tag))) return false;
    }
  }
  if (cmd.requiredAnyOf) {
    const ok = cmd.requiredAnyOf.some((pred) =>
      equipped.some(
        (p) =>
          (pred.rarity ? p.rarity === pred.rarity : true) &&
          (pred.type ? p.type === pred.type : true) &&
          (pred.idPrefix ? p.id.startsWith(pred.idPrefix) : true)
      )
    );
    if (!ok) return false;
  }
  return true;
}

// ------------------------------------------------------------
// 技効果ID（実行処理は engine/battle.ts の executeCommandEffect() に集約。
// eval・文字列コード実行は使用しない。効果IDと実装済みハンドラーの対応のみ）
// ------------------------------------------------------------

export type CommandEffectId =
  | 'strike_best'
  | 'guard_reduce'
  | 'emergency_regen'
  | 'all_arms_volley'
  | 'hundred_arms_barrage'
  | 'bone_spear'
  | 'predation_bite'
  | 'flame_bolt'
  | 'hell_flame_bolt'
  | 'poison_burst'
  | 'plague_burst'
  | 'mana_cannon'
  | 'frenzy_buff'
  | 'eye_focus_buff'
  | 'venom_secretion_buff'
  | 'harden_buff'
  | 'reflect_shell_buff'
  | 'shell_break_debuff'
  | 'paralysis_debuff'
  | 'predator_mark_debuff'
  | 'heartbeat_heal'
  | 'dragon_vein_heal'
  | 'molt_cleanse'
  | 'full_organ_release';

export interface CommandDef extends CommandCondition {
  commandId: string;
  familyId: string; // 同じ family 内では priority が最大の技が採用される(進化)
  category: CommandCategory;
  name: string;
  description: string;
  priority: number;
  metabolismCost: number;
  cooldownSeconds: number;
  effectId: CommandEffectId;
  effectValues: Record<string, number>;
  evolvedFrom: string | null; // 進化元のcommandId(表示用)
  icon: string;
  color: string;
}

// ------------------------------------------------------------
// コマンドデータ本体（24種、18ファミリー）
// ------------------------------------------------------------

export const ALL_COMMANDS: CommandDef[] = [
  // ===== 基本(初期解放) =====
  {
    commandId: 'cmd_strike',
    familyId: 'strike',
    category: 'attack',
    name: '強打',
    description: '最も攻撃力が高い攻撃部位を即時発動する。該当部位がなければ基礎攻撃力で殴る。',
    priority: 1,
    metabolismCost: 20,
    cooldownSeconds: 3,
    effectId: 'strike_best',
    effectValues: { fallbackDamage: 5 },
    evolvedFrom: null,
    icon: '👊',
    color: COMMAND_CATEGORY_COLORS.attack,
  },
  {
    commandId: 'cmd_guard',
    familyId: 'guard',
    category: 'buff',
    name: '身構える',
    description: '4秒間、受けるダメージを40%軽減する。',
    priority: 1,
    metabolismCost: 20,
    cooldownSeconds: 8,
    effectId: 'guard_reduce',
    effectValues: { durationSec: 4, reductionPct: 40 },
    evolvedFrom: null,
    icon: '🛡️',
    color: COMMAND_CATEGORY_COLORS.buff,
  },
  {
    commandId: 'cmd_recover',
    familyId: 'recover',
    category: 'heal',
    name: '応急再生',
    description: '最大HPの15%を即時回復する(最大HPは超えない)。',
    priority: 1,
    metabolismCost: 25,
    cooldownSeconds: 12,
    effectId: 'emergency_regen',
    effectValues: { healPctOfMax: 15 },
    evolvedFrom: null,
    icon: '💚',
    color: COMMAND_CATEGORY_COLORS.heal,
  },

  // ===== 攻撃 =====
  {
    commandId: 'cmd_all_arms_volley',
    familyId: 'allarms',
    category: 'attack',
    name: '全腕斉射',
    description: '装着中の全攻撃部位を1回ずつ即時発動する(各威力70%)。命中時効果も発動する。',
    requiredCategoryCounts: [{ type: 'arm', count: 3 }],
    priority: 1,
    metabolismCost: 45,
    cooldownSeconds: 10,
    effectId: 'all_arms_volley',
    effectValues: { powerPct: 70, hits: 1 },
    evolvedFrom: null,
    icon: '🏹',
    color: COMMAND_CATEGORY_COLORS.attack,
  },
  {
    commandId: 'cmd_hundred_arms_barrage',
    familyId: 'allarms',
    category: 'attack',
    name: '百腕乱舞',
    description: '装着中の全攻撃部位を2回ずつ発動する(各威力65%)。',
    requiredCategoryCounts: [{ type: 'arm', count: 6 }],
    requiredPartIds: ['special_multi_arm_core'],
    priority: 2,
    metabolismCost: 70,
    cooldownSeconds: 14,
    effectId: 'hundred_arms_barrage',
    effectValues: { powerPct: 65, hits: 2 },
    evolvedFrom: 'cmd_all_arms_volley',
    icon: '🌪️',
    color: COMMAND_CATEGORY_COLORS.attack,
  },
  {
    commandId: 'cmd_bone_spear',
    familyId: 'bonespear',
    category: 'attack',
    name: '骨槍',
    description: '防御とダメージ軽減を無視する固定ダメージを与える。',
    requiredPartIds: ['special_thousand_bones'],
    priority: 1,
    metabolismCost: 30,
    cooldownSeconds: 6,
    effectId: 'bone_spear',
    effectValues: { fixedDamage: 18 },
    evolvedFrom: null,
    icon: '🦴',
    color: COMMAND_CATEGORY_COLORS.attack,
  },
  {
    commandId: 'cmd_predation_bite',
    familyId: 'predationbite',
    category: 'attack',
    name: '捕食咬み',
    description: '敵へ直接ダメージを与え、与えたダメージの50%を回復する。',
    requiredPartIds: ['special_total_predation'],
    priority: 1,
    metabolismCost: 35,
    cooldownSeconds: 9,
    effectId: 'predation_bite',
    effectValues: { damage: 22, lifestealPct: 50 },
    evolvedFrom: null,
    icon: '🩸',
    color: COMMAND_CATEGORY_COLORS.attack,
  },

  // ===== 呪文・変異攻撃 =====
  {
    commandId: 'cmd_flame_bolt',
    familyId: 'flamebolt',
    category: 'spell',
    name: '火炎弾',
    description: '直接ダメージ＋炎上を与える。',
    requiredPartIds: ['dragon_flame_head'],
    priority: 1,
    metabolismCost: 30,
    cooldownSeconds: 7,
    effectId: 'flame_bolt',
    effectValues: { damage: 16, burnDps: 4, burnDuration: 4, bonusIfBurningPct: 0 },
    evolvedFrom: null,
    icon: '🔥',
    color: COMMAND_CATEGORY_COLORS.spell,
  },
  {
    commandId: 'cmd_hell_flame_bolt',
    familyId: 'flamebolt',
    category: 'spell',
    name: '獄炎弾',
    description: '火炎弾より高い直接ダメージ＋強い炎上。敵がすでに炎上中なら追加ダメージ。',
    requiredPartIds: ['dragon_flame_head', 'dragon_heat_gland'],
    priority: 2,
    metabolismCost: 45,
    cooldownSeconds: 9,
    effectId: 'hell_flame_bolt',
    effectValues: { damage: 26, burnDps: 7, burnDuration: 5, bonusIfBurningPct: 40 },
    evolvedFrom: 'cmd_flame_bolt',
    icon: '🌋',
    color: COMMAND_CATEGORY_COLORS.spell,
  },
  {
    commandId: 'cmd_poison_burst',
    familyId: 'poisonburst',
    category: 'spell',
    name: '毒爆発',
    description: '敵の毒を最大10まで消費し、消費量に応じた即時ダメージ。敵に毒がなければ使用不可。',
    requiredPartIds: ['insect_poison_gland'],
    priority: 1,
    metabolismCost: 35,
    cooldownSeconds: 8,
    effectId: 'poison_burst',
    effectValues: { maxConsume: 10, damagePerPoison: 4 },
    evolvedFrom: null,
    icon: '☠️',
    color: COMMAND_CATEGORY_COLORS.spell,
  },
  {
    commandId: 'cmd_plague_burst',
    familyId: 'poisonburst',
    category: 'spell',
    name: '疫病爆発',
    description: '毒の半分だけを消費し、毒爆発より高いダメージ。爆発後も毒ビルドを継続できる。',
    requiredPartIds: ['insect_poison_gland', 'special_plague_core'],
    priority: 2,
    metabolismCost: 50,
    cooldownSeconds: 10,
    effectId: 'plague_burst',
    effectValues: { consumeFraction: 0.5, damagePerPoison: 6 },
    evolvedFrom: 'cmd_poison_burst',
    icon: '🧪',
    color: COMMAND_CATEGORY_COLORS.spell,
  },
  {
    commandId: 'cmd_mana_cannon',
    familyId: 'manacannon',
    category: 'spell',
    name: '魔力砲',
    description: '高威力の魔法ダメージ。敵の防御を一部無視する。',
    requiredPartIds: ['golem_crystal_eye', 'golem_mana_furnace'],
    priority: 1,
    metabolismCost: 55,
    cooldownSeconds: 12,
    effectId: 'mana_cannon',
    effectValues: { damage: 38, defenseIgnorePct: 50 },
    evolvedFrom: null,
    icon: '🔮',
    color: COMMAND_CATEGORY_COLORS.spell,
  },

  // ===== バフ =====
  {
    commandId: 'cmd_frenzy',
    familyId: 'frenzy',
    category: 'buff',
    name: '狂化',
    description: '6秒間、全部位の攻撃速度が40%上昇する。再使用しても重複せず残り時間を更新する。',
    requiredCategoryCounts: [{ type: 'arm', count: 3 }],
    priority: 1,
    metabolismCost: 40,
    cooldownSeconds: 12,
    effectId: 'frenzy_buff',
    effectValues: { durationSec: 6, attackSpeedPct: 40 },
    evolvedFrom: null,
    icon: '💢',
    color: COMMAND_CATEGORY_COLORS.buff,
  },
  {
    commandId: 'cmd_eye_focus',
    familyId: 'eyefocus',
    category: 'buff',
    name: '複眼集中',
    description: '6秒間、会心率と会心ダメージが上昇する。',
    requiredPartIds: ['insect_compound_eye'],
    priority: 1,
    metabolismCost: 25,
    cooldownSeconds: 10,
    effectId: 'eye_focus_buff',
    effectValues: { durationSec: 6, critChancePctAdd: 25, critMultAdd: 0.5 },
    evolvedFrom: null,
    icon: '👁️',
    color: COMMAND_CATEGORY_COLORS.buff,
  },
  {
    commandId: 'cmd_venom_secretion',
    familyId: 'venomsecretion',
    category: 'buff',
    name: '毒液分泌',
    description: '6秒間、腕・触手の攻撃命中時に毒+1を追加付与する(既存の毒付与効果と共存)。',
    requiredPartIds: ['insect_poison_gland'],
    priority: 1,
    metabolismCost: 35,
    cooldownSeconds: 12,
    effectId: 'venom_secretion_buff',
    effectValues: { durationSec: 6, poisonPerArmHit: 1 },
    evolvedFrom: null,
    icon: '🧬',
    color: COMMAND_CATEGORY_COLORS.buff,
  },
  {
    commandId: 'cmd_harden',
    familyId: 'harden',
    category: 'buff',
    name: '硬質化',
    description: '6秒間、受けるダメージを40%軽減する。',
    requiredCategoryCounts: [{ type: 'skin', count: 1 }],
    priority: 1,
    metabolismCost: 30,
    cooldownSeconds: 10,
    effectId: 'harden_buff',
    effectValues: { durationSec: 6, reductionPct: 40 },
    evolvedFrom: null,
    icon: '🪨',
    color: COMMAND_CATEGORY_COLORS.buff,
  },
  {
    commandId: 'cmd_reflect_shell',
    familyId: 'harden',
    category: 'buff',
    name: '反射甲殻',
    description: '6秒間、受けるダメージを35%軽減し、軽減前ダメージの一部を敵へ反射する。',
    requiredPartIds: ['golem_reflect_armor'],
    requiredCategoryCounts: [{ type: 'skin', count: 2 }],
    priority: 2,
    metabolismCost: 45,
    cooldownSeconds: 12,
    effectId: 'reflect_shell_buff',
    effectValues: { durationSec: 6, reductionPct: 35, reflectPct: 25 },
    evolvedFrom: 'cmd_harden',
    icon: '🔰',
    color: COMMAND_CATEGORY_COLORS.buff,
  },

  // ===== デバフ =====
  {
    commandId: 'cmd_shell_break',
    familyId: 'shellbreak',
    category: 'debuff',
    name: '甲殻破砕',
    description: '8秒間、敵が受けるダメージを25%増加させる。',
    requiredPartIds: ['golem_giant_fist'],
    priority: 1,
    metabolismCost: 30,
    cooldownSeconds: 10,
    effectId: 'shell_break_debuff',
    effectValues: { durationSec: 8, vulnerabilityPct: 25 },
    evolvedFrom: null,
    icon: '💥',
    color: COMMAND_CATEGORY_COLORS.debuff,
  },
  {
    commandId: 'cmd_paralysis',
    familyId: 'paralysis',
    category: 'debuff',
    name: '神経麻痺',
    description: '敵の自動攻撃を2秒間停止する(発生済みのダメージは巻き戻さない)。ボスへは効果時間を短縮。',
    requiredPartIds: ['insect_web_mouth'],
    priority: 1,
    metabolismCost: 45,
    cooldownSeconds: 15,
    effectId: 'paralysis_debuff',
    effectValues: { durationSec: 2, bossDurationMultPct: COMMAND_BALANCE.bossTierStunDurationMultPct },
    evolvedFrom: null,
    icon: '🕸️',
    color: COMMAND_CATEGORY_COLORS.debuff,
  },
  {
    commandId: 'cmd_predator_mark',
    familyId: 'predatormark',
    category: 'debuff',
    name: '捕食標識',
    description: '6秒間、敵が受ける直接ダメージを15%増加させる(状態異常ダメージには適用しない)。',
    requiredPartIds: ['insect_compound_eye'],
    priority: 1,
    metabolismCost: 25,
    cooldownSeconds: 10,
    effectId: 'predator_mark_debuff',
    effectValues: { durationSec: 6, vulnerabilityPct: 15 },
    evolvedFrom: null,
    icon: '🎯',
    color: COMMAND_CATEGORY_COLORS.debuff,
  },

  // ===== 回復 =====
  {
    commandId: 'cmd_heartbeat',
    familyId: 'heartbeat',
    category: 'heal',
    name: '多重鼓動',
    description: '最大HPの8%を即時回復し、その後4秒間毎秒最大HPの3%を回復する。',
    requiredCategoryCounts: [{ type: 'heart', count: 2 }],
    priority: 1,
    metabolismCost: 35,
    cooldownSeconds: 13,
    effectId: 'heartbeat_heal',
    effectValues: { instantPct: 8, tickPctPerSec: 3, durationSec: 4 },
    evolvedFrom: null,
    icon: '💓',
    color: COMMAND_CATEGORY_COLORS.heal,
  },
  {
    commandId: 'cmd_dragon_vein',
    familyId: 'heartbeat',
    category: 'heal',
    name: '竜脈再生',
    description: '最大HPの15%を即時回復し、5秒間継続回復。回復中は攻撃速度も一時上昇する。',
    requiredPartIds: ['dragon_heart', 'special_colossal_heart'],
    priority: 2,
    metabolismCost: 50,
    cooldownSeconds: 16,
    effectId: 'dragon_vein_heal',
    effectValues: { instantPct: 15, tickPctPerSec: 3, durationSec: 5, attackSpeedBuffPct: 20 },
    evolvedFrom: 'cmd_heartbeat',
    icon: '🐲',
    color: COMMAND_CATEGORY_COLORS.heal,
  },
  {
    commandId: 'cmd_molt',
    familyId: 'molt',
    category: 'heal',
    name: '脱皮',
    description: '毒と炎上を解除し、最大HPの15%分の一時障壁を付与する。',
    requiredPartIds: ['insect_carapace'],
    priority: 1,
    metabolismCost: 40,
    cooldownSeconds: 15,
    effectId: 'molt_cleanse',
    effectValues: { shieldPct: 15 },
    evolvedFrom: null,
    icon: '🐍',
    color: COMMAND_CATEGORY_COLORS.heal,
  },

  // ===== 奥義 =====
  {
    commandId: 'cmd_full_organ_release',
    familyId: 'ultimate',
    category: 'ultimate',
    name: '全器官解放',
    description: '装着中の全攻撃部位と周期器官の効果を1回ずつ発動する。発動後、最大HPの10%を自傷する(HP1は残る)。',
    requiredAnyOf: [
      { type: 'heart', rarity: 'rare' },
      { idPrefix: 'special_' },
    ],
    priority: 1,
    metabolismCost: 100,
    cooldownSeconds: 30,
    effectId: 'full_organ_release',
    effectValues: { selfDamagePctOfMax: 10 },
    evolvedFrom: null,
    icon: '💢',
    color: COMMAND_CATEGORY_COLORS.ultimate,
  },
];

export const DEFAULT_COMMAND_LOADOUT: (string | null)[] = ['strike', 'guard', 'recover', null];

export function getAllFamilyIds(): string[] {
  return Array.from(new Set(ALL_COMMANDS.map((c) => c.familyId)));
}

export function getCommandsInFamily(familyId: string): CommandDef[] {
  return ALL_COMMANDS.filter((c) => c.familyId === familyId).sort((a, b) => a.priority - b.priority);
}

export function getCommandDef(commandId: string): CommandDef | undefined {
  return ALL_COMMANDS.find((c) => c.commandId === commandId);
}

// 同じ familyId で条件を満たす技のうち、priority が最も高いものを採用する。
export function resolveFamilyBestCommand(familyId: string, equipped: PartDef[]): CommandDef | null {
  let best: CommandDef | null = null;
  for (const cmd of ALL_COMMANDS) {
    if (cmd.familyId !== familyId) continue;
    if (!meetsCommandCondition(cmd, equipped)) continue;
    if (!best || cmd.priority > best.priority) best = cmd;
  }
  return best;
}

export interface ResolvedFamily {
  familyId: string;
  command: CommandDef | null; // 現在解決されている技(条件を満たすものが1つもなければnull)
  allTiers: CommandDef[]; // familyId内の全段階(表示用)
}

export function resolveAllFamilies(equipped: PartDef[]): ResolvedFamily[] {
  return getAllFamilyIds().map((familyId) => ({
    familyId,
    command: resolveFamilyBestCommand(familyId, equipped),
    allTiers: getCommandsInFamily(familyId),
  }));
}
