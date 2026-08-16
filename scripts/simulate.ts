// バランス検証用シミュレーションスクリプト（本番ビルドには含まれない）
// 実行: npx tsx scripts/simulate.ts
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
  type RunState,
} from '../src/engine/run';
import { getPartDef } from '../src/data/parts';
import { previewCostForNewPart } from '../src/engine/capacity';
import type { PartDef } from '../src/data/types';

function scorePart(def: PartDef, hpRatio: number): number {
  let score = 0;
  const dps = def.attack > 0 ? def.attack / def.interval : 0;
  score += dps * 1.2;
  score += def.hpBonus * 0.3;
  for (const e of def.effects) {
    if (e.kind === 'heal_tick') score += (e.amount / Math.max(0.5, def.interval || 1)) * (hpRatio < 0.6 ? 3 : 1);
    if (e.kind === 'damage_reduction_pct') score += e.pct * (hpRatio < 0.6 ? 1.5 : 0.8);
    if (e.kind === 'counter_on_hit') score += e.damage * 0.5;
    if (e.kind === 'capacity_bonus') score += e.amount * 1.5;
    if (e.kind === 'battle_start_defense') score += e.amount * 0.5;
    if (e.kind === 'revive_once') score += 5;
  }
  if (def.rarity === 'uncommon') score *= 1.1;
  if (def.rarity === 'rare') score *= 1.25;
  return score;
}

// 装着スペースが足りなければ、装着中の最弱パーツ（弱い腕など）を外して空ける
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

function autoPickDrop(state: RunState): RunState {
  if (state.dropCandidates.length === 0) return state;
  const hpRatio = state.coreHp / getMaxHp(state);
  const eqDefs = equippedDefs(state);
  const scored = state.dropCandidates.map((d) => ({ def: d, score: scorePart(d, hpRatio) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].def;
  const cost = previewCostForNewPart(best, eqDefs);
  let s = state;
  const capacity = getCapacityInfo(s);
  if (cost > capacity.free) {
    s = makeRoom(s, cost);
  }
  const res = acceptDrop(s, best.id, true);
  s = res.state;
  if (!res.equipped) {
    // 装着できなかった場合はとりあえずインベントリに保管済み（acceptDropの実装上）
  }
  return s;
}

// 手持ちインベントリの中から、装着可能な最良パーツを装着し続ける（空き容量がある限り）
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

function simulateOneRun(runId: number, verbose: boolean) {
  let state: RunState = createInitialRunState();
  const battleLogs: string[] = [];
  let totalSimSeconds = 0;

  while (state.phase !== 'result') {
    state = fillFromInventory(state);
    state = enterBattle(state);
    const enemy = state.currentEnemy!;
    const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
    const setup: PlayerBattleSetup = { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE };
    const engine = new BattleEngine(setup, enemy, state.battleIndex, { verbose: false });
    let simTime = 0;
    const dt = 0.1;
    let guard = 0;
    while (engine.getStatus() === 'ongoing' && guard < 20000) {
      engine.tick(dt);
      simTime += dt;
      guard += 1;
    }
    totalSimSeconds += simTime;
    const result = engine.getStatus() as 'won' | 'lost';
    const tier = tierOfCurrentBattle(state);
    battleLogs.push(
      `run${runId} battle${state.battleIndex}[${tier}] vs ${enemy.name}(hp${enemy.hp}): ${result} in ${simTime.toFixed(1)}s, playerHp ${engine.getFinalPlayerHp()}/${equippedDefs(state).reduce((s, d) => s + d.hpBonus, 0) + CORE_HP_BASE} equipped=${state.equipped.length}`
    );

    state = finishBattle(state, result, engine.getFinalPlayerHp());
    if (result === 'lost' || state.phase === 'result') break;

    state = autoPickDrop(state);
    state = advanceToNextBattle(state);
  }

  if (verbose) battleLogs.forEach((l) => console.log(l));
  return {
    outcome: state.resultOutcome,
    reachedBattle: state.battleIndex,
    totalSimSeconds,
    logs: battleLogs,
  };
}

const N = 40;
let wins = 0;
let losses = 0;
const durations: number[] = [];
const reached: number[] = [];
const perBattleDurations: Record<number, number[]> = {};

for (let i = 0; i < N; i++) {
  const r = simulateOneRun(i, i < 5);
  if (r.outcome === 'victory') wins++;
  else losses++;
  durations.push(r.totalSimSeconds);
  reached.push(r.reachedBattle);
  r.logs.forEach((log) => {
    const m = log.match(/battle(\d+)\[(\w+)\].*in ([\d.]+)s/);
    if (m) {
      const idx = Number(m[1]);
      perBattleDurations[idx] = perBattleDurations[idx] ?? [];
      perBattleDurations[idx].push(Number(m[3]));
    }
  });
}

console.log('\n=== SUMMARY over', N, 'runs (smart bot) ===');
console.log('wins:', wins, 'losses:', losses, `(${((wins / N) * 100).toFixed(0)}% win rate)`);
console.log('avg reached battle:', (reached.reduce((a, b) => a + b, 0) / N).toFixed(1));
console.log('avg total sim seconds per run:', (durations.reduce((a, b) => a + b, 0) / N).toFixed(1));
console.log('min/max total sim seconds:', Math.min(...durations).toFixed(1), Math.max(...durations).toFixed(1));

for (const idx of Object.keys(perBattleDurations).map(Number).sort((a, b) => a - b)) {
  const arr = perBattleDurations[idx];
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(`battle ${idx}: n=${arr.length} avg=${avg.toFixed(1)}s min=${Math.min(...arr).toFixed(1)} max=${Math.max(...arr).toFixed(1)}`);
}
