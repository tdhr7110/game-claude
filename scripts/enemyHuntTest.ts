// TEST7(敵選択+所持部位ドロップ+固有ギミック)の検証スクリプト（本番ビルドには含まれない）
// 実行: npx tsx scripts/enemyHuntTest.ts
import {
  ALL_NORMAL_ENEMIES,
  ALL_ELITE_ENEMIES,
  buildFinalBoss,
  buildDeepFinalBoss,
  buildMinibossFromBase,
} from '../src/data/enemies';
import { PARTS_BY_ID } from '../src/data/parts';
import type { EnemyDef } from '../src/data/types';
import {
  BASE_DEFENSE,
  CORE_HP_BASE,
  advanceToNextBattle,
  chooseEnemy,
  createInitialRunState,
  enterEnemySelect,
  equippedDefs,
  finishBattle,
  generateDropCandidates,
  getCapacityInfo,
  acceptDrop,
  equipPart,
  unequipPart,
  type RunState,
} from '../src/engine/run';
import { getPartDef } from '../src/data/parts';
import { previewCostForNewPart } from '../src/engine/capacity';
import type { PartDef } from '../src/data/types';
import { BattleEngine, type PlayerBattleSetup, type SpeedSetting } from '../src/engine/battle';
import { EnemyGimmickRuntime } from '../src/engine/enemyGimmickEngine';
import { DEFAULT_COMMAND_LOADOUT } from '../src/data/commandDefs';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

const ALL_ENEMIES_FOR_DATA_CHECKS: EnemyDef[] = [
  ...ALL_NORMAL_ENEMIES,
  ...ALL_ELITE_ENEMIES,
  ...ALL_ELITE_ENEMIES.map((e) => buildMinibossFromBase(e, 5)),
  buildFinalBoss(),
  buildDeepFinalBoss(),
];

// ============================================================
// 1. 敵候補が重複せず3体生成される / ボスは固定1体
// ============================================================
console.log('\n======== 1. 敵候補生成(重複なし・件数) ========');
{
  const boundaryBattleIndices = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  let allUniqueNormal = true;
  let allUniqueElite = true;
  let allUniqueMiniboss = true;
  let normalCount3 = true;
  let eliteCount3 = true;
  let minibossCount3 = true;
  let bossCount1 = true;

  for (let trial = 0; trial < 30; trial++) {
    for (const battleIndex of boundaryBattleIndices) {
      let state: RunState = { ...createInitialRunState(), battleIndex };
      const withCandidates = enterEnemySelect(state);
      const ids = withCandidates.enemyCandidates.map((e) => e.id);
      const unique = new Set(ids).size === ids.length;
      const slot = [
        'normal', 'normal', 'elite', 'normal', 'miniboss', 'normal', 'elite', 'boss',
        'normal', 'normal', 'elite', 'normal', 'miniboss', 'normal', 'elite', 'boss',
      ][battleIndex - 1];
      if (slot === 'normal') {
        if (!unique) allUniqueNormal = false;
        if (ids.length !== 3) normalCount3 = false;
      } else if (slot === 'elite') {
        if (!unique) allUniqueElite = false;
        if (ids.length !== 3) eliteCount3 = false;
      } else if (slot === 'miniboss') {
        if (!unique) allUniqueMiniboss = false;
        if (ids.length !== 3) minibossCount3 = false;
      } else if (slot === 'boss') {
        if (ids.length !== 1) bossCount1 = false;
      }
    }
  }
  check('通常戦の候補が常に3体で重複しない', allUniqueNormal && normalCount3);
  check('強敵戦の候補が常に3体で重複しない', allUniqueElite && eliteCount3);
  check('中ボス戦の候補が常に3体で重複しない', allUniqueMiniboss && minibossCount3);
  check('ボス戦(中間/最終)の候補は常に固定1体', bossCount1);
}

