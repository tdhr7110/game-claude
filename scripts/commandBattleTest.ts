// コマンドシステム(オートバトル維持型)の自動テスト（本番ビルドには含まれない）。
// 要件チェックリストの項目を、実際のBattleEngineへ直接コマンドを発動させて検証する。
// 実行: npx tsx scripts/commandBattleTest.ts
import { readFileSync } from 'fs';
import { BattleEngine, type PlayerBattleSetup } from '../src/engine/battle';
import { getPartDef } from '../src/data/parts';
import { CORE_HP_BASE, BASE_DEFENSE, BASE_CAPACITY, equipPart, unequipPart, setCommandSlot, createInitialRunState, type RunState } from '../src/engine/run';
import { computeCapacity } from '../src/engine/capacity';
import { resolveFamilyBestCommand } from '../src/data/commandDefs';
import type { EnemyDef, EnemyMove, PartInstance } from '../src/data/types';

let passCount = 0;
let failCount = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}
function section(title: string) {
  console.log(`\n${'='.repeat(8)} ${title} ${'='.repeat(8)}`);
}

function dummyEnemy(overrides: Partial<EnemyDef> = {}): EnemyDef {
  return {
    id: 'dummy',
    name: 'テスト用の的',
    species: 'chimera',
    tier: 'elite',
    hp: 100000,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 0,
    moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 5, tags: [], effects: [], icon: '💢' }],
    description: '',
    icon: '🎯',
    color: '#888',
    // TEST7統合: このダミーはコマンドシステムの戦闘性能だけを検証する的で、ドロップ・ギミックは
    // 検証対象ではないため、空(=ドロップ不可・ギミックなし)が正しい値。
    bodyPartIds: [],
    rareDropPartIds: [],
    gimmickSummary: '',
    gimmicks: [],
    ...overrides,
  };
}

function poisonEnemy(): EnemyDef {
  const move: EnemyMove = { id: 'poison_bite', name: '毒噛み', attack: 3, interval: 0.3, tags: ['poison'], effects: [{ kind: 'apply_poison', amount: 4 }], icon: '☠️' };
  return dummyEnemy({ hp: 100000, moves: [move] });
}

function buildSetup(defIds: string[], currentHp = 10000): PlayerBattleSetup {
  const equipped = defIds.map((id, i) => ({ instanceId: `t${i}`, def: getPartDef(id) }));
  const capacity = computeCapacity(equipped, BASE_CAPACITY, 0);
  return { equipped, coreHpBase: CORE_HP_BASE, currentHp, baseDefense: BASE_DEFENSE, freeCapacity: capacity.free };
}

function runFor(engine: BattleEngine, seconds: number, dt = 0.1) {
  let t = 0;
  while (t < seconds && engine.getStatus() === 'ongoing') {
    engine.tick(dt);
    t += dt;
  }
}

// ============================================================
section('1. オート攻撃が従来どおり進行する（コマンド未指定=既存挙動そのまま）');
{
  const setup = buildSetup(['insect_sickle_arm', 'insect_sickle_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 50 }), 1, { verbose: false });
  runFor(engine, 20);
  assert(engine.getStatus() === 'won', 'コマンド未指定でもオート攻撃だけで撃破まで進行する');
  const snap = engine.getSnapshot();
  assert(snap.commandsEnabled === false, 'commandFamilyIdsを渡さない場合はcommandsEnabledがfalseのまま');
}

section('2. 戦闘中にコマンドを任意のタイミングで使用できる');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 10000 }), 1, { commandFamilyIds: ['strike', 'guard', 'recover', null] });
  const before = engine.getSnapshot().enemy.hp;
  const result = engine.useCommand(0);
  const after = engine.getSnapshot().enemy.hp;
  assert(result.ok, '戦闘開始直後でも強打を発動できる');
  assert(after < before, '強打で敵にダメージが入る');
}

