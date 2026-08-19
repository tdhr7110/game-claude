// TEST12: データ駆動バランス調整のためのベースライン計測スクリプト（本番ビルドには含まれない）。
// scripts/simulate.ts（ドロップ選択AIのみ）を拡張し、コマンド発動も行う擬似プレイヤーで
// 多数ラン（オートバトル+コマンド介入）を実行し、TEST14の分析対象を集計する。
//
// 集計対象（ユーザー要件に対応）:
//   - 戦闘番号別勝率・離脱率
//   - 敵別勝率と戦闘時間
//   - 部位の被提示回数・被選択回数（選ばれすぎ/選ばれない部位）
//   - 部位の最終ビルド装着率に対する勝率（装着率に対して勝率が高すぎる部位）
//   - コマンドの装備率・使用回数・使用時勝率（使われないコマンド）
//   - シナジー発動率・発動時勝率（強すぎる/成立しないシナジー）
//   - 1ラン自動戦闘時間の合計（5〜10分に収まっているかの目安）
//
// 実行: npx tsx scripts/balanceMeasure.ts [N]
import { BattleEngine, type PlayerBattleSetup } from '../src/engine/battle';
import {
  BASE_DEFENSE,
  CORE_HP_BASE,
  acceptDrop,
  createInitialRunState,
  enterBattle,
  equipPart,
  equippedDefs,
  finishBattle,
  advanceToNextBattle,
  getCapacityInfo,
  getMaxHp,
  tierOfCurrentBattle,
  unequipPart,
  setCommandSlot,
  TOTAL_BATTLES,
  type RunState,
} from '../src/engine/run';
import { getPartDef, ALL_PARTS } from '../src/data/parts';
import { previewCostForNewPart } from '../src/engine/capacity';
import type { PartDef, PartType, Species } from '../src/data/types';
import { resolveAllFamilies, type CommandCategory, type CommandDef } from '../src/data/commandDefs';
import { PART_TYPE_SYNERGIES, SPECIES_SYNERGIES } from '../src/data/synergies';

// ============================================================
// 部位スコアリング（scripts/simulate.tsのAIを踏襲。装備選択の疑似プレイヤーAI）
// ============================================================
function scorePart(def: PartDef, hpRatio: number): number {
  let score = 0;
  const dps = def.attack > 0 ? def.attack / def.interval : 0;
  score += dps * 1.2;
  score += def.hpBonus * 0.3;
  if (def.type === 'head') score += 3;
  for (const e of def.effects) {
    if (e.kind === 'heal_tick') score += (e.amount / Math.max(0.5, def.interval || 1)) * (hpRatio < 0.6 ? 3 : 1);
    if (e.kind === 'damage_reduction_pct') score += e.pct * (hpRatio < 0.6 ? 1.5 : 0.8);
    if (e.kind === 'counter_on_hit') score += e.damage * 0.5;
    if (e.kind === 'capacity_bonus') score += e.amount * 1.5;
    if (e.kind === 'battle_start_defense') score += e.amount * 0.5;
    if (e.kind === 'revive_once') score += 5;
    if (e.kind === 'crit_multiplier_bonus') score += e.amount * 4;
    if (e.kind === 'fixed_damage_tick') score += (e.amount / Math.max(0.5, def.interval || 1)) * 1.2;
    if (e.kind === 'fixed_damage_growth_per_proc') score += e.amount * 3;
    if (e.kind === 'duplicate_stack_pct') score += e.pctPerExtra * 0.6;
    if (e.kind === 'empty_capacity_damage_bonus') score += e.pctPerUnused * 0.8;
    if (e.kind === 'extra_drop_candidates') score += e.amount * 4;
    if (e.kind === 'double_activation_chance_all') score += e.chance * 30;
    if (e.kind === 'heart_count_bonus') score += e.hpPerHeart * 0.3 + e.attackPctPerHeart * 0.6;
    if (e.kind === 'attack_speed_all') score += e.pct * 0.6;
    if (e.kind === 'capacity_bonus_on_win') score += e.amount * 1.0;
    if (e.kind === 'poison_no_decay_chance') score += e.chance * 3;
    if (e.kind === 'cost_modifier') {
      if (e.targetType === 'all_except') score -= e.delta * 1;
      else score += -e.delta * 2;
    }
    if (e.kind === 'attack_speed_per_count') score += e.pctEach * 0.5;
    // aura_add_onhit(毒腺・灼熱腺など): 他の腕・触手全体を強化するオーラ。
    // 単体では攻撃力0のため無評価だと常に選ばれなくなる(計測AIの盲点)。
    // ビルド中の対象タイプ部位数に比例した簡易見積もりを加点する。
    if (e.kind === 'aura_add_onhit') {
      const inner = e.effect;
      const perHitValue = inner.kind === 'apply_poison' ? inner.amount * 2 : inner.dps * inner.duration * 0.5;
      score += perHitValue * 2.5; // 装着腕数に応じて実際の価値は伸びるため、控えめな固定値で見積もる
    }
  }
  if (def.rarity === 'uncommon') score *= 1.1;
  if (def.rarity === 'rare') score *= 1.25;
  return score;
}