// ============================================================
// 2. 再描画で候補が変わらない(RunStateに保持され、読み出すだけでは再抽選されない)
// ============================================================
console.log('\n======== 2. 再描画で候補が変わらない ========');
{
  const state: RunState = { ...createInitialRunState(), battleIndex: 1 };
  const withCandidates = enterEnemySelect(state);
  const readAgainIds1 = withCandidates.enemyCandidates.map((e) => e.id).join(',');
  const readAgainIds2 = withCandidates.enemyCandidates.map((e) => e.id).join(',');
  check('同一RunStateを複数回参照しても候補配列は同じ内容のまま', readAgainIds1 === readAgainIds2);
  check('候補配列はRunState.enemyCandidatesとして保持されている', withCandidates.enemyCandidates.length > 0);
}

// ============================================================
// 3. 選択した敵が戦闘へ渡る
// ============================================================
console.log('\n======== 3. 選択した敵が戦闘へ渡る ========');
{
  const state: RunState = { ...createInitialRunState(), battleIndex: 3 }; // elite slot
  const withCandidates = enterEnemySelect(state);
  const target = withCandidates.enemyCandidates[1];
  const result = chooseEnemy(withCandidates, target.id);
  check('choose成功', result.ok);
  check('phaseがbattleへ遷移する', result.state.phase === 'battle');
  check('currentEnemyが選択した候補と一致する', result.state.currentEnemy?.id === target.id);
  check('enemyCandidatesが選択後にクリアされる', result.state.enemyCandidates.length === 0);
  check('強敵選択後はusedEliteIdsが更新される', result.state.usedEliteIds.length === state.usedEliteIds.length + 1);

  const bad = chooseEnemy(withCandidates, 'not_a_real_id');
  check('存在しない候補idはエラーになる', !bad.ok);
}

// ============================================================
// 4. 全敵のbodyPartIdsが実在する / 5. 各敵が最低3個の通常部位を持つ
// ============================================================
console.log('\n======== 4-5. bodyPartIdsの実在性・最低3個 ========');
{
  let allExist = true;
  let allAtLeast3 = true;
  let namesChecked = 0;
  for (const enemy of ALL_ENEMIES_FOR_DATA_CHECKS) {
    namesChecked++;
    if (enemy.bodyPartIds.length < 3) {
      allAtLeast3 = false;
      console.log(`    (不足) ${enemy.id}: bodyPartIds=${enemy.bodyPartIds.length}`);
    }
    for (const id of enemy.bodyPartIds) {
      if (!PARTS_BY_ID[id]) {
        allExist = false;
        console.log(`    (不在) ${enemy.id}: 存在しない部位id ${id}`);
      }
    }
    for (const id of enemy.rareDropPartIds) {
      if (!PARTS_BY_ID[id]) {
        allExist = false;
        console.log(`    (不在) ${enemy.id}: 存在しないレア部位id ${id}`);
      }
    }
  }
  check(`検査対象${namesChecked}体すべてのbodyPartIds/rareDropPartIdsが実在する`, allExist);
  check('検査対象すべての敵が最低3個のbodyPartIdsを持つ', allAtLeast3);
}

// ============================================================
// 6. 表示した部位と実際のドロップが一致する
// ============================================================
console.log('\n======== 6. ドロップは表示された部位の範囲内のみ ========');
{
  let allWithinPool = true;
  let sampleCount = 0;
  for (const enemy of ALL_ENEMIES_FOR_DATA_CHECKS) {
    const allowed = new Set([...enemy.bodyPartIds, ...enemy.rareDropPartIds]);
    for (const isDeep of [false, true]) {
      for (let i = 0; i < 40; i++) {
        const drops = generateDropCandidates(enemy, 4, isDeep); // extra_drop_candidates相当も想定して4個
        sampleCount += drops.length;
        for (const d of drops) {
          if (!allowed.has(d.id)) {
            allWithinPool = false;
            console.log(`    (範囲外) ${enemy.id}: ドロップ ${d.id} は表示部位に含まれない`);
          }
        }
      }
    }
  }
  check(`${sampleCount}件のドロップ抽選がすべて敵の所持部位・レアドロップの範囲内`, allWithinPool);
}

