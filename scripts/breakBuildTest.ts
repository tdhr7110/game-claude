// TEST8 優先4: 「壊れ方の異なる完成ビルド」3系統(多腕・超連撃型/疫病・毒爆発型/不死・反射要塞型)の
// 成立条件・発動条件・強さを自動検証する(本番ビルドには含まれない)。
// 実行: npx tsx scripts/breakBuildTest.ts
import { BattleEngine, type BattleEvent, type PlayerBattleSetup } from '../src/engine/battle';
import { getPartDef } from '../src/data/parts';
import { resolveFamilyBestCommand } from '../src/data/commandDefs';
import { computeActiveSynergies } from '../src/engine/synergyEngine';
import { computeModifiers } from '../src/engine/modifiers';
import { CORE_HP_BASE, BASE_DEFENSE, BASE_CAPACITY } from '../src/engine/run';
import { computeCapacity } from '../src/engine/capacity';
import { BREAK_BUILDS, getBreakBuild, type BreakBuildStage } from '../src/data/breakBuilds';
import type { EnemyDef } from '../src/data/types';

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
    hp: 1_000_000,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 0,
    moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 5, tags: [], effects: [], icon: '💢' }],
    description: '',
    icon: '🎯',
    color: '#888',
    // TEST7統合: ドロップ抽選・敵選択画面向けフィールド。このダミーは純粋な戦闘性能検証専用の的で
    // ドロップ・ギミックのいずれも検証対象ではないため、空(=ドロップ不可・ギミックなし)が正しい値。
    bodyPartIds: [],
    rareDropPartIds: [],
    gimmickSummary: '',
    gimmicks: [],
    ...overrides,
  };
}

function buildSetup(partIds: string[], currentHp = CORE_HP_BASE * 10): PlayerBattleSetup {
  const equipped = partIds.map((id, i) => ({ instanceId: `t${i}`, def: getPartDef(id) }));
  const capacity = computeCapacity(equipped, BASE_CAPACITY, 0);
  return { equipped, coreHpBase: CORE_HP_BASE, currentHp, baseDefense: BASE_DEFENSE, freeCapacity: capacity.free };
}

function runFor(engine: BattleEngine, seconds: number, dt = 0.1): BattleEvent[] {
  let t = 0;
  const all: BattleEvent[] = [];
  while (t < seconds && engine.getStatus() === 'ongoing') {
    engine.tick(dt);
    all.push(...engine.drainEvents());
    t += dt;
  }
  return all;
}

function makeEngineForStage(stage: BreakBuildStage, enemy: EnemyDef, currentHp?: number): BattleEngine {
  const setup = buildSetup(stage.partIds, currentHp);
  return new BattleEngine(setup, enemy, 1, { commandFamilyIds: stage.commandFamilyIds });
}

function hitCount(events: BattleEvent[]): number {
  return events.filter((e) => e.type === 'attack').length;
}
function totalDamage(events: BattleEvent[]): number {
  return events.filter((e) => e.type === 'attack').reduce((s, e) => s + e.damage, 0);
}

// ============================================================
section('0. 3ビルドすべてがデータとして成立している(部位・コマンドIDが実在する)');
// ============================================================
for (const build of BREAK_BUILDS) {
  for (const stage of build.stages) {
    let ok = true;
    for (const id of stage.partIds) {
      try {
        getPartDef(id);
      } catch {
        ok = false;
      }
    }
    assert(ok, `${build.name}/${stage.label}: 装着部位IDがすべて実在する`);
  }
}
assert(BREAK_BUILDS.length === 3, '壊れビルドが3系統定義されている');
for (const build of BREAK_BUILDS) {
  assert(build.stages.length === 3, `${build.name}: 序盤/中盤/完成の3段階を持つ`);
  assert(
    build.stages.map((s) => s.key).join(',') === 'early,mid,complete',
    `${build.name}: 段階の順序がearly→mid→completeになっている`
  );
}

// ============================================================
section('A. 多腕・超連撃型: コマンド成立条件');
// ============================================================
{
  const build = getBreakBuild('multi_arm');
  const early = build.stages[0];
  const mid = build.stages[1];
  const complete = build.stages[2];
  const earlyDefs = early.partIds.map(getPartDef);
  const midDefs = mid.partIds.map(getPartDef);
  const completeDefs = complete.partIds.map(getPartDef);

  assert(resolveFamilyBestCommand('allarms', earlyDefs)?.commandId === 'cmd_all_arms_volley', '序盤(腕3本)では全腕斉射までしか解放されない');
  assert(resolveFamilyBestCommand('allarms', midDefs)?.commandId === 'cmd_hundred_arms_barrage', '中盤(腕6本+多腕核)で百腕乱舞に進化する');
  assert(resolveFamilyBestCommand('allarms', completeDefs)?.commandId === 'cmd_hundred_arms_barrage', '完成でも百腕乱舞が維持されている');
  assert(resolveFamilyBestCommand('ultimate', completeDefs)?.commandId === 'cmd_full_organ_release', '完成ビルドは全器官解放(奥義)も解放している');

  const earlySyn = computeActiveSynergies(earlyDefs);
  const midSyn = computeActiveSynergies(midDefs);
  const completeSyn = computeActiveSynergies(completeDefs);
  assert(earlySyn.partType.arm.activeTiers.length === 0, '序盤(腕3本)はまだ腕シナジーが1つも発動していない(4本必要)');
  assert(midSyn.partType.arm.activeTiers.length === 2, '中盤(腕6本)は6回攻撃コンボシナジーまで有効になる');
  assert(completeSyn.partType.arm.activeTiers.length === 3, '完成(腕10本)は追撃シナジーまで全て有効になる');
}

