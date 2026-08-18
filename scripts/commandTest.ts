// TEST2フェーズ2: コマンド・敵ギミックの動作確認用スクリプト（本番ビルドには含まれない）
// 実行: npx tsx scripts/commandTest.ts
import { BattleEngine, type PlayerBattleSetup } from '../src/engine/battle';
import { getPartDef } from '../src/data/parts';
import { CORE_HP_BASE, BASE_DEFENSE, BASE_CAPACITY } from '../src/engine/run';
import { computeCapacity } from '../src/engine/capacity';
import type { EnemyDef } from '../src/data/types';

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
    moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 10, tags: [], effects: [], icon: '💢' }],
    description: '',
    icon: '🎯',
    color: '#888',
    ...overrides,
  };
}

function buildSetup(defIds: string[]): PlayerBattleSetup {
  const equipped = defIds.map((id, i) => ({ instanceId: `t${i}`, def: getPartDef(id) }));
  const capacity = computeCapacity(equipped, BASE_CAPACITY, 0);
  return { equipped, coreHpBase: CORE_HP_BASE, currentHp: 100000, baseDefense: BASE_DEFENSE, freeCapacity: capacity.free };
}

function section(title: string) {
  console.log(`\n${'='.repeat(10)} ${title} ${'='.repeat(10)}`);
}

// --- A. 一斉発動: 腕2本/6本/10本での威力比較 ---
section('A. 一斉発動 (腕数によるスケーリング)');
for (const armCount of [2, 6, 10]) {
  const setup = buildSetup(Array(armCount).fill('weak_arm'));
  const engine = new BattleEngine(setup, dummyEnemy(), 1, { verbose: false });
  const before = engine.getSnapshot().enemy.hp;
  const res = engine.useCommand('alpha_strike');
  const after = engine.getSnapshot().enemy.hp;
  console.log(`腕${armCount}本: useCommand ok=${res.ok}, ダメージ=${before - after}`);
}

// --- B. 暴走: 使用前後の攻撃速度倍率確認 ---
section('B. 暴走 (時限バフ/反動)');
{
  const setup = buildSetup(['weak_arm', 'weak_arm']);
  const engine = new BattleEngine(setup, dummyEnemy(), 1, { verbose: false });
  engine.useCommand('rampage');
  let snap = engine.getSnapshot();
  console.log('使用直後のtempAttackSpeedMult:', snap.player.tempAttackSpeedMult, '(期待値: 2)');
  for (let i = 0; i < 60; i++) engine.tick(0.1); // 6秒進める(バフ終了→反動開始のはず)
  snap = engine.getSnapshot();
  console.log('6秒後のtempAttackSpeedMult:', snap.player.tempAttackSpeedMult, '(期待値: 0.75 = 反動中)');
  for (let i = 0; i < 60; i++) engine.tick(0.1); // さらに6秒(反動終了のはず)
  snap = engine.getSnapshot();
  console.log('12秒後のtempAttackSpeedMult:', snap.player.tempAttackSpeedMult, '(期待値: 1 = 通常)');
}

// --- C. 防御: 被ダメージ軽減とクールダウン ---
section('C. 防御 (被ダメージ軽減・クールダウン・外殻シナジー)');
{
  const strongEnemy = dummyEnemy({ moves: [{ id: 'm1', name: '大攻撃', attack: 100, interval: 1, tags: [], effects: [], icon: '💥' }] });
  for (const [label, ids] of [
    ['防御なし', ['weak_arm']],
    ['防御あり', ['weak_arm']],
    ['防御あり+外殻5', ['weak_arm', 'insect_carapace', 'insect_carapace', 'insect_carapace', 'insect_carapace', 'insect_carapace']],
  ] as const) {
    const setup = buildSetup(ids as unknown as string[]);
    const engine = new BattleEngine(setup, strongEnemy, 1, { verbose: false });
    if (label !== '防御なし') engine.useCommand('guard');
    const before = engine.getSnapshot().player.hp;
    for (let i = 0; i < 25; i++) engine.tick(0.1); // 2.5秒
    const after = engine.getSnapshot().player.hp;
    const cmdSnap = engine.getSnapshot().commands.find((c) => c.id === 'guard');
    console.log(`[${label}] 2.5秒間の被ダメージ: ${before - after} / guardクールダウン残り: ${cmdSnap?.cooldownRemaining.toFixed(1)}秒`);
  }
}