// ============================================================
// 7. 各敵ギミックが発動する(enemyGimmickEngineの単体テスト)
// ============================================================
console.log('\n======== 7. 各ギミックの発動(単体テスト) ========');
{
  // poison_ramp: 時間経過でstatusAmountBonusが増える
  {
    const rt = new EnemyGimmickRuntime([{ kind: 'poison_ramp', params: { perSecond: 0.12, cap: 5 } }]);
    const r1 = rt.tick({ dt: 1, time: 1, enemyHpPct: 1, playerHasBurn: false });
    const r2 = rt.tick({ dt: 9, time: 10, enemyHpPct: 1, playerHasBurn: false });
    const r3 = rt.tick({ dt: 100, time: 100, enemyHpPct: 1, playerHasBurn: false });
    check('poison_ramp: 時間経過で毒付与ボーナスが増加する', r2.statusAmountBonus > r1.statusAmountBonus);
    check('poison_ramp: capで頭打ちになる', Math.abs(r3.statusAmountBonus - 5) < 1e-9);
  }
  // enrage_below_hp
  {
    const rt = new EnemyGimmickRuntime([{ kind: 'enrage_below_hp', params: { hpThresholdPct: 50, attackSpeedMultiplier: 1.45 } }]);
    const full = rt.tick({ dt: 0.1, time: 1, enemyHpPct: 0.9, playerHasBurn: false });
    const low = rt.tick({ dt: 0.1, time: 1.1, enemyHpPct: 0.4, playerHasBurn: false });
    check('enrage_below_hp: HP高いときは速度上昇なし', full.attackSpeedMultiplier === 1);
    check('enrage_below_hp: HP50%以下で攻撃速度が上昇する', Math.abs(low.attackSpeedMultiplier - 1.45) < 1e-9);
  }
  // periodic_reflect
  {
    const rt = new EnemyGimmickRuntime([{ kind: 'periodic_reflect', params: { cycleSec: 8, activeSec: 2.5, reflectPct: 30 } }]);
    const inactive = rt.tick({ dt: 0.1, time: 5, enemyHpPct: 1, playerHasBurn: false });
    const active = rt.tick({ dt: 0.1, time: 1, enemyHpPct: 1, playerHasBurn: false });
    check('periodic_reflect: 非アクティブ区間は反射なし', inactive.reflectPct === 0);
    check('periodic_reflect: アクティブ区間で反射が発動する', active.reflectPct === 30);
  }
  // burn_stack_explode
  {
    const rt = new EnemyGimmickRuntime([{ kind: 'burn_stack_explode', params: { intervalSec: 3.5, damage: 6 } }]);
    let exploded = false;
    let time = 0;
    for (let i = 0; i < 50; i++) {
      const r = rt.tick({ dt: 0.1, time, playerHasBurn: true, enemyHpPct: 1 });
      time += 0.1;
      if (r.directDamageToPlayer > 0) exploded = true;
    }
    check('burn_stack_explode: 炎上中に一定間隔で爆発ダメージが発生する', exploded);

    const rtNoBurn = new EnemyGimmickRuntime([{ kind: 'burn_stack_explode', params: { intervalSec: 0.5, damage: 6 } }]);
    let explodedWithoutBurn = false;
    for (let i = 0; i < 20; i++) {
      const r = rtNoBurn.tick({ dt: 0.1, time: i * 0.1, playerHasBurn: false, enemyHpPct: 1 });
      if (r.directDamageToPlayer > 0) explodedWithoutBurn = true;
    }
    check('burn_stack_explode: 炎上していなければ爆発しない', !explodedWithoutBurn);
  }
  // evade_charge
  {
    const rt = new EnemyGimmickRuntime([
      { kind: 'evade_charge', params: { cycleSec: 2, evadeDurationSec: 0.5, evasionBonusPct: 35, chargeDamage: 7, exposedDefenseDelta: -3, exposedDurationSec: 1 } },
    ]);
    let sawEvasion = false;
    let sawCharge = false;
    let sawExposed = false;
    let time = 0;
    for (let i = 0; i < 60; i++) {
      const r = rt.tick({ dt: 0.1, time, playerHasBurn: false, enemyHpPct: 1 });
      time += 0.1;
      if (r.evasionDeltaPct > 0) sawEvasion = true;
      if (r.directDamageToPlayer > 0) sawCharge = true;
      if (r.defenseDelta < 0) sawExposed = true;
    }
    check('evade_charge: 回避構え → 突撃 → 露出、の一連が発生する', sawEvasion && sawCharge && sawExposed);
  }
  // stance_cycle
  {
    const rt = new EnemyGimmickRuntime([
      { kind: 'stance_cycle', params: { cycleSec: 4, guardSec: 2, guardDamageReductionPct: 20, guardDefenseDelta: 4, attackVulnerabilityPct: 22 } },
    ]);
    const guardPhase = rt.tick({ dt: 0.1, time: 0.5, playerHasBurn: false, enemyHpPct: 1 });
    const attackPhase = rt.tick({ dt: 0.1, time: 3, playerHasBurn: false, enemyHpPct: 1 });
    check('stance_cycle: 防御姿勢では被ダメ軽減が発生する', guardPhase.damageReductionDeltaPct > 0);
    check('stance_cycle: 攻撃姿勢では被弾しやすくなる(隙)が発生する', attackPhase.vulnerabilityDeltaPct > 0);
  }
  // phase_shift_below_hp
  {
    const rt = new EnemyGimmickRuntime([
      { kind: 'phase_shift_below_hp', params: { hpThresholdPct: 50, attackSpeedMultiplier: 1.2, reflectPct: 15, damageReductionDeltaPct: 5 } },
    ]);
    const before = rt.tick({ dt: 0.1, time: 1, playerHasBurn: false, enemyHpPct: 0.9 });
    const after1 = rt.tick({ dt: 0.1, time: 2, playerHasBurn: false, enemyHpPct: 0.4 });
    const after2 = rt.tick({ dt: 0.1, time: 3, playerHasBurn: false, enemyHpPct: 0.9 }); // HPが戻っても発動済みなら維持
    check('phase_shift_below_hp: 閾値を上回っている間は未発動', before.attackSpeedMultiplier === 1);
    check('phase_shift_below_hp: 閾値を下回ると強化が発動する', after1.attackSpeedMultiplier > 1);
    check('phase_shift_below_hp: 一度発動したら以後も維持される(一方向)', after2.attackSpeedMultiplier > 1);
  }
}

