// ============================================================
// ゲームデータExcel出力スクリプト（本番ビルドには含まれません）。
//
// 【最重要方針】このスクリプトは「唯一の正」であるゲームデータ
// (src/data/*.ts, src/ui/commandFormat.ts 等)を実行時にimportして読み取るだけで、
// Excel用の値を手入力・二重管理することは禁止。
// 「コード上の生データ→人間が読める説明文」への変換ロジック（下記の
// EFFECT_META・PartEffect→文言マッピング等）は必要だが、数値そのものは
// 必ず実データ(def.effects, cmd.effectValues 等)から読み取ること。
//
// 【今後のルール】部位・コマンド・シナジー・Effectのデータ構造
// (新しい PartEffect kind / CommandEffectId / フィールド追加など)を
// 変更した場合は、このファイルの対応する説明マッピング・列定義も
// 忘れずに更新すること。EFFECT_META に未登録の kind が実データに
// 現れた場合、このスクリプトは実行時にエラーで停止する(下記参照)。
// 新しい列が必要な場合は追加してよい(既存列の削除は既存の運用を壊すため避ける)。
//
// 実行: npm run export-data
// 出力: リポジトリ直下 CHIMERA_BUTCHER_GameData.xlsx (gitignore対象、都度再生成する)
// ============================================================

import ExcelJS from 'exceljs';
import { execSync } from 'node:child_process';
import { ALL_PARTS, DROPPABLE_PARTS, WEAK_ARM } from '../src/data/parts';
import {
  PART_TYPE_LABELS,
  SPECIES_LABELS,
  RARITY_LABELS,
  TAG_LABELS,
  type PartDef,
  type PartEffect,
  type PartType,
  type Species,
  type Rarity,
} from '../src/data/types';
import { PART_TYPE_SYNERGIES, SPECIES_SYNERGIES } from '../src/data/synergies';
import { ALL_COMMANDS, COMMAND_BALANCE, COMMAND_CATEGORY_LABELS, type CommandDef } from '../src/data/commandDefs';
import { describeCommandCondition, commandEffectSummary, EFFECT_VALUE_FIELD_LABELS } from '../src/ui/commandFormat';

const ENVIRONMENT = 'TEST5';
const OUTPUT_FILE = 'CHIMERA_BUTCHER_GameData.xlsx';

function gitInfo(): { branch: string; commit: string } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    return { branch, commit };
  } catch {
    return { branch: '(不明)', commit: '(不明)' };
  }
}

// ------------------------------------------------------------
// PartEffect の種類ごとの静的メタ情報(実装知識に基づく手動マッピング)。
// 数値そのものはここに書かず、必ず実際のPartEffectインスタンスから読む。
// 新しい PartEffect kind を追加したら、ここへ1件追加すること。
// ------------------------------------------------------------
interface EffectMeta {
  label: string; // 人間向け名称
  trigger: string; // いつ発動するか(短い技術語)
  conditionJa: string; // 発動条件の日本語文(部位ごとの数値は含まない共通部分)
  target: 'self' | 'enemy' | 'self/enemy';
  formula: string; // 簡単な計算式・処理概要
  handler: string; // 実装箇所
}