function makeRoom(state: RunState, neededCost: number): RunState {
  let s = state;
  let capacity = getCapacityInfo(s);
  const removableIds = ['weak_arm'];
  while (capacity.free < neededCost) {
    const eq = s.equipped.find((i) => removableIds.includes(i.defId));
    if (!eq) break;
    s = unequipPart(s, eq.instanceId);
    capacity = getCapacityInfo(s);
  }
  return s;
}

// --- 計測フック: ドロップ提示・選択の記録 ---
interface PartStat {
  offered: number;
  picked: number;
  equippedAtRunEndWins: number;
  equippedAtRunEndGames: number;
}
const partStats: Record<string, PartStat> = {};
function ps(id: string): PartStat {
  return (partStats[id] ??= { offered: 0, picked: 0, equippedAtRunEndWins: 0, equippedAtRunEndGames: 0 });
}

function autoPickDrop(state: RunState): RunState {
  if (state.dropCandidates.length === 0) return state;
  for (const d of state.dropCandidates) ps(d.id).offered += 1;
  const hpRatio = state.coreHp / getMaxHp(state);
  const scored = state.dropCandidates.map((d) => ({ def: d, score: scorePart(d, hpRatio) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].def;
  ps(best.id).picked += 1;
  const cost = previewCostForNewPart(best, equippedDefs(state));
  let s = state;
  const capacity = getCapacityInfo(s);
  if (cost > capacity.free) s = makeRoom(s, cost);
  const res = acceptDrop(s, best.id, true);
  return res.state;
}

function fillFromInventory(state: RunState): RunState {
  let s = state;
  const hpRatio = s.coreHp / getMaxHp(s);
  let changed = true;
  let guard = 0;
  while (changed && guard < 30) {
    changed = false;
    guard += 1;
    const capacity = getCapacityInfo(s);
    const eqDefs = equippedDefs(s);
    const candidates = s.inventory
      .map((item) => ({ item, def: getPartDef(item.defId) }))
      .map((c) => ({ ...c, cost: previewCostForNewPart(c.def, eqDefs), score: scorePart(c.def, hpRatio) }))
      .filter((c) => c.cost <= capacity.free)
      .sort((a, b) => b.score - a.score);
    if (candidates.length > 0) {
      const pick = candidates[0];
      const res = equipPart(s, pick.item.instanceId);
      if (res.ok) {
        s = res.state;
        changed = true;
      }
    }
  }
  return s;
}

// ============================================================
// コマンドロードアウトAI: 装着部位から解放済みコマンドをカテゴリバランス良く選ぶ
// (攻撃/回復/防御を最低1つずつ確保し、残り1枠は最良スコアで埋める。人間の常識的な
//  構成選びを模倣する簡易ヒューリスティック。厳密な最適化ではない)
// ============================================================
function estimateCommandValue(cmd: CommandDef): number {
  const v = cmd.effectValues as Record<string, number>;
  const cost = Math.max(1, cmd.metabolismCost);
  switch (cmd.effectId) {
    case 'strike_best':
      return 30 / cost;
    case 'all_arms_volley':
    case 'hundred_arms_barrage':
      return ((v.hits ?? 1) * (v.powerPct ?? 0)) / cost;
    case 'bone_spear':
      return (v.fixedDamage ?? 0) / cost;
    case 'predation_bite':
      return ((v.damage ?? 0) * (1 + (v.lifestealPct ?? 0) / 200)) / cost;
    case 'flame_bolt':
    case 'hell_flame_bolt':
      return ((v.damage ?? 0) + (v.burnDps ?? 0) * (v.burnDuration ?? 0)) / cost;
    case 'poison_burst':
    case 'plague_burst':
      return ((v.damagePerPoison ?? 0) * 6) / cost;
    case 'mana_cannon':
      return (v.damage ?? 0) / cost;
    case 'emergency_regen':
      return (v.healPctOfMax ?? 0) * 3;
    case 'heartbeat_heal':
    case 'dragon_vein_heal':
      return ((v.instantPct ?? 0) + (v.tickPctPerSec ?? 0) * (v.durationSec ?? 0)) * 3;
    case 'molt_cleanse':
      return (v.shieldPct ?? 0) * 2;
    case 'guard_reduce':
    case 'harden_buff':
    case 'reflect_shell_buff':
      return (v.reductionPct ?? 0) * (v.durationSec ?? 0) * 0.5;
    case 'frenzy_buff':
      return (v.attackSpeedPct ?? 0) * (v.durationSec ?? 0) * 0.3;
    case 'eye_focus_buff':
      return ((v.critChancePctAdd ?? 0) + (v.critMultAdd ?? 0) * 40) * (v.durationSec ?? 0) * 0.2;
    case 'venom_secretion_buff':
      return (v.poisonPerArmHit ?? 0) * (v.durationSec ?? 0) * 3;
    case 'shell_break_debuff':
    case 'predator_mark_debuff':
      return (v.vulnerabilityPct ?? 0) * (v.durationSec ?? 0) * 0.5;
    case 'paralysis_debuff':
      return (v.durationSec ?? 0) * 15;
    case 'full_organ_release':
      return 80;
    default:
      return 10;
  }
}

const DEFENSIVE_FAMILIES = new Set(['guard', 'harden']);

function chooseLoadout(equipped: PartDef[]): (string | null)[] {
  const resolved = resolveAllFamilies(equipped)
    .filter((f) => f.command)
    .map((f) => ({ familyId: f.familyId, cmd: f.command!, score: estimateCommandValue(f.command!) }));
  const byCat = (cats: CommandCategory[]) =>
    resolved.filter((r) => cats.includes(r.cmd.category)).sort((a, b) => b.score - a.score);

  const picks: string[] = [];
  const offense = byCat(['attack', 'spell']);
  const heal = byCat(['heal']);
  const support = byCat(['buff', 'debuff']);
  if (offense[0]) picks.push(offense[0].familyId);
  if (heal[0] && !picks.includes(heal[0].familyId)) picks.push(heal[0].familyId);
  if (support[0] && !picks.includes(support[0].familyId)) picks.push(support[0].familyId);
  // 4枠目: 「strikeが常に最強スコアを取り続け、他の攻撃/呪文コマンドが一切選ばれない」偏りを避けるため、
  // まだ選ばれていない攻撃/呪文系コマンドの最良枠を優先する(ビルド固有の必殺技を反映)。
  // 該当が無ければスコア最良の残り全体で埋める。
  const remainingOffense = offense.filter((r) => !picks.includes(r.familyId));
  if (remainingOffense[0] && picks.length < 4) picks.push(remainingOffense[0].familyId);
  const remaining = resolved.filter((r) => !picks.includes(r.familyId)).sort((a, b) => b.score - a.score);
  for (const r of remaining) {
    if (picks.length >= 4) break;
    picks.push(r.familyId);
  }
  while (picks.length < 4) picks.push(null as unknown as string);
  return picks.slice(0, 4).map((p) => p || null);
}

function applyLoadout(state: RunState): RunState {
  const desired = chooseLoadout(equippedDefs(state));
  let s = state;
  for (let i = 0; i < 4; i++) {
    if (s.commandLoadout[i] !== desired[i]) {
      s = setCommandSlot(s, i, desired[i]).state;
    }
  }
  return s;
}

// --- コマンド計測 ---
interface CommandStat {
  equippedBattles: number;
  usedCount: number;
}
const commandStats: Record<string, CommandStat> = {};
function cs(familyId: string): CommandStat {
  return (commandStats[familyId] ??= { equippedBattles: 0, usedCount: 0 });
}

interface CommandSlotForPolicy {
  familyId: string;
  category: CommandCategory;
  usable: boolean;
  score: number;
}

function pickCommandIndex(slots: CommandSlotForPolicy[], hpRatio: number, isTough: boolean): number {
  // 「最初に見つかった使用可能枠」を選ぶと、常時解放されているstrike(強打)が全ての
  // 攻撃判定を独占し、装備されている強力な必殺技(骨槍・毒爆発等)が実戦で一切発動しなくなる。
  // 同一カテゴリ内では見積もりスコアが最も高い使用可能枠を選ぶ(=強打より強い技があれば
  // そちらを優先する、というビルドを活かすプレイヤーの意思決定を模倣する)。
  const best = (pred: (s: CommandSlotForPolicy) => boolean): number => {
    let bestIdx = -1;
    let bestScore = -Infinity;
    slots.forEach((s, i) => {
      if (s && s.usable && pred(s) && s.score > bestScore) {
        bestScore = s.score;
        bestIdx = i;
      }
    });
    return bestIdx;
  };
  const find = best;
  if (hpRatio < 0.45) {
    const i = find((s) => s.category === 'heal');
    if (i >= 0) return i;
  }
  if (hpRatio < 0.6) {
    const i = find((s) => DEFENSIVE_FAMILIES.has(s.familyId));
    if (i >= 0) return i;
  }
  if (isTough) {
    const i = find((s) => s.category === 'debuff');
    if (i >= 0) return i;
  }
  {
    const i = find((s) => s.category === 'ultimate');
    if (i >= 0) return i;
  }
  {
    const i = find((s) => s.category === 'attack' || s.category === 'spell');
    if (i >= 0) return i;
  }
  {
    const i = find((s) => s.category === 'buff' && !DEFENSIVE_FAMILIES.has(s.familyId));
    if (i >= 0) return i;
  }
  {
    const i = find((s) => s.category === 'heal');
    if (i >= 0) return i;
  }
  return -1;
}

// ============================================================
// シナジー計測
// ============================================================
interface SynergyStat {
  activeBattles: number;
  activeWins: number;
}
const partTypeSynergyStats: Record<string, SynergyStat> = {};
const speciesSynergyStats: Record<string, SynergyStat> = {};
function ptStat(type: PartType, count: number): SynergyStat {
  const key = `${type}:${count}`;
  return (partTypeSynergyStats[key] ??= { activeBattles: 0, activeWins: 0 });
}
function spStat(species: string, count: number): SynergyStat {
  const key = `${species}:${count}`;
  return (speciesSynergyStats[key] ??= { activeBattles: 0, activeWins: 0 });
}

// ============================================================
// 戦闘番号別・敵別計測
// ============================================================
interface BattleIndexStat {
  attempts: number;
  wins: number;
  durations: number[];
}
const battleIndexStats: Record<number, BattleIndexStat> = {};
function bis(idx: number): BattleIndexStat {
  return (battleIndexStats[idx] ??= { attempts: 0, wins: 0, durations: [] });
}

interface EnemyStat {
  attempts: number;
  wins: number;
  durations: number[];
}
const enemyStats: Record<string, EnemyStat> = {};
function es(id: string): EnemyStat {
  return (enemyStats[id] ??= { attempts: 0, wins: 0, durations: [] });
}

// ============================================================
// 1ランのシミュレーション
// ============================================================
function simulateOneRun() {
  let state: RunState = createInitialRunState();
  state = applyLoadout(state);
  let totalSimSeconds = 0;
  let lossBattleIndex: number | null = null;

  while (state.phase !== 'result') {
    state = fillFromInventory(state);
    state = applyLoadout(state);
    state = enterBattle(state);
    const enemy = state.currentEnemy!;
    const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
    const freeCapacity = getCapacityInfo(state).free;
    const setup: PlayerBattleSetup = { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE, freeCapacity };
    const engine = new BattleEngine(setup, enemy, state.battleIndex, { commandFamilyIds: state.commandLoadout });

    const tier = tierOfCurrentBattle(state);
    const isTough = tier === 'elite' || tier === 'miniboss' || tier === 'boss';
    for (const familyId of state.commandLoadout) {
      if (familyId) cs(familyId).equippedBattles += 1;
    }
    // 戦闘中は装着部位が変わらないため、家族(family)ごとの見積もりスコアは戦闘開始時に1回だけ計算する。
    const familyScores = new Map(
      resolveAllFamilies(equipped.map((e) => e.def))
        .filter((f) => f.command)
        .map((f) => [f.familyId, estimateCommandValue(f.command!)])
    );

    let simTime = 0;
    const dt = 0.1;
    let guard = 0;
    let commandCheckTimer = 0;
    while (engine.getStatus() === 'ongoing' && guard < 20000) {
      engine.tick(dt);
      simTime += dt;
      guard += 1;
      commandCheckTimer += dt;
      if (commandCheckTimer >= 0.5) {
        commandCheckTimer = 0;
        const snap = engine.getSnapshot();
        const hpRatio = snap.player.hp / snap.player.maxHp;
        const slots = snap.commandSlots
          .map((s) => (s ? { familyId: s.familyId, category: s.category, usable: s.usable, score: familyScores.get(s.familyId) ?? 0 } : null))
          .filter((s): s is CommandSlotForPolicy => !!s);
        const idx = pickCommandIndex(slots, hpRatio, isTough);
        if (idx >= 0) {
          const familyId = snap.commandSlots[idx]?.familyId;
          const result = engine.useCommand(idx);
          if (result.ok && familyId) cs(familyId).usedCount += 1;
        }
      }
    }
    totalSimSeconds += simTime;
    const result = engine.getStatus() as 'won' | 'lost';

    bis(state.battleIndex).attempts += 1;
    bis(state.battleIndex).durations.push(simTime);
    if (result === 'won') bis(state.battleIndex).wins += 1;
    else lossBattleIndex = state.battleIndex;

    es(enemy.id).attempts += 1;
    es(enemy.id).durations.push(simTime);
    if (result === 'won') es(enemy.id).wins += 1;

    // シナジー発動記録(この戦闘開始時点の構成で発動していたシナジー)
    const synergies = engine.getSnapshot().synergies;
    for (const [type, group] of Object.entries(synergies.partType)) {
      for (const tierDef of group.activeTiers) {
        const st = ptStat(type as PartType, tierDef.count);
        st.activeBattles += 1;
        if (result === 'won') st.activeWins += 1;
      }
    }
    for (const [species, group] of Object.entries(synergies.species)) {
      for (const tierDef of group.activeTiers) {
        const st = spStat(species, tierDef.count);
        st.activeBattles += 1;
        if (result === 'won') st.activeWins += 1;
      }
    }

    state = finishBattle(state, result, engine.getFinalPlayerHp());
    if (result === 'lost' || state.phase === 'result') break;

    state = autoPickDrop(state);
    state = advanceToNextBattle(state);
  }

  const outcome = state.resultOutcome;
  const finalDefs = new Set(equippedDefs(state).map((d) => d.id));
  for (const id of finalDefs) {
    const stat = ps(id);
    stat.equippedAtRunEndGames += 1;
    if (outcome === 'victory') stat.equippedAtRunEndWins += 1;
  }

  return {
    outcome,
    reachedBattle: state.battleIndex,
    lossBattleIndex,
    totalSimSeconds,
  };
}

// ============================================================
// 実行
// ============================================================
const N = Number(process.argv[2] ?? 300);
let wins = 0;
let losses = 0;
const durations: number[] = [];
const reached: number[] = [];

for (let i = 0; i < N; i++) {
  const r = simulateOneRun();
  if (r.outcome === 'victory') wins++;
  else losses++;
  durations.push(r.totalSimSeconds);
  reached.push(r.reachedBattle);
}

console.log(`\n=== TEST12 baseline measurement over ${N} runs (heuristic bot: drop-pick + command AI) ===`);
console.log('wins:', wins, 'losses:', losses, `(${((wins / N) * 100).toFixed(1)}% win rate)`);
console.log('avg reached battle:', (reached.reduce((a, b) => a + b, 0) / N).toFixed(2), '/', TOTAL_BATTLES);
durations.sort((a, b) => a - b);
const avgSec = durations.reduce((a, b) => a + b, 0) / N;
console.log('avg total sim seconds per run:', avgSec.toFixed(1), `(${(avgSec / 60).toFixed(1)} min pure auto-battle time)`);
console.log('min/median/max total sim seconds:', durations[0].toFixed(1), durations[Math.floor(N / 2)].toFixed(1), durations[N - 1].toFixed(1));

console.log('\n--- 戦闘番号別 勝率・離脱率・戦闘時間 ---');
console.log('idx\tattempts\twinRate\tavgDur\tdropoutRate(=1-attempts[i+1]/attempts[i])');
const indices = Object.keys(battleIndexStats).map(Number).sort((a, b) => a - b);
for (const idx of indices) {
  const st = battleIndexStats[idx];
  const avgDur = st.durations.reduce((a, b) => a + b, 0) / st.durations.length;
  const nextAttempts = battleIndexStats[idx + 1]?.attempts ?? 0;
  const dropout = st.attempts > 0 ? 1 - nextAttempts / st.attempts : 0;
  console.log(`${idx}\t${st.attempts}\t${((st.wins / st.attempts) * 100).toFixed(1)}%\t${avgDur.toFixed(1)}s\t${(dropout * 100).toFixed(1)}%`);
}

console.log('\n--- 敵別 勝率・戦闘時間 ---');
console.log('enemyId\tattempts\twinRate\tavgDur');
for (const [id, st] of Object.entries(enemyStats).sort((a, b) => b[1].attempts - a[1].attempts)) {
  const avgDur = st.durations.reduce((a, b) => a + b, 0) / st.durations.length;
  console.log(`${id}\t${st.attempts}\t${((st.wins / st.attempts) * 100).toFixed(1)}%\t${avgDur.toFixed(1)}s`);
}

console.log('\n--- 部位: 被提示回数・被選択率・最終ビルド装着時勝率(全体比) ---');
const overallWinRate = wins / N;
console.log(`(全体勝率: ${(overallWinRate * 100).toFixed(1)}%)`);
console.log('partId\tofferedCount\tpickRateWhenOffered\tequippedAtEndGames\twinRateWhenEquipped\tdeltaVsOverall');
for (const p of ALL_PARTS) {
  const stat = partStats[p.id];
  if (!stat) {
    console.log(`${p.id}\t0\t-\t0\t-\t-`);
    continue;
  }
  const pickRate = stat.offered > 0 ? (stat.picked / stat.offered) * 100 : 0;
  const winRateEq = stat.equippedAtRunEndGames > 0 ? (stat.equippedAtRunEndWins / stat.equippedAtRunEndGames) * 100 : 0;
  const delta = stat.equippedAtRunEndGames > 0 ? winRateEq - overallWinRate * 100 : 0;
  console.log(
    `${p.id}\t${stat.offered}\t${pickRate.toFixed(1)}%\t${stat.equippedAtRunEndGames}\t${winRateEq.toFixed(1)}%\t${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pt`
  );
}

console.log('\n--- コマンド(family): 装備戦闘数・使用回数・使用密度 ---');
console.log('familyId\tequippedBattles\tusedCount\tusedPerEquippedBattle');
for (const [familyId, st] of Object.entries(commandStats).sort((a, b) => b[1].equippedBattles - a[1].equippedBattles)) {
  const density = st.equippedBattles > 0 ? st.usedCount / st.equippedBattles : 0;
  console.log(`${familyId}\t${st.equippedBattles}\t${st.usedCount}\t${density.toFixed(2)}`);
}

console.log('\n--- 部位数シナジー: 発動戦闘数・発動時勝率 ---');
console.log('type:count\tactiveBattles\twinRateWhenActive\tdeltaVsOverall');
for (const [key, st] of Object.entries(partTypeSynergyStats).sort((a, b) => b[1].activeBattles - a[1].activeBattles)) {
  const wr = (st.activeWins / st.activeBattles) * 100;
  console.log(`${key}\t${st.activeBattles}\t${wr.toFixed(1)}%\t${(wr - overallWinRate * 100 >= 0 ? '+' : '') + (wr - overallWinRate * 100).toFixed(1)}pt`);
}

console.log('\n--- 種族シナジー: 発動戦闘数・発動時勝率 ---');
console.log('species:count\tactiveBattles\twinRateWhenActive\tdeltaVsOverall');
for (const [key, st] of Object.entries(speciesSynergyStats).sort((a, b) => b[1].activeBattles - a[1].activeBattles)) {
  const wr = (st.activeWins / st.activeBattles) * 100;
  console.log(`${key}\t${st.activeBattles}\t${wr.toFixed(1)}%\t${(wr - overallWinRate * 100 >= 0 ? '+' : '') + (wr - overallWinRate * 100).toFixed(1)}pt`);
}

console.log('\n=== 初期コアについて ===');
console.log('現在のゲームには「初期コア選択」の仕組みが存在しない(常に弱い腕x2固定)。この軸の分析は対象外(構造的に差が出ない)。');