section('A. 多腕・超連撃型: 強さ(序盤 vs 完成のHIT数・ダメージ量)');
{
  const build = getBreakBuild('multi_arm');
  const enemy = dummyEnemy();

  // 序盤: 全腕斉射を1回発動した後、5秒間のオート攻撃を計測する
  const earlyEngine = makeEngineForStage(build.stages[0], enemy);
  earlyEngine.debugSetMetabolism(100);
  earlyEngine.useCommand(0); // 全腕斉射
  const earlyEvents = runFor(earlyEngine, 5);
  const earlyHits = hitCount(earlyEvents);
  const earlyDamage = totalDamage(earlyEvents);

  // 完成: 狂化→百腕乱舞を発動した後、同じく5秒間のオート攻撃を計測する
  const completeEngine = makeEngineForStage(build.stages[2], enemy);
  completeEngine.debugSetMetabolism(100);
  completeEngine.useCommand(1); // 狂化(攻撃速度+40%)
  completeEngine.debugSetMetabolism(100);
  completeEngine.useCommand(0); // 百腕乱舞
  const completeEvents = runFor(completeEngine, 5);
  const completeHits = hitCount(completeEvents);
  const completeDamage = totalDamage(completeEvents);

  console.log(`     序盤: ${earlyHits}HIT / ${Math.round(earlyDamage)}ダメージ`);
  console.log(`     完成: ${completeHits}HIT / ${Math.round(completeDamage)}ダメージ`);
  assert(completeHits >= earlyHits * 3, '完成ビルドのHIT数は序盤の3倍以上に達する(超連撃)');
  assert(completeDamage >= earlyDamage * 3, '完成ビルドの総ダメージは序盤の3倍以上に達する');
}

// ============================================================
section('B. 疫病・毒爆発型: コマンド成立条件');
// ============================================================
{
  const build = getBreakBuild('plague');
  const earlyDefs = build.stages[0].partIds.map(getPartDef);
  const midDefs = build.stages[1].partIds.map(getPartDef);
  const completeDefs = build.stages[2].partIds.map(getPartDef);

  assert(resolveFamilyBestCommand('poisonburst', earlyDefs)?.commandId === 'cmd_poison_burst', '序盤(毒腺のみ)は毒爆発止まり');
  assert(resolveFamilyBestCommand('poisonburst', midDefs)?.commandId === 'cmd_plague_burst', '中盤(疫病核追加)で疫病爆発に進化する');
  assert(resolveFamilyBestCommand('poisonburst', completeDefs)?.commandId === 'cmd_plague_burst', '完成でも疫病爆発が維持されている');
  assert(resolveFamilyBestCommand('paralysis', completeDefs)?.commandId === 'cmd_paralysis', '完成ビルドは神経麻痺で敵の行動を止められる');

  const earlyMods = computeModifiers(earlyDefs, computeActiveSynergies(earlyDefs));
  const completeMods = computeModifiers(completeDefs, computeActiveSynergies(completeDefs));
  assert(earlyMods.poisonNoDecayChance === 0, '序盤は疫病核を持たないため毒が通常どおり減衰する');
  assert(completeMods.poisonNoDecayChance >= 0.85, '完成は疫病核により毒がほぼ減衰しなくなる');
}

section('B. 疫病・毒爆発型: 発動条件(毒0では使用不可)と強さ(蓄積量・爆発ダメージ)');
{
  const build = getBreakBuild('plague');
  const enemy = dummyEnemy({ evasionPct: 0 });

  const completeEngine = makeEngineForStage(build.stages[2], enemy);
  completeEngine.debugSetMetabolism(100);
  const blocked = completeEngine.useCommand(0); // 疫病爆発(毒0で発動できないはず)
  assert(!blocked.ok, '敵に毒が乗っていない状態では疫病爆発を発動できない');

  // 毒針腕の自動攻撃で毒を蓄積させる(序盤 vs 完成を同条件・同時間で比較)
  const earlyEngine = makeEngineForStage(build.stages[0], dummyEnemy({ evasionPct: 0 }));
  runFor(earlyEngine, 8);
  const earlyPoison = earlyEngine.getSnapshot().enemy.poison;

  runFor(completeEngine, 8);
  const completePoison = completeEngine.getSnapshot().enemy.poison;
  console.log(`     序盤(8秒後の毒): ${earlyPoison}  完成(8秒後の毒): ${completePoison}`);
  assert(completePoison > earlyPoison * 2, '完成ビルドは同じ時間でも序盤の2倍以上の毒を蓄積できる(疫病核の減衰無効化+毒針腕増量)');

  // 蓄積した毒を疫病爆発で一気に解放する
  completeEngine.debugSetMetabolism(100);
  completeEngine.debugResetCommandCooldowns();
  const poisonBeforeBurst = completeEngine.getSnapshot().enemy.poison;
  const enemyHpBefore = completeEngine.getSnapshot().enemy.hp;
  const burst = completeEngine.useCommand(0); // 疫病爆発
  const snapAfter = completeEngine.getSnapshot();
  assert(burst.ok, '毒が十分に蓄積した状態では疫病爆発を発動できる');
  assert(snapAfter.enemy.poison < poisonBeforeBurst, '疫病爆発で蓄積した毒が消費される');
  const burstDamage = enemyHpBefore - snapAfter.enemy.hp;
  console.log(`     疫病爆発ダメージ: ${burstDamage}`);
  assert(burstDamage >= 40, '疫病爆発は単発の腕攻撃を大きく超える一撃(40以上)を叩き出す');
}