const EFFECT_META: Record<PartEffect['kind'], EffectMeta> = {
  apply_poison: {
    label: '毒付与',
    trigger: '命中時',
    conditionJa: 'この部位の攻撃が敵に命中したとき',
    target: 'enemy',
    formula: '敵の毒スタック += amount + 状態異常付与量ボーナス',
    handler: 'battle.ts: resolveAttack() → applyOnHitEffect()',
  },
  apply_burn: {
    label: '炎上付与',
    trigger: '命中時',
    conditionJa: 'この部位の攻撃が敵に命中したとき',
    target: 'enemy',
    formula: '炎上(dps, duration)を付与。既に炎上中ならdps加算・持続時間はmax値+50%延長',
    handler: 'battle.ts: resolveAttack() → applyOnHitEffect()',
  },
  aura_add_onhit: {
    label: '命中時効果オーラ(他部位へ付与)',
    trigger: '対象部位種類の命中時',
    conditionJa: '同じ本体が装着する targetType 部位の攻撃が命中したとき',
    target: 'enemy',
    formula: 'targetType部位が命中するたび、指定effect(毒/炎上)を追加付与する',
    handler: 'modifiers.ts: computeModifiers()で登録 / battle.ts: resolveAttack()で適用',
  },
  heal_tick: {
    label: '自動回復(パッシブ)',
    trigger: '自身のタイマー周期',
    conditionJa: '自身の interval 秒が経過するたび(パッシブ発動)',
    target: 'self',
    formula: 'HP += amount（isPercent時は maxHp*amount/100） × 回復量倍率',
    handler: 'battle.ts: applyPassiveEffectsOnce()',
  },
  damage_reduction_pct: {
    label: '被ダメージ軽減(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '被ダメージ最終値 ×= (1 − pct/100)',
    handler: 'modifiers.ts: applyStatic()',
  },
  counter_on_hit: {
    label: '被弾時反撃(固定ダメージ)',
    trigger: '被弾時',
    conditionJa: '攻撃を受けるたび',
    target: 'enemy',
    formula: '攻撃してきた相手へ固定damageの反撃ダメージ',
    handler: 'modifiers.ts: applyStatic() / battle.ts: resolveAttack()',
  },
  evasion_bonus: {
    label: '回避率上昇(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '回避率 += pct',
    handler: 'modifiers.ts: applyStatic()',
  },
  attack_speed_all: {
    label: '全部位攻撃速度上昇(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '全部位の実効攻撃間隔 /= (1+pct/100)',
    handler: 'modifiers.ts: applyStatic() → effectiveInterval()',
  },
  attack_speed_type: {
    label: '特定部位種類の攻撃速度上昇(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: 'targetType部位の実効攻撃間隔 /= (1+pct/100)',
    handler: 'modifiers.ts: applyStatic() → effectiveInterval()',
  },
  attack_speed_per_count: {
    label: '装着数に応じた攻撃速度上昇(常時)',
    trigger: '常時',
    conditionJa: 'countType部位の装着数に応じて自動計算',
    target: 'self',
    formula: 'floor(countType装着数 / per) 回分、attackSpeedGlobalPct += pctEach',
    handler: 'modifiers.ts: computeModifiers()',
  },
  capacity_bonus: {
    label: '接続容量ボーナス(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '総接続容量 += amount',
    handler: 'engine/capacity.ts: computeCapacity()',
  },
  capacity_bonus_on_win: {
    label: '勝利時 永続接続容量ボーナス',
    trigger: '戦闘勝利時',
    conditionJa: '戦闘に勝利したとき(装着していれば)',
    target: 'self',
    formula: '永続接続容量 += amount（深層(9戦目以降)では2倍）',
    handler: 'engine/run.ts: finishBattle()',
  },
  cost_modifier: {
    label: '接続コスト増減',
    trigger: '装着コスト計算時',
    conditionJa: '新しい部位を装着しようとするたびに再計算',
    target: 'self',
    formula: 'targetType(またはall_except指定時はexceptType以外)の実効コストにdeltaを加算',
    handler: 'engine/capacity.ts: computeCapacity() / previewCostForNewPart()',
  },
  battle_start_defense: {
    label: '戦闘開始時 防御付与',
    trigger: '戦闘開始時',
    conditionJa: '戦闘が始まったとき(装着していれば)',
    target: 'self',
    formula: '防御初期値 += amount',
    handler: 'modifiers.ts: applyStatic()（battle.ts コンストラクタで適用）',
  },
  status_amount_bonus: {
    label: '状態異常付与量ボーナス(常時)',
    trigger: '常時',
    conditionJa: '毒/炎上を付与するたび自動加算',
    target: 'self',
    formula: '付与する毒/炎上の量 += amount',
    handler: 'modifiers.ts: applyStatic()',
  },
  heal_multiplier: {
    label: '回復量倍率(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '回復量 ×= mult',
    handler: 'modifiers.ts: applyStatic()',
  },
  burn_damage_mult: {
    label: '炎上ダメージ倍率(常時)',
    trigger: '常時',
    conditionJa: '炎上を付与するたび自動適用',
    target: 'enemy',
    formula: '付与する炎上dps ×= mult',
    handler: 'modifiers.ts: applyStatic()',
  },
  damage_vs_burning_mult: {
    label: '炎上中の敵への与ダメージ倍率(常時)',
    trigger: '常時(条件付き)',
    conditionJa: '攻撃対象が炎上しているとき',
    target: 'enemy',
    formula: '攻撃ダメージ ×= mult',
    handler: 'modifiers.ts: applyStatic() / battle.ts: resolveAttack()',
  },
  defense_to_damage: {
    label: '防御力の一部をダメージ加算(常時)',
    trigger: '常時',
    conditionJa: '攻撃するたび自身の防御力を参照',
    target: 'self',
    formula: '攻撃ダメージ += 自身の防御力 × pct',
    handler: 'modifiers.ts: applyStatic() / battle.ts: resolveAttack()',
  },
  poison_no_decay_chance: {
    label: '毒減衰無効化確率(常時)',
    trigger: '毒ダメージ判定時',
    conditionJa: '自身が毒を受けてダメージ処理するたび',
    target: 'self',
    formula: '毒tickごとに chance の確率で毒スタックが減少しない',
    handler: 'modifiers.ts: applyStatic() / battle.ts: tickStatusFor()',
  },
  on_poison_apply_gain_defense: {
    label: '毒付与時 防御上昇',
    trigger: '毒付与時',
    conditionJa: '自身が敵に毒を付与するたび',
    target: 'self',
    formula: '自身の防御 += amount',
    handler: 'modifiers.ts: applyStatic() / battle.ts: applyOnHitEffect()',
  },
  revive_once: {
    label: '戦闘中1回だけ復活',
    trigger: '致死ダメージ時',
    conditionJa: '1戦闘につき1回、致死ダメージを受けたとき',
    target: 'self',
    formula: 'HP = maxHp × hpPct で復活(以後この戦闘では発動しない)',
    handler: 'modifiers.ts: applyStatic() / battle.ts: dealDamage()',
  },
  crit_multiplier_bonus: {
    label: '会心倍率ボーナス(常時)',
    trigger: '常時',
    conditionJa: '装着している間、常に有効',
    target: 'self',
    formula: '会心倍率 += amount',
    handler: 'modifiers.ts: applyStatic()',
  },
  fixed_damage_tick: {
    label: '固定ダメージ(防御・軽減無視、自動タイマー)',
    trigger: '自身のタイマー周期',
    conditionJa: '自身の interval 秒が経過するたび(パッシブ発動)',
    target: 'enemy',
    formula: '防御・被ダメージ軽減を無視した固定 amount(+成長分)ダメージ',
    handler: 'battle.ts: applyPassiveEffectsOnce()',
  },
  fixed_damage_growth_per_proc: {
    label: '固定ダメージ成長(戦闘中)',
    trigger: '固定ダメージ発生ごと',
    conditionJa: '自身または味方の固定ダメージ効果が1回発生するたび',
    target: 'self',
    formula: '以後の固定ダメージ量に amount を加算(この戦闘中のみ持続、次戦でリセット)',
    handler: 'modifiers.ts: applyStatic() / battle.ts: applyPassiveEffectsOnce()',
  },
  duplicate_stack_pct: {
    label: '同名部位重複ボーナス(常時)',
    trigger: '常時',
    conditionJa: '同じ部位を複数装着しているとき',
    target: 'self',
    formula: '同名部位の装着数-1体につき、その部位の攻撃力 ×= (1+pctPerExtra/100)',
    handler: 'modifiers.ts: computePerInstanceAttackMultiplier()',
  },
  empty_capacity_damage_bonus: {
    label: '未使用接続容量 ダメージボーナス',
    trigger: '戦闘開始時に確定',
    conditionJa: '戦闘準備画面時点の空き接続容量に応じて戦闘開始時に確定',
    target: 'self',
    formula: '最終ダメージ倍率 ×= 1 + pctPerUnused/100 × 空き接続容量',
    handler: 'modifiers.ts: applyStatic()（battle.ts コンストラクタで反映）',
  },
  extra_drop_candidates: {
    label: 'ドロップ候補数増加',
    trigger: '戦闘勝利時',
    conditionJa: '戦闘に勝利したとき(装着していれば)',
    target: 'self',
    formula: '次のドロップ候補数 += amount',
    handler: 'engine/run.ts: finishBattle()',
  },
  double_activation_chance_all: {
    label: '全部位2回発動確率(常時)',
    trigger: '各部位の発動時',
    conditionJa: 'いずれかの部位(攻撃・パッシブ問わず)が発動するたび',
    target: 'self',
    formula: '全部位種類について、発動のたび chance の確率でもう一度発動',
    handler: 'modifiers.ts: computeModifiers() / battle.ts: activatePart()',
  },
  heart_count_bonus: {
    label: '心臓装着数に応じたHP/攻撃力上昇(常時)',
    trigger: '常時',
    conditionJa: '心臓・臓器カテゴリの装着数に応じて自動計算',
    target: 'self',
    formula: '最大HP += hpPerHeart×心臓数、各部位攻撃力 ×= 1+attackPctPerHeart/100×心臓数',
    handler: 'modifiers.ts: applyStatic() / computeBonusHp() / computePerInstanceAttackMultiplier()',
  },
};

