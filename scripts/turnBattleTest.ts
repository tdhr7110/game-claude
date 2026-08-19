// コマンドバトルTEST（ターン制検証モード）の自動テスト（本番ビルドには含まれない）。
// 技進化条件の判定とターン進行について、要件チェックリストの項目を検証する。
// 実行: npx tsx scripts/turnBattleTest.ts
import { getPartDef } from '../src/data/parts';
import { resolveActiveSkills } from '../src/data/turnSkills';
import { POISON_SPIDER, ROCK_GOLEM } from '../src/data/turnEnemies';
import { createTurnBattleState, currentEnemyMove, executeTurn, type TurnBattleState } from '../src/engine/turnBattle';
import { BattleEngine, type PlayerBattleSetup } from '../src/engine/battle';
import { CORE_HP_BASE, BASE_DEFENSE, BASE_CAPACITY } from '../src/engine/run';
import { computeCapacity } from '../src/engine/capacity';
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

function equip(ids: string[]) {
  return ids.map((id) => getPartDef(id));
}

// ============================================================
// 1〜9: 技進化条件の判定（「現在装着している部位」だけで判定されること）
// ============================================================
section('技進化: 通常技');
assert(resolveActiveSkills(equip(['weak_arm'])).normal?.skillId === 'normal_punch', '腕1本で「殴る」が使用できる');
assert(resolveActiveSkills(equip(['weak_arm', 'weak_arm', 'weak_arm'])).normal?.skillId === 'normal_flurry', '腕3本で「乱打」へ進化する');
assert(
  resolveActiveSkills(equip(['insect_sickle_arm', 'insect_sickle_arm'])).normal?.skillId === 'normal_sickle_slash',
  '鎌腕2個で「鎌鼬連斬」へ進化する'
);
assert(
  resolveActiveSkills(equip(['insect_sickle_arm', 'insect_sickle_arm', 'insect_poison_gland'])).normal?.skillId === 'normal_poison_sickle_dance',
  '鎌腕2個＋毒腺で「毒鎌乱舞」へ進化する'
);
assert(
  resolveActiveSkills(equip(['insect_sickle_arm', 'insect_sickle_arm'])).normal?.skillId === 'normal_sickle_slash',
  '毒腺を外すと「鎌鼬連斬」へ戻る'
);

section('技進化: 変異技');
assert(
  resolveActiveSkills(equip(['insect_poison_needle_arm'])).mutation?.skillId === 'mutation_poison_needle',
  '毒針腕のみで「毒針」が使用できる'
);
assert(
  resolveActiveSkills(equip(['insect_poison_needle_arm', 'insect_poison_gland'])).mutation?.skillId === 'mutation_venom_injection',
  '毒針腕＋毒腺で「猛毒注入」が使用できる'
);
assert(
  resolveActiveSkills(equip(['insect_poison_gland', 'dragon_flame_head'])).mutation?.skillId === 'mutation_toxic_flame_burst',
  '毒腺＋火炎頭で「毒炎爆発」が使用できる'
);
assert(resolveActiveSkills(equip(['weak_arm'])).mutation?.skillId === 'mutation_wait', '変異技の条件を満たさない場合は様子見(使用可能な弱い技)になる');

section('技進化: 防御技');
assert(resolveActiveSkills(equip([])).guard?.skillId === 'guard_brace', '部位なしでも「身構える」が常時使用できる');
assert(
  resolveActiveSkills(equip(['insect_carapace'])).guard?.skillId === 'guard_shell',
  '皮膚・外殻カテゴリ1個で「甲殻防御」へ進化する'
);
assert(
  resolveActiveSkills(equip(['golem_reflect_armor', 'insect_carapace'])).guard?.skillId === 'guard_reflect_shell',
  '反射装甲＋皮膚カテゴリ2個で「反射甲殻」へ進化する'
);
assert(
  resolveActiveSkills(equip(['golem_reflect_armor'])).guard?.skillId === 'guard_shell',
  '反射装甲1個だけ(皮膚カテゴリ1個)では反射甲殻の条件を満たさない'
);

// ============================================================
// 10: 敵の次の行動がコマンド選択前に分かる
// ============================================================
section('敵の行動予告');
{
  const state = createTurnBattleState(ROCK_GOLEM);
  const move = currentEnemyMove(state);
  assert(move.id === ROCK_GOLEM.pattern[0].id, '戦闘開始時点で、実行前の敵の行動が取得できる');
  assert(move.telegraph.length > 0, '敵の行動に予告テキストが設定されている');
}

// ============================================================
// 8: 毒炎爆発で毒が消費され、毒量に応じてダメージが変化する
// ============================================================
section('毒炎爆発の毒消費');
{
  const build = equip(['insect_poison_gland', 'dragon_flame_head']);

  const noPoison = createTurnBattleState(POISON_SPIDER);
  const afterNoPoison = executeTurn(noPoison, build, 'mutation');
  assert(afterNoPoison.lastResult?.playerTotalDamage === 6, '敵の毒が0のときは最低保証ダメージ(6)になる');

  const lowPoisonBase = createTurnBattleState(POISON_SPIDER);
  const lowPoison: TurnBattleState = { ...lowPoisonBase, enemy: { ...lowPoisonBase.enemy, poison: 3 } };
  const afterLowPoison = executeTurn(lowPoison, build, 'mutation');
  assert(afterLowPoison.lastResult?.playerTotalDamage === 12, '毒3のときは3×4=12ダメージになる');
  assert(afterLowPoison.enemy.poison === 0, '毒炎爆発を使うと敵の毒は0まで消費される');

  const highPoisonBase = createTurnBattleState(POISON_SPIDER);
  const highPoison: TurnBattleState = { ...highPoisonBase, enemy: { ...highPoisonBase.enemy, poison: 10 } };
  const afterHighPoison = executeTurn(highPoison, build, 'mutation');
  assert((afterHighPoison.lastResult?.playerTotalDamage ?? 0) > (afterLowPoison.lastResult?.playerTotalDamage ?? 0), '毒が多いほどダメージが大きくなる');
}

