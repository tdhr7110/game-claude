// 特殊能力コンボの動作確認用スクリプト（本番ビルドには含まれない）
// ドロップ抽選のRNGに頼らず、指定した部位構成を直接装備させてBattleEngineに投入することで、
// 「明確に戦い方が変わる」ことを確認する。
// 実行: npx tsx scripts/comboTest.ts
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
    hp: 100000, // 削り切らせず、長時間観測するための高HPダミー
    defense: 8,
    damageReductionPct: 10,
    evasionPct: 0,
    moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 5, tags: [], effects: [], icon: '💢' }],
    description: '',
    icon: '🎯',
    color: '#888',
    // TEST7統合: このダミーは特殊能力コンボの戦闘性能だけを検証する的で、ドロップ・ギミックは
    // 検証対象ではないため、空(=ドロップ不可・ギミックなし)が正しい値。
    bodyPartIds: [],
    rareDropPartIds: [],
    gimmickSummary: '',
    gimmicks: [],
    ...overrides,
  };
}

function buildSetup(defIds: string[], currentHp = 100000, freeCapacityOverride?: number): { setup: PlayerBattleSetup; usedCapacity: number; totalCapacity: number } {
  const equipped = defIds.map((id, i) => ({ instanceId: `t${i}`, def: getPartDef(id) }));
  const capacity = computeCapacity(
    equipped.map((e) => ({ instanceId: e.instanceId, def: e.def })),
    BASE_CAPACITY,
    0
  );
  const setup: PlayerBattleSetup = {
    equipped,
    coreHpBase: CORE_HP_BASE,
    currentHp,
    baseDefense: BASE_DEFENSE,
    freeCapacity: freeCapacityOverride ?? capacity.free,
  };
  return { setup, usedCapacity: capacity.used, totalCapacity: capacity.total };
}

function runFor(engine: BattleEngine, seconds: number) {
  const dt = 0.1;
  let t = 0;
  while (t < seconds && engine.getStatus() === 'ongoing') {
    engine.tick(dt);
    t += dt;
  }
}

function section(title: string) {
  console.log(`\n${'='.repeat(10)} ${title} ${'='.repeat(10)}`);
}

// --- A. 多腕コンボ: 多腕核 + 大量の腕 + 腕シナジー(4/6/10) ---
section('A. 多腕コンボ (多腕核 + 弱い腕x14 + 甲殻x2)');
{
  const withoutCore = ['insect_carapace', 'insect_carapace', ...Array(14).fill('weak_arm')];
  const capNoCore = computeCapacity(
    withoutCore.map((id, i) => ({ instanceId: `n${i}`, def: getPartDef(id) })),
    BASE_CAPACITY,
    0
  );
  console.log(`多腕核なしでこの構成を装備しようとした場合の必要容量: ${capNoCore.used} / 基礎容量 ${BASE_CAPACITY}（装備不可能）`);

  const ids = ['special_multi_arm_core', 'insect_carapace', 'insect_carapace', ...Array(14).fill('weak_arm')];
  const { setup, usedCapacity, totalCapacity } = buildSetup(ids);
  console.log(`多腕核ありでの実消費容量: ${usedCapacity} / ${totalCapacity}（装備可能）`);
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000 }), 9, { verbose: false });
  runFor(engine, 20);
  const snap = engine.getSnapshot();
  const comboLogs = snap.log.filter((l) => l.includes('コンボ発動') || l.includes('追撃'));
  console.log(`20秒間の総与ダメージ: ${snap.player.stats.damageDealt}`);
  console.log(`「コンボ発動/追撃」ログ件数(直近40件中): ${comboLogs.length}`);
  console.log('腕シナジー発動サンプル:', comboLogs.slice(0, 3));
}

// --- B. 毒コンボ: 毒針腕 + 毒腺(オーラ) + 疫病核(毒減衰しない) ---
section('B. 毒コンボ (毒針腕 + 毒腺 + 疫病核 vs 疫病核なし)');
{
  const withPlague = ['insect_poison_needle_arm', 'insect_poison_gland', 'special_plague_core'];
  const withoutPlague = ['insect_poison_needle_arm', 'insect_poison_gland'];

  for (const [label, ids] of [
    ['疫病核あり', withPlague],
    ['疫病核なし', withoutPlague],
  ] as const) {
    const { setup } = buildSetup(ids);
    const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000, defense: 0, damageReductionPct: 0 }), 9, { verbose: false });
    runFor(engine, 30);
    const snap = engine.getSnapshot();
    console.log(`[${label}] 30秒後 敵の毒スタック: ${snap.enemy.poison} / 総与ダメージ: ${snap.player.stats.damageDealt}`);
  }
}

// --- C. 固定ダメージコンボ: 千本骨x2 + 穿孔心臓 (防御無視・戦闘中成長) ---
section('C. 固定ダメージコンボ (千本骨x2 + 穿孔心臓 vs 高防御・高軽減の敵)');
{
  const ids = ['special_thousand_bones', 'special_thousand_bones', 'special_piercing_heart'];
  const { setup } = buildSetup(ids);
  const tankyEnemy = dummyEnemy({ hp: 100000, defense: 500, damageReductionPct: 90 }); // 通常攻撃はほぼ通らない極端な高防御
  const engine = new BattleEngine(setup, tankyEnemy, 9, { verbose: false });
  runFor(engine, 20);
  const snap = engine.getSnapshot();
  const fixedLogs = snap.log.filter((l) => l.includes('固定'));
  console.log(`防御500・軽減90%の敵に対する20秒間の総与ダメージ: ${snap.player.stats.damageDealt}（固定ダメージのみが通っているはず）`);
  console.log('固定ダメージログサンプル(古い順に一部):', fixedLogs.slice(-5).reverse());
}

// --- D. 少数精鋭コンボ: 古代核(容量+3) + 空洞核(未使用容量→最終ダメージ+) + 少数の高性能パーツ ---
section('D. 少数精鋭コンボ (古代核 + 空洞核 + 巨大拳1個のみ vs 空洞核なし)');
{
  for (const [label, ids] of [
    ['空洞核あり', ['golem_ancient_core', 'special_hollow_core', 'golem_giant_fist']],
    ['空洞核なし', ['golem_ancient_core', 'golem_giant_fist']],
  ] as const) {
    const { setup, usedCapacity, totalCapacity } = buildSetup(ids);
    console.log(`[${label}] 消費容量 ${usedCapacity}/${totalCapacity}（未使用容量 ${totalCapacity - usedCapacity}）`);
    const engine = new BattleEngine(setup, dummyEnemy({ hp: 100000, defense: 0, damageReductionPct: 0 }), 9, { verbose: false });
    runFor(engine, 20);
    const snap = engine.getSnapshot();
    console.log(`[${label}] 20秒間の総与ダメージ: ${snap.player.stats.damageDealt}`);
  }
}

console.log('\n全コンボ確認スクリプト完了');