function formatEffectValues(effect: PartEffect): string {
  const { kind: _kind, ...rest } = effect as PartEffect & Record<string, unknown>;
  return Object.entries(rest)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ');
}

function assertKnownEffectKinds() {
  const known = new Set(Object.keys(EFFECT_META));
  const missing = new Set<string>();
  for (const part of ALL_PARTS) {
    for (const effect of part.effects) {
      if (!known.has(effect.kind)) missing.add(effect.kind);
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `[exportGameData] 未対応のPartEffect kindが見つかりました: ${[...missing].join(', ')}\n` +
        `scripts/exportGameData.ts の EFFECT_META にエントリを追加してから再実行してください。`
    );
  }
}

// ------------------------------------------------------------
// Parts シート
// ------------------------------------------------------------
function partRemark(def: PartDef): string {
  const remarks: string[] = [];
  if (def.id === WEAK_ARM.id) remarks.push('初期装備部位（ドロップ対象外）');
  else if (!DROPPABLE_PARTS.some((p) => p.id === def.id)) remarks.push('ドロップ対象外');
  if (def.id.startsWith('special_')) remarks.push('特殊部位');
  return remarks.join(' / ');
}

function buildPartsRows() {
  const sorted = [...ALL_PARTS].sort((a, b) => {
    const rarityOrder: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2 };
    if (a.species !== b.species) return a.species.localeCompare(b.species);
    if (rarityOrder[a.rarity] !== rarityOrder[b.rarity]) return rarityOrder[a.rarity] - rarityOrder[b.rarity];
    return a.id.localeCompare(b.id);
  });

  return sorted.map((def) => {
    const metas = def.effects.map((e) => EFFECT_META[e.kind]);
    const battleStartDefense = def.effects.find((e) => e.kind === 'battle_start_defense');
    const synergyDescriptions = [
      ...PART_TYPE_SYNERGIES[def.type].map((t) => `[${PART_TYPE_LABELS[def.type]}${t.count}]${t.description}`),
      ...(def.species !== 'none' ? SPECIES_SYNERGIES[def.species as Exclude<Species, 'none'>].map((t) => `[${SPECIES_LABELS[def.species]}${t.count}]${t.description}`) : []),
    ];

    return {
      ID: def.id,
      部位名: def.name,
      レアリティ: RARITY_LABELS[def.rarity],
      種類: PART_TYPE_LABELS[def.type],
      カテゴリ: SPECIES_LABELS[def.species],
      タグ: def.tags.map((t) => TAG_LABELS[t]).join('、'),
      攻撃力: def.attack,
      攻撃間隔秒: def.attack > 0 ? def.interval : def.effects.length > 0 ? def.interval : '',
      HP補正: def.hpBonus,
      防御: battleStartDefense ? (battleStartDefense as { amount: number }).amount : '',
      接続コスト: def.cost,
      通常能力: def.description,
      特殊能力: def.passiveDescription ?? '',
      Trigger: [...new Set(metas.map((m) => m.trigger))].join(' / '),
      Effect: def.effects.map((e) => `${e.kind}（${EFFECT_META[e.kind].label}）`).join(' / '),
      Effect数値: def.effects.map((e) => formatEffectValues(e)).join(' / ') || '（なし）',
      発動条件: [...new Set(metas.map((m) => m.conditionJa))].join(' / ') || '（パッシブ効果なし）',
      対象: [...new Set(metas.map((m) => m.target))].join(' / ') || '',
      シナジー: synergyDescriptions.join(' / '),
      'Custom Handler名': [...new Set(metas.map((m) => m.handler))].join(' / '),
      使用環境: ENVIRONMENT,
      '有効/無効': '有効',
      備考: partRemark(def),
    };
  });
}