section('3. 代謝ゲージが時間と攻撃命中で回復する');
{
  const setup = buildSetup(['insect_sickle_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugSetMetabolism(0);
  runFor(engine, 3);
  const gauge = engine.getSnapshot().metabolism.current;
  assert(gauge > 0, '時間経過・攻撃命中により代謝ゲージが0から回復する');
}

section('4. ゲージ不足時にコマンドを使用できない');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugSetMetabolism(5); // 強打のコスト20未満
  const result = engine.useCommand(0);
  assert(!result.ok, '代謝ゲージが足りないと強打を発動できない');
}

section('5. クールダウン中に再使用できない');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugSetMetabolism(100);
  const first = engine.useCommand(0);
  const second = engine.useCommand(0);
  assert(first.ok, '1回目の強打は成功する');
  assert(!second.ok, 'クールダウン中(共通入力ロック含む)の再使用は失敗する');
}

section('6. 使用可能なコマンドを4個まで装備できる');
{
  let run: RunState = createInitialRunState();
  const armIds = ['weak_arm', 'weak_arm', 'weak_arm']; // 腕カテゴリ3個 → 全腕斉射を解放
  for (const defId of armIds) {
    // インベントリへ直接部位を積んで装着する(equipPartはインベントリのinstanceIdを要求するため)
    const [inst, next] = grantInstance(run, defId);
    run = equipPart(next, inst).state;
  }
  const r1 = setCommandSlot(run, 0, 'strike');
  const r2 = setCommandSlot(r1.state, 1, 'guard');
  const r3 = setCommandSlot(r2.state, 2, 'recover');
  const r4 = setCommandSlot(r3.state, 3, 'allarms');
  const r5 = setCommandSlot(r4.state, 4, 'strike'); // 5枠目は存在しない
  assert(r1.ok && r2.ok && r3.ok && r4.ok, '4つの枠すべてにコマンドを装備できる');
  assert(r4.state.commandLoadout.filter((f) => f).length === 4, '装備数が4個になっている');
  assert(!r5.ok, '5枠目は存在しないため装備できない');
}

section('7. 装着部位によってコマンドが解放される');
{
  assert(resolveFamilyBestCommand('allarms', []) === null, '腕0個では全腕斉射は解放されない');
  const threeArms = [getPartDef('weak_arm'), getPartDef('weak_arm'), getPartDef('weak_arm')];
  assert(resolveFamilyBestCommand('allarms', threeArms)?.commandId === 'cmd_all_arms_volley', '腕3個で全腕斉射が解放される');
}

section('8. 部位を外すと条件不足のコマンドが解除される');
{
  // createInitialRunStateは初期状態で「弱い腕」を2本装着済みのため、そこへ1本追加して
  // 合計3本(全腕斉射の条件)にした上で、追加した1本だけを外して2本に戻す。
  let run: RunState = createInitialRunState();
  const defaultArmCount = run.equipped.length;
  const [inst, next] = grantInstance(run, 'weak_arm');
  run = equipPart(next, inst).state;
  assert(run.equipped.length === defaultArmCount + 1 && run.equipped.length >= 3, '腕を追加して合計3本以上になっている(前提条件)');
  run = setCommandSlot(run, 0, 'allarms').state;
  assert(run.commandLoadout[0] === 'allarms', '腕3本以上の状態で全腕斉射を枠0へ装備できている');
  run = unequipPart(run, inst); // 追加した1本を外し、初期装備の本数まで戻す
  const stillEnough = resolveFamilyBestCommand('allarms', run.equipped.map((i) => getPartDef(i.defId))) !== null;
  assert(!stillEnough, '腕を1本外すと再び条件未満になる(前提条件)');
  assert(run.commandLoadout[0] === null, '腕が条件未満になると枠が自動的に空になる');
}