// ============================================================
// 11: 防御技でゴーレムの強攻撃を軽減できる
// ============================================================
section('防御技による軽減');
{
  const withGuard: TurnBattleState = { ...createTurnBattleState(ROCK_GOLEM), enemyMoveIndex: 2 }; // 次は「大地粉砕」24ダメージ
  const afterGuard = executeTurn(withGuard, [], 'guard');
  assert(afterGuard.lastResult?.enemyMoveName === '大地粉砕', '大地粉砕(強攻撃)のターンであることを確認');
  assert(afterGuard.lastResult?.enemyDamageToPlayer === 14, '身構える(-40%)で24ダメージ→14ダメージに軽減される');

  const withoutGuard: TurnBattleState = { ...createTurnBattleState(ROCK_GOLEM), enemyMoveIndex: 2 };
  const afterNoGuard = executeTurn(withoutGuard, equip(['weak_arm']), 'normal');
  assert(afterNoGuard.lastResult?.enemyDamageToPlayer === 24, '防御技を使わない場合は24ダメージそのまま通る');
}

// ============================================================
// 12: クールダウン中の技を使用できない
// ============================================================
section('クールダウン');
{
  const build = equip(['insect_poison_needle_arm']);
  let state = createTurnBattleState(ROCK_GOLEM);
  state = executeTurn(state, build, 'mutation'); // 毒針(CD2)を使用
  assert(state.cooldowns.mutation === 2, '使用直後はクールダウンが2にセットされる');
  const beforeRetry = state;
  const afterRetry = executeTurn(state, build, 'mutation');
  assert(afterRetry === beforeRetry, 'クールダウン中に同じ枠を選んでも状態が変化しない(使用できない)');
  assert(afterRetry.cooldowns.mutation >= 0, 'クールダウンが負数にならない');
}

// ============================================================
// 13・14: 毒ダメージで敵を倒しても正常に勝利し、勝敗後はターンが進行しない
// ============================================================
section('毒による決着とターン停止');
{
  const base = createTurnBattleState(POISON_SPIDER, 100);
  // プレイヤーの一撃(様子見=2ダメージ)では倒れず、ターン終了時の毒(5)で倒れるように調整
  const rigged: TurnBattleState = { ...base, enemy: { ...base.enemy, hp: 3, poison: 5 } };
  const afterPoisonKill = executeTurn(rigged, [], 'mutation'); // mutation_wait: 2ダメージ
  assert(afterPoisonKill.status === 'won', '毒ダメージで敵のHPが0になったとき、正しく勝利状態になる');
  assert(afterPoisonKill.enemy.hp === 0, '敵のHPが0未満にならず0で止まる');

  const beforeNoop = afterPoisonKill;
  const afterNoop = executeTurn(afterPoisonKill, [], 'normal');
  assert(afterNoop === beforeNoop, '勝敗決定後にコマンドを選んでもターンが進行しない');
}

// ============================================================
// 15: 既存のオートバトルが引き続き動作する（本線 battle.ts への影響がないことの確認）
// ============================================================
section('既存オートバトルの健全性確認');
{
  function dummyEnemy(overrides: Partial<EnemyDef> = {}): EnemyDef {
    return {
      id: 'dummy',
      name: 'テスト用の的',
      species: 'chimera',
      tier: 'elite',
      hp: 40,
      defense: 0,
      damageReductionPct: 0,
      evasionPct: 0,
      moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 5, tags: [], effects: [], icon: '💢' }],
      description: '',
      icon: '🎯',
      color: '#888',
      // TEST7統合: このダミーはオートバトルの健全性だけを検証する的で、ドロップ・ギミックは
      // 検証対象ではないため、空(=ドロップ不可・ギミックなし)が正しい値。
      bodyPartIds: [],
      rareDropPartIds: [],
      gimmickSummary: '',
      gimmicks: [],
      ...overrides,
    };
  }
  const ids = ['weak_arm', 'weak_arm'];
  const equipped = ids.map((id, i) => ({ instanceId: `t${i}`, def: getPartDef(id) }));
  const capacity = computeCapacity(equipped, BASE_CAPACITY, 0);
  const setup: PlayerBattleSetup = { equipped, coreHpBase: CORE_HP_BASE, currentHp: CORE_HP_BASE, baseDefense: BASE_DEFENSE, freeCapacity: capacity.free };
  const engine = new BattleEngine(setup, dummyEnemy(), 1, { verbose: false });
  let t = 0;
  while (t < 30 && engine.getStatus() === 'ongoing') {
    engine.tick(0.1);
    t += 0.1;
  }
  assert(engine.getStatus() === 'won', '既存のオートバトル(BattleEngine)は今回の変更後も従来通り決着まで動作する');
}

// ============================================================
console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