// ------------------------------------------------------------
// Commands シート
// ------------------------------------------------------------
function commandKindLabel(cmd: CommandDef): string {
  const hasCondition = !!(cmd.requiredPartIds || cmd.requiredPartCounts || cmd.requiredCategoryCounts || cmd.requiredTags || cmd.requiredAnyOf);
  if (cmd.evolvedFrom) return '進化形（上位技）';
  if (!hasCondition) return '基本（初期解放）';
  return '条件付き解放';
}

function commandTarget(cmd: CommandDef): string {
  if (cmd.effectId === 'full_organ_release') return 'enemy（自傷あり）';
  switch (cmd.category) {
    case 'attack':
    case 'spell':
    case 'debuff':
      return 'enemy';
    case 'buff':
    case 'heal':
      return 'self';
    default:
      return 'self';
  }
}

function pickFields(cmd: CommandDef, keys: string[]): string {
  return keys
    .filter((k) => k in cmd.effectValues)
    .map((k) => `${EFFECT_VALUE_FIELD_LABELS[k] ?? k}: ${cmd.effectValues[k]}`)
    .join(' / ');
}

function buildCommandsRows() {
  const sorted = [...ALL_COMMANDS].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.familyId !== b.familyId) return a.familyId.localeCompare(b.familyId);
    return a.priority - b.priority;
  });

  const powerKeys = ['damage', 'fallbackDamage', 'fixedDamage', 'damagePerPoison', 'powerPct', 'hits', 'finisherDamage', 'bonusDamage'];
  const healKeys = ['healPctOfMax', 'instantPct', 'tickPctPerSec', 'shieldPct', 'lifestealPct'];
  const buffKeys = ['reductionPct', 'reflectPct', 'attackSpeedPct', 'attackSpeedBuffPct', 'critChancePctAdd', 'critMultAdd', 'poisonPerArmHit'];
  const debuffKeys = ['vulnerabilityPct', 'bossDurationMultPct'];
  const durationKeys = ['durationSec', 'burnDuration'];

  return sorted.map((cmd) => {
    const relatedParts = [
      ...(cmd.requiredPartIds ?? []),
      ...((cmd.requiredPartCounts ?? []).map((c) => `${c.partId}×${c.count}`)),
      ...((cmd.requiredAnyOf ?? []).map((p) => `[${[p.type, p.rarity, p.idPrefix].filter(Boolean).join('/')}]`)),
    ];
    const unlockText = describeCommandCondition(cmd);
    const specialUseCondition =
      cmd.effectId === 'poison_burst' || cmd.effectId === 'plague_burst' ? '敵に毒が1以上付与されていること' : 'なし';

    return {
      'Command ID': cmd.commandId,
      コマンド名: cmd.name,
      カテゴリ: COMMAND_CATEGORY_LABELS[cmd.category],
      コマンド種別: commandKindLabel(cmd),
      説明: cmd.description,
      入手方法: unlockText === '常時使用可能（初期解放）' ? '初期から使用可能' : '対応する部位を装着すると解放される',
      使用可能になる条件: unlockText,
      発動条件: `代謝ゲージ${cmd.metabolismCost}以上 かつ クールダウン0（残り秒数が0）`,
      使用条件: specialUseCondition,
      対象: commandTarget(cmd),
      クールダウン秒: cmd.cooldownSeconds,
      初期クールダウン: '0秒（戦闘開始直後から使用可）',
      使用回数制限: 'なし（クールダウン制のみ）',
      コスト: `${cmd.metabolismCost} 代謝ゲージ`,
      威力: pickFields(cmd, powerKeys) || '-',
      回復量: pickFields(cmd, healKeys) || '-',
      バフ内容: cmd.category === 'buff' ? pickFields(cmd, buffKeys) : '-',
      デバフ内容: cmd.category === 'debuff' ? pickFields(cmd, debuffKeys) : '-',
      効果時間: pickFields(cmd, durationKeys) || '-',
      発動確率: '100%（使用すれば確定発動）',
      Trigger: 'プレイヤーがコマンドボタンを押して手動発動',
      Effect: cmd.effectId,
      Effect値: JSON.stringify(cmd.effectValues),
      効果: commandEffectSummary(cmd),
      シナジーによる強化: 'なし（現状シナジー状態とは非連動）',
      関連部位: relatedParts.join('、') || '-',
      関連タグ: (cmd.requiredTags ?? []).map((t) => TAG_LABELS[t]).join('、') || '-',
      'Custom Handler': `battle.ts: executeCommandEffect() 内 '${cmd.effectId}' ケース`,
      使用環境: ENVIRONMENT,
      '有効/無効': '有効',
      備考: cmd.evolvedFrom ? `${cmd.evolvedFrom} から進化（familyId: ${cmd.familyId}）` : `familyId: ${cmd.familyId}`,
    };
  });
}