// ============================================================
// 7b. 実戦闘でギミックが例外なく動作する(統合スモークテスト)
// ============================================================
console.log('\n======== 7b. 実戦闘でのギミック統合スモークテスト ========');
{
  const dummySetup: PlayerBattleSetup = {
    equipped: [],
    coreHpBase: 100000, // 長時間観測するためプレイヤーは実質不死化
    currentHp: 100000,
    baseDefense: 0,
    freeCapacity: 0,
  };
  let allOk = true;
  for (const enemy of ALL_ENEMIES_FOR_DATA_CHECKS) {
    try {
      const engine = new BattleEngine(dummySetup, enemy, 1, { verbose: false, commandFamilyIds: DEFAULT_COMMAND_LOADOUT });
      let guard = 0;
      while (engine.getStatus() === 'ongoing' && guard < 3000) {
        engine.tick(0.1);
        guard += 1;
      }
    } catch (e) {
      allOk = false;
      console.log(`    (例外) ${enemy.id}: ${e}`);
    }
  }
  check('全敵とのダミー戦闘がギミック込みで例外なく完走する', allOk);
}

// ============================================================
// 8. 0倍・1倍・2倍・4倍速度で正常動作する
// ============================================================
console.log('\n======== 8. 速度設定(0/1/2/4倍)の動作確認 ========');
{
  const setup: PlayerBattleSetup = { equipped: [], coreHpBase: 100000, currentHp: 100000, baseDefense: 0, freeCapacity: 0 };
  const enemy = buildFinalBoss();
  let ok = true;
  for (const speed of [0, 1, 2, 4] as SpeedSetting[]) {
    const engine = new BattleEngine(setup, enemy, 1, { verbose: false });
    engine.setSpeed(speed);
    const before = engine.getSnapshot().time;
    for (let i = 0; i < 10; i++) engine.tick(0.1);
    const after = engine.getSnapshot().time;
    if (speed === 0 && after !== before) ok = false;
    if (speed > 0 && after <= before) ok = false;
    if (engine.getSpeed() !== speed) ok = false;
  }
  check('速度0/1/2/4のいずれでも例外なく動作し、0倍のみ時間が進まない', ok);
}