section('9. 全腕斉射が全攻撃部位を発動する');
{
  const setup = buildSetup(['weak_arm', 'weak_arm', 'weak_arm']);
  const single = buildSetup(['weak_arm']);
  const engineSingle = new BattleEngine(single, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engineSingle.debugSetMetabolism(100);
  engineSingle.useCommand(0);
  const singleHitDamage = engineSingle.getSnapshot().resultStats.commandDamage;

  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['allarms', null, null, null] });
  engine.debugSetMetabolism(100);
  const result = engine.useCommand(0);
  const volleyDamage = engine.getSnapshot().resultStats.commandDamage;
  assert(result.ok, '腕3本の状態で全腕斉射を発動できる');
  assert(volleyDamage > singleHitDamage, '全腕斉射のダメージは単発の強打より大きい(=複数の攻撃部位が発動している)');
}

section('10. 毒爆発が毒を消費してダメージを与える');
{
  const setup = buildSetup(['insect_poison_needle_arm', 'insect_poison_gland']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000, evasionPct: 0 }), 1, { commandFamilyIds: [null, 'poisonburst', null, null] });
  runFor(engine, 5); // 毒針腕の自動攻撃で敵に毒を蓄積させる
  const poisonBefore = engine.getSnapshot().enemy.poison;
  assert(poisonBefore > 0, '毒針腕の自動攻撃で敵に毒が蓄積している(前提条件)');
  engine.debugSetMetabolism(100);
  engine.debugResetCommandCooldowns();
  const enemyHpBefore = engine.getSnapshot().enemy.hp;
  const result = engine.useCommand(1);
  const snap = engine.getSnapshot();
  assert(result.ok, '敵に毒がある状態で毒爆発を発動できる');
  assert(snap.enemy.poison < poisonBefore, '毒爆発で敵の毒が消費される');
  assert(snap.enemy.hp < enemyHpBefore, '毒爆発でダメージが入る');
}

section('11. 疫病爆発が毒爆発から正常に進化する');
{
  const glandOnly = [getPartDef('insect_poison_gland')];
  const glandPlusCore = [getPartDef('insect_poison_gland'), getPartDef('special_plague_core')];
  assert(resolveFamilyBestCommand('poisonburst', glandOnly)?.commandId === 'cmd_poison_burst', '毒腺のみでは毒爆発が採用される');
  assert(resolveFamilyBestCommand('poisonburst', glandPlusCore)?.commandId === 'cmd_plague_burst', '疫病核を追加すると疫病爆発へ進化する');
}

section('12. バフ・デバフが指定時間で終了する');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: [null, 'guard', null, null] });
  engine.debugSetMetabolism(100);
  engine.useCommand(1); // 身構える(4秒)
  assert(engine.getSnapshot().player.activeEffects.length > 0, '身構える発動直後はバフが付与されている');
  runFor(engine, 5);
  assert(engine.getSnapshot().player.activeEffects.length === 0, '効果時間(4秒)経過後にバフが自動的に消える');
}

section('13. 回復が最大HPを不正に超えない');
{
  const setup = buildSetup(['weak_arm'], CORE_HP_BASE); // 満タンで開始
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: [null, null, 'recover', null] });
  engine.debugSetMetabolism(100);
  engine.useCommand(2);
  const snap = engine.getSnapshot();
  assert(snap.player.hp <= snap.player.maxHp, '満タン状態で回復コマンドを使っても最大HPを超えない');
}

section('14. 脱皮が状態異常を解除する');
{
  const setup = buildSetup(['insect_carapace', 'weak_arm']);
  const engine = new BattleEngine(setup, poisonEnemy(), 1, { commandFamilyIds: [null, null, null, 'molt'] });
  runFor(engine, 2); // 敵の毒攻撃でプレイヤーに毒を蓄積させる
  const before = engine.getSnapshot();
  assert(before.player.poison > 0, 'プレイヤーに毒が蓄積している(前提条件)');
  engine.debugSetMetabolism(100);
  engine.useCommand(3);
  const after = engine.getSnapshot();
  assert(after.player.poison === 0, '脱皮でプレイヤーの毒が解除される');
  assert(after.player.shieldValue > 0, '脱皮で一時障壁が付与される');
}