// ------------------------------------------------------------
// Effects シート（部位Effect kind + コマンドEffect id の一覧・相互参照）
// ------------------------------------------------------------
function buildEffectsRows() {
  const rows: Record<string, string | number>[] = [];

  for (const kind of Object.keys(EFFECT_META) as PartEffect['kind'][]) {
    const meta = EFFECT_META[kind];
    const usedByParts = ALL_PARTS.filter((p) => p.effects.some((e) => e.kind === kind));
    const sampleValueKeys = new Set<string>();
    for (const p of usedByParts) {
      for (const e of p.effects) {
        if (e.kind === kind) {
          Object.keys(e as object)
            .filter((k) => k !== 'kind')
            .forEach((k) => sampleValueKeys.add(k));
        }
      }
    }
    rows.push({
      'Effect ID': kind,
      Effect名: meta.label,
      種類: '部位パッシブ効果',
      Trigger: meta.trigger,
      条件: meta.conditionJa,
      対象: meta.target,
      数値パラメータ: [...sampleValueKeys].join(', ') || '(なし)',
      計算式: meta.formula,
      継続時間: kind === 'apply_burn' ? 'duration(秒)' : '-',
      最大スタック: kind === 'apply_poison' || kind === 'apply_burn' ? '上限なし(累積)' : '-',
      関連部位: usedByParts.map((p) => p.name).join('、') || '(なし)',
      関連コマンド: '-',
      Handler: meta.handler,
      備考: '',
    });
  }

  for (const cmd of ALL_COMMANDS) {
    const existing = rows.find((r) => r['Effect ID'] === cmd.effectId);
    if (existing) {
      existing['関連コマンド'] = `${existing['関連コマンド']}`.replace('-', '') + (existing['関連コマンド'] === '-' ? '' : '、') + cmd.name;
      continue;
    }
    const sameEffectCommands = ALL_COMMANDS.filter((c) => c.effectId === cmd.effectId);
    rows.push({
      'Effect ID': cmd.effectId,
      Effect名: commandEffectSummary(cmd),
      種類: 'コマンド効果',
      Trigger: 'プレイヤーが手動発動',
      条件: describeCommandCondition(cmd),
      対象: commandTarget(cmd),
      数値パラメータ: Object.keys(cmd.effectValues).join(', '),
      計算式: '(各コマンドの効果値を参照。Commandsシートの Effect値 列に実値あり)',
      継続時間: 'durationSec' in cmd.effectValues ? `${cmd.effectValues.durationSec}秒` : '-',
      最大スタック: '-（同名は上書き更新、重複スタックなし）',
      関連部位: '-',
      関連コマンド: sameEffectCommands.map((c) => c.name).join('、'),
      Handler: `battle.ts: executeCommandEffect() 内 '${cmd.effectId}' ケース`,
      備考: '',
    });
  }

  return rows;
}