// --- D. ゴーレムギミック: 防御態勢による被ダメージ軽減の実測 ---
section('D. ゴーレムギミック (防御態勢)');
{
  const golemEnemy = dummyEnemy({
    species: 'golem',
    hp: 100000,
    gimmick: { kind: 'golem_fortify', cycleSeconds: 2, telegraphSeconds: 1, fortifyDurationSeconds: 3, damageReductionBonusPct: 50 },
  });
  const setup = buildSetup(Array(10).fill('golem_rock_arm'));
  const engine = new BattleEngine(setup, golemEnemy, 1, { verbose: false });
  let sawTelegraph = false;
  let sawActive = false;
  let dmgBeforeFortify = 0;
  let dmgDuringFortify = 0;
  for (let i = 0; i < 100; i++) {
    const before = engine.getSnapshot().enemy.hp;
    engine.tick(0.1);
    const snap = engine.getSnapshot();
    const dealt = before - snap.enemy.hp;
    if (snap.enemy.gimmick?.phase === 'telegraph') sawTelegraph = true;
    if (snap.enemy.gimmick?.phase === 'active') {
      sawActive = true;
      dmgDuringFortify += dealt;
    } else {
      dmgBeforeFortify += dealt;
    }
  }
  console.log('防御態勢準備(telegraph)フェーズを観測:', sawTelegraph);
  console.log('防御態勢(active)フェーズを観測:', sawActive);
  console.log(`防御態勢中の被ダメージ軽減効果 (通常時ダメージ合計比較用ログ): 態勢外=${dmgBeforeFortify.toFixed(0)} 態勢中=${dmgDuringFortify.toFixed(0)}`);
}

// --- E. ドラゴンギミック: チャージ後の大技発動 ---
section('E. ドラゴンギミック (大技チャージ)');
{
  const dragonEnemy = dummyEnemy({
    species: 'dragon',
    hp: 100000,
    moves: [{ id: 'm1', name: '爪撃', attack: 5, interval: 5, tags: [], effects: [], icon: '🐾' }],
    gimmick: { kind: 'dragon_charge', chargeSeconds: 2, burstMultiplier: 3, cooldownSeconds: 1 },
  });
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, dragonEnemy, 1, { verbose: false });
  let burstSeen = false;
  for (let i = 0; i < 40; i++) {
    engine.tick(0.1);
    const snap = engine.getSnapshot();
    if (snap.log.some((l) => l.includes('大技が炸裂'))) burstSeen = true;
  }
  console.log('大技発動ログを観測:', burstSeen);
}

// --- F. 昆虫ギミック: 狂乱状態での攻撃速度上昇 ---
section('F. 昆虫ギミック (狂乱状態)');
{
  const insectEnemy = dummyEnemy({
    species: 'insect',
    hp: 100000,
    moves: [{ id: 'm1', name: '毒針', attack: 3, interval: 1, tags: [], effects: [], icon: '🪡' }],
    gimmick: { kind: 'insect_frenzy', cycleSeconds: 1, telegraphSeconds: 1, frenzyDurationSeconds: 2, attackSpeedMult: 2 },
  });
  const setup = buildSetup(['weak_arm']);
  const engine = new BattleEngine(setup, insectEnemy, 1, { verbose: false });
  let maxMult = 1;
  for (let i = 0; i < 30; i++) {
    engine.tick(0.1);
    const snap = engine.getSnapshot();
    maxMult = Math.max(maxMult, snap.enemy.tempAttackSpeedMult);
  }
  console.log('狂乱状態中に観測した最大攻撃速度倍率:', maxMult, '(期待値: 2)');
}

// --- G. 火炎放射(部位由来コマンド): 装着有無での使用可否 ---
section('G. 火炎放射（部位由来コマンドの拡張性テスト）');
{
  const withPart = buildSetup(['weak_arm', 'dragon_flame_head']);
  const withoutPart = buildSetup(['weak_arm']);
  const e1 = new BattleEngine(withPart, dummyEnemy(), 1, { verbose: false });
  const e2 = new BattleEngine(withoutPart, dummyEnemy(), 1, { verbose: false });
  console.log('火炎頭あり: 利用可能コマンドに含まれるか =', e1.getAvailableCommands().some((c) => c.id === 'flame_breath'));
  console.log('火炎頭なし: 利用可能コマンドに含まれるか =', e2.getAvailableCommands().some((c) => c.id === 'flame_breath'));
  const res1 = e1.useCommand('flame_breath');
  console.log('火炎頭ありでuseCommand結果:', res1);
}

console.log('\n全コマンド確認スクリプト完了');