// ============================================================
section('C. 不死・反射要塞型: コマンド成立条件と心臓シナジー');
// ============================================================
{
  const build = getBreakBuild('reflect_fortress');
  const earlyDefs = build.stages[0].partIds.map(getPartDef);
  const midDefs = build.stages[1].partIds.map(getPartDef);
  const completeDefs = build.stages[2].partIds.map(getPartDef);

  assert(resolveFamilyBestCommand('harden', earlyDefs)?.commandId === 'cmd_harden', '序盤(反射装甲1枚)は硬質化止まり');
  assert(resolveFamilyBestCommand('harden', midDefs)?.commandId === 'cmd_reflect_shell', '中盤(反射装甲2枚)で反射甲殻に進化する');
  assert(resolveFamilyBestCommand('heartbeat', midDefs)?.commandId === 'cmd_heartbeat', '中盤(心臓2個)は多重鼓動止まり(竜の心臓が無いため竜脈再生には進化しない)');
  assert(resolveFamilyBestCommand('heartbeat', completeDefs)?.commandId === 'cmd_dragon_vein', '完成(竜の心臓+巨大心臓)で竜脈再生に進化する');

  const midMods = computeModifiers(midDefs, computeActiveSynergies(midDefs));
  const completeMods = computeModifiers(completeDefs, computeActiveSynergies(completeDefs));
  assert(midMods.reviveHpPct === null, '中盤(心臓2個)はまだ致死復活シナジーに届かない');
  assert(completeMods.reviveHpPct === 0.2, '完成(心臓5個)で「致死ダメージ時にHP20%復活」シナジーが発動する');
}

section('C. 不死・反射要塞型: 強さ(瀕死からの復活・反射ダメージ)');
{
  const build = getBreakBuild('reflect_fortress');
  const bigHitEnemy = dummyEnemy({
    hp: 1_000_000,
    moves: [{ id: 'heavy_hit', name: '大攻撃', attack: 500, interval: 1, tags: [], effects: [], icon: '💥' }],
  });

  // 完成ビルド: 瀕死のところへ大攻撃を受けても、心臓5個の復活シナジーで即死しない
  const completeEngine = makeEngineForStage(build.stages[2], bigHitEnemy, 1);
  completeEngine.debugSetHp('player', 3);
  const events = runFor(completeEngine, 1.2);
  const snap = completeEngine.getSnapshot();
  const revived = events.some((e) => e.type === 'special' && e.label === '復活');
  assert(revived, '瀕死状態で致死ダメージを受けると復活イベントが発生する');
  assert(!snap.player.isDead && snap.player.hp > 0, '完成ビルドは即死級の一撃を受けても生存している');

  // 序盤ビルド: 同じ状況では復活シナジーがなく、素直に敗北する
  const earlyEngine = makeEngineForStage(build.stages[0], bigHitEnemy, 1);
  earlyEngine.debugSetHp('player', 3);
  runFor(earlyEngine, 1.2);
  assert(earlyEngine.getStatus() === 'lost', '序盤ビルドは同じ状況では復活できずに敗北する(強さの差の対照実験)');

  // 反射甲殻: 発動中に被弾すると、攻撃した敵の側にもダメージが返る
  const reflectEngine = makeEngineForStage(build.stages[2], bigHitEnemy, 500);
  reflectEngine.debugSetMetabolism(100);
  const reflectResult = reflectEngine.useCommand(0); // 反射甲殻(harden family)
  assert(reflectResult.ok, '完成ビルドは反射甲殻を発動できる');
  const enemyHpBeforeReflect = reflectEngine.getSnapshot().enemy.hp;
  const reflectEvents = runFor(reflectEngine, 1.2);
  const enemyHpAfterReflect = reflectEngine.getSnapshot().enemy.hp;
  const gotReflectEvent = reflectEvents.some((e) => e.type === 'reflect');
  assert(gotReflectEvent, '反射甲殻が発動中に被弾すると反射イベントが発生する');
  assert(enemyHpAfterReflect < enemyHpBeforeReflect, '反射甲殻により、攻撃してきた敵側にもダメージが返っている');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