// ------------------------------------------------------------
// Synergies シート
// ------------------------------------------------------------
function buildSynergiesRows() {
  const rows: Record<string, string | number>[] = [];

  for (const type of Object.keys(PART_TYPE_LABELS) as PartType[]) {
    for (const tier of PART_TYPE_SYNERGIES[type]) {
      rows.push({
        シナジーID: `type-${type}-${tier.count}`,
        名前: `${PART_TYPE_LABELS[type]} ${tier.count}個`,
        対象タグ: PART_TYPE_LABELS[type],
        必要数: tier.count,
        発動条件: `${PART_TYPE_LABELS[type]}カテゴリの部位を${tier.count}個以上装着`,
        効果: tier.description,
        数値: formatEffectValues(tier.effect as unknown as PartEffect),
        強化されるコマンド: 'なし（現状シナジー状態と非連動）',
        強化される部位: '同カテゴリに限らず、装着ビルド全体に適用',
        備考: '',
      });
    }
  }

  for (const species of Object.keys(SPECIES_LABELS).filter((s) => s !== 'none') as Exclude<Species, 'none'>[]) {
    for (const tier of SPECIES_SYNERGIES[species]) {
      rows.push({
        シナジーID: `species-${species}-${tier.count}`,
        名前: `${SPECIES_LABELS[species]} ${tier.count}部位`,
        対象タグ: SPECIES_LABELS[species],
        必要数: tier.count,
        発動条件: `${SPECIES_LABELS[species]}種族の部位を${tier.count}個以上装着`,
        効果: tier.description,
        数値: formatEffectValues(tier.effect as unknown as PartEffect),
        強化されるコマンド: 'なし（現状シナジー状態と非連動）',
        強化される部位: '同種族に限らず、装着ビルド全体に適用',
        備考: '',
      });
    }
  }

  return rows;
}