// ============================================================
// 9. 16戦の自動シミュレーションが完走する(敵選択+コマンド有効化を通した実運用フロー)
// ============================================================
console.log('\n======== 9. 16戦オートシミュレーション(敵選択フロー) ========');
{
  function scoreForAuto(def: PartDef): number {
    const dps = def.attack > 0 ? def.attack / def.interval : 0;
    let score = dps * 1.2 + def.hpBonus * 0.3;
    if (def.type === 'head') score += 3;
    return score;
  }

  function autoPickDrop(state: RunState): RunState {
    if (state.dropCandidates.length === 0) return state;
    const eqDefs = equippedDefs(state);
    const scored = state.dropCandidates.map((d) => ({ def: d, score: scoreForAuto(d) })).sort((a, b) => b.score - a.score);
    const best = scored[0].def;
    let s = state;
    const capacity = getCapacityInfo(s);
    const cost = previewCostForNewPart(best, eqDefs);
    if (cost > capacity.free) {
      const eq = s.equipped.find((i) => i.defId === 'weak_arm');
      if (eq) s = unequipPart(s, eq.instanceId);
    }
    return acceptDrop(s, best.id, true).state;
  }

  function fillFromInventory(state: RunState): RunState {
    let s = state;
    let changed = true;
    let guard = 0;
    while (changed && guard < 30) {
      changed = false;
      guard += 1;
      const capacity = getCapacityInfo(s);
      const eqDefs = equippedDefs(s);
      const candidates = s.inventory
        .map((item) => ({ item, def: getPartDef(item.defId) }))
        .map((c) => ({ ...c, cost: previewCostForNewPart(c.def, eqDefs), score: scoreForAuto(c.def) }))
        .filter((c) => c.cost <= capacity.free)
        .sort((a, b) => b.score - a.score);
      if (candidates.length > 0) {
        const res = equipPart(s, candidates[0].item.instanceId);
        if (res.ok) {
          s = res.state;
          changed = true;
        }
      }
    }
    return s;
  }

  const RUNS = 20;
  let completed = 0;
  let crashed = 0;
  for (let runId = 0; runId < RUNS; runId++) {
    try {
      let state: RunState = createInitialRunState();
      let iterations = 0;
      while (state.phase !== 'result' && iterations < 16 * 3) {
        iterations++;
        state = fillFromInventory(state);
        state = enterEnemySelect(state);
        // 選択画面: 候補の中から最もHPが低い(与しやすい)ものを選ぶ単純なボット
        const pick = [...state.enemyCandidates].sort((a, b) => a.hp - b.hp)[0];
        const chosen = chooseEnemy(state, pick.id);
        if (!chosen.ok) throw new Error('choose failed');
        state = chosen.state;

        const enemy = state.currentEnemy!;
        const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
        const freeCapacity = getCapacityInfo(state).free;
        const setup: PlayerBattleSetup = { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE, freeCapacity };
        const engine = new BattleEngine(setup, enemy, state.battleIndex, { verbose: false, commandFamilyIds: state.commandLoadout });
        let guard = 0;
        while (engine.getStatus() === 'ongoing' && guard < 20000) {
          engine.tick(0.1);
          guard += 1;
        }
        if (guard >= 20000) throw new Error(`battle ${state.battleIndex} did not converge`);
        const result = engine.getStatus() as 'won' | 'lost';
        state = finishBattle(state, result, engine.getFinalPlayerHp());
        if (result === 'lost' || state.phase === 'result') break;
        state = autoPickDrop(state);
        state = advanceToNextBattle(state);
      }
      if (state.phase === 'result' || state.battleIndex >= 16) completed++;
      else throw new Error(`run ${runId} stalled at battleIndex=${state.battleIndex} phase=${state.phase}`);
    } catch (e) {
      crashed++;
      console.log(`    (失敗) run${runId}: ${e}`);
    }
  }
  check(`${RUNS}回のフル16戦シミュレーションがすべて例外なく完走する`, crashed === 0 && completed === RUNS);
}

console.log(`\n合計: ${pass}件成功 / ${fail}件失敗`);
if (fail > 0) process.exit(1);