section('15. 反射から反射が無限発生しない');
{
  const setup = buildSetup(['golem_reflect_armor', 'insect_carapace', 'weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000, moves: [{ id: 'hit', name: '攻撃', attack: 20, interval: 0.2, tags: [], effects: [], icon: '👊' }] }), 1, {
    commandFamilyIds: [null, null, null, 'harden'],
  });
  engine.debugSetMetabolism(100);
  const result = engine.useCommand(3); // 反射甲殻
  assert(result.ok, '反射甲殻(硬質化系の進化形)を発動できる');
  let threw = false;
  try {
    runFor(engine, 5); // 敵の攻撃 → 反射 が何度も起きる状況を数秒回す
  } catch {
    threw = true;
  }
  assert(!threw, '反射が繰り返し発生してもエラーや無限ループが起きない');
}

section('16. 全器官解放が無限再発動しない');
{
  const setup = buildSetup(['special_colossal_heart', 'weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugForceUnlockCommand(0, 'cmd_full_organ_release');
  engine.debugSetMetabolism(100);
  const hpBefore = engine.getSnapshot().player.hp;
  const result = engine.useCommand(0);
  const hpAfter = engine.getSnapshot().player.hp;
  assert(result.ok, '全器官解放を発動できる');
  assert(hpAfter < hpBefore && hpAfter >= 1, '自傷ダメージが1回だけ適用され、HPは1未満にならない');
}

section('17. 勝敗後にコマンド効果が継続しない');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugSetMetabolism(100);
  engine.debugSetHp('enemy', 0);
  runFor(engine, 1);
  assert(engine.getStatus() === 'won', '敵のHPを0にすると勝利判定になる(前提条件)');
  const snapBefore = engine.getSnapshot();
  engine.tick(1);
  const useResult = engine.useCommand(0);
  const snapAfter = engine.getSnapshot();
  assert(!useResult.ok, '勝敗確定後はコマンドを使用できない');
  assert(snapAfter.player.hp === snapBefore.player.hp && snapAfter.enemy.hp === snapBefore.enemy.hp, '勝敗確定後はtick()を呼んでも状態が変化しない');
}

section('18. 戦闘結果の内訳が正しく集計される');
{
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 1, { commandFamilyIds: ['strike', null, null, null] });
  engine.debugSetMetabolism(100);
  engine.useCommand(0); // コマンドダメージ
  runFor(engine, 3); // オートダメージ
  const r = engine.getSnapshot().resultStats;
  assert(r.commandDamage > 0, 'コマンドによるダメージが内訳に計上される');
  assert(r.autoDamage > 0, 'オート攻撃によるダメージが内訳に計上される');
  assert(r.mostDamagingCommandName === '強打', '最も活躍したコマンド名が正しく集計される');
  assert(r.maxSingleHit > 0, '最大単発ダメージが記録される');
}

section('19. 既存セーブデータが破損しない');
{
  const gameContextSrc = readFileSync(new URL('../src/ui/GameContext.tsx', import.meta.url), 'utf-8');
  assert(gameContextSrc.includes("'chimera-battle:gallery:v1'"), 'キメラ図鑑のlocalStorageキーは変更されていない');
  assert(!gameContextSrc.includes('commandLoadout') || !gameContextSrc.includes('localStorage.setItem'), 'commandLoadoutはlocalStorageへ保存対象に追加されていない');
  const run = createInitialRunState();
  assert(Array.isArray(run.commandLoadout) && run.commandLoadout.length === 4, 'RunStateにcommandLoadoutが安全なデフォルト値で追加されている');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);

// --- ヘルパー ---
function grantInstance(state: RunState, defId: string): [string, RunState] {
  const instanceId = `test_${state.instanceSeq}`;
  const item: PartInstance = { instanceId, defId };
  return [instanceId, { ...state, instanceSeq: state.instanceSeq + 1, inventory: [...state.inventory, item] }];
}