// ------------------------------------------------------------
// Excel組み立て
// ------------------------------------------------------------
async function addTableSheet<T extends Record<string, unknown>>(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: T[],
  options: { wrapColumns?: string[]; colorColumn?: string; colorMap?: Record<string, string>; widthOverrides?: Record<string, number> } = {}
) {
  const sheet = workbook.addWorksheet(sheetName);
  if (rows.length === 0) return sheet;
  const columns = Object.keys(rows[0]);

  sheet.columns = columns.map((key) => ({
    name: key,
    filterButton: true,
  }));

  const tableRows = rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c] ?? ''));

  sheet.addTable({
    name: sheetName.replace(/[^A-Za-z0-9_]/g, '_'),
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium9', showRowStripes: true },
    columns: columns.map((c) => ({ name: c, filterButton: true })),
    rows: tableRows,
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  columns.forEach((col, i) => {
    const idx = i + 1;
    const override = options.widthOverrides?.[col];
    const isWrap = options.wrapColumns?.includes(col);
    sheet.getColumn(idx).width = override ?? (isWrap ? 40 : Math.min(28, Math.max(10, col.length + 4)));
    if (isWrap) {
      sheet.getColumn(idx).alignment = { wrapText: true, vertical: 'top' };
    } else {
      sheet.getColumn(idx).alignment = { vertical: 'top' };
    }
  });

  if (options.colorColumn && options.colorMap) {
    const colIndex = columns.indexOf(options.colorColumn) + 1;
    if (colIndex > 0) {
      rows.forEach((row, rowIdx) => {
        const value = String((row as Record<string, unknown>)[options.colorColumn!] ?? '');
        const color = options.colorMap![value];
        if (color) {
          const cell = sheet.getCell(rowIdx + 2, colIndex);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        }
      });
    }
  }

  sheet.getRow(1).font = { bold: true };
  return sheet;
}

async function main() {
  assertKnownEffectKinds();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'scripts/exportGameData.ts';
  workbook.created = new Date();

  const { branch, commit } = gitInfo();

  // --- Info シート ---
  const info = workbook.addWorksheet('Info');
  info.columns = [{ width: 26 }, { width: 70 }];
  const infoRows: [string, string][] = [
    ['タイトル', 'CHIMERA BUTCHER ゲームデータ一覧'],
    ['Environment', ENVIRONMENT],
    ['生成日時', new Date().toISOString()],
    ['Gitブランチ', branch],
    ['Gitコミット', commit],
    ['再生成方法', 'npm run export-data （scripts/exportGameData.ts を実行）'],
    ['データ元ファイル', 'src/data/parts.ts, src/data/types.ts, src/data/synergies.ts, src/data/commandDefs.ts, src/ui/commandFormat.ts'],
    ['部位総数', String(ALL_PARTS.length)],
    ['コマンド総数', String(ALL_COMMANDS.length)],
    ['注意', 'このExcelはTEST5ブランチのデータのみを反映しています。本番版・TEST1〜TEST4とは部位/コマンド/数値が異なる場合があります。'],
    ['注意2', '代謝ゲージ関連の基礎値(COMMAND_BALANCE)は下記の通りです:'],
    ...Object.entries(COMMAND_BALANCE).map(([k, v]) => [`  COMMAND_BALANCE.${k}`, String(v)] as [string, string]),
  ];
  infoRows.forEach(([label, value], i) => {
    info.getCell(i + 1, 1).value = label;
    info.getCell(i + 1, 2).value = value;
    info.getCell(i + 1, 1).font = { bold: true };
    info.getCell(i + 1, 2).alignment = { wrapText: true };
  });

  // --- Parts ---
  await addTableSheet(workbook, 'Parts', buildPartsRows(), {
    wrapColumns: ['通常能力', '特殊能力', 'Trigger', 'Effect', 'Effect数値', '発動条件', 'シナジー', 'Custom Handler名'],
    colorColumn: 'レアリティ',
    colorMap: { コモン: 'FFD1D5DB', アンコモン: 'FF7DD3FC', レア: 'FFE9D5FF' },
    widthOverrides: { ID: 24, 部位名: 14, 通常能力: 34, 特殊能力: 30, シナジー: 40, 'Custom Handler名': 30 },
  });

  // --- Commands ---
  await addTableSheet(workbook, 'Commands', buildCommandsRows(), {
    wrapColumns: ['説明', '使用可能になる条件', '発動条件', '威力', '回復量', 'バフ内容', 'デバフ内容', '効果', '関連部位', '備考'],
    colorColumn: 'カテゴリ',
    colorMap: { 攻撃: 'FFFCA5A5', 呪文: 'FF7DD3FC', バフ: 'FFA7F3D0', デバフ: 'FFE9D5FF', 回復: 'FF6EE7B7', 奥義: 'FFFDE68A' },
    widthOverrides: { 'Command ID': 26, コマンド名: 12, 説明: 34, 使用可能になる条件: 28, 発動条件: 26, 効果: 32, 'Effect値': 30 },
  });

  // --- Effects ---
  await addTableSheet(workbook, 'Effects', buildEffectsRows(), {
    wrapColumns: ['計算式', '関連部位', '関連コマンド'],
    colorColumn: '種類',
    colorMap: { 部位パッシブ効果: 'FFBFDBFE', コマンド効果: 'FFFBCFE8' },
    widthOverrides: { 'Effect ID': 28, Effect名: 26, 計算式: 40, 関連部位: 34, 関連コマンド: 26 },
  });

  // --- Synergies ---
  await addTableSheet(workbook, 'Synergies', buildSynergiesRows(), {
    wrapColumns: ['効果', '強化される部位'],
    widthOverrides: { シナジーID: 20, 名前: 18, 効果: 34 },
  });

  await workbook.xlsx.writeFile(OUTPUT_FILE);
  console.log(`✅ ${OUTPUT_FILE} を生成しました`);
  console.log(`   Parts: ${ALL_PARTS.length}件 / Commands: ${ALL_COMMANDS.length}件`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
