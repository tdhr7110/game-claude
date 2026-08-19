// ローカル難易度計測・バランス確認機能(TEST12)の自動テスト（本番ビルドには含まれない）。
// レコード組み立て(runMetricsOps.ts)・集計(aggregate.ts)の純粋関数を中心に、
// 保存層(metricsStorage.ts)の読み書き・検証・上限トリムも検証する。
// 実行: npx tsx scripts/balanceMetricsTest.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ============================================================
// 0. localStorageが利用できない環境でも計測が例外を投げない(子プロセスで検証)
// ============================================================
section('0. localStorageが利用できない場合のフォールバック');
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'chimera-metrics-fallback-'));
  const childPath = path.join(tmpDir, 'child.ts');
  const storagePath = path.join(repoRoot, 'src/metrics/metricsStorage.ts').replace(/\\/g, '/');
  writeFileSync(
    childPath,
    `
    // windowを一切定義しない状態(Node標準)で、localStorageが無い環境を模す。
    import { loadMetricsStore, saveMetricsStore, clearAllMetrics, emptyMetricsStore } from '${storagePath}';

    const results: string[] = [];
    try {
      const store = loadMetricsStore();
      results.push(store.runs.length === 0 && store.activeRunId === null ? 'ok:loadMetricsStore-empty' : 'ng:loadMetricsStore-not-empty');
      saveMetricsStore(emptyMetricsStore());
      results.push('ok:saveMetricsStore-no-throw');
      clearAllMetrics();
      results.push('ok:clearAllMetrics-no-throw');
    } catch (e) {
      results.push('ng:threw:' + String(e));
    }
    console.log(results.join('\\n'));
    `,
    'utf-8'
  );
  let output = '';
  let threw = false;
  try {
    output = execFileSync('npx', ['tsx', childPath], { cwd: repoRoot, encoding: 'utf-8' });
  } catch (e) {
    threw = true;
    output = String(e);
  }
  rmSync(tmpDir, { recursive: true, force: true });
  assert(!threw, 'window/localStorageが存在しない環境でも例外でプロセスが落ちない');
  const lines = output.trim().split('\n');
  assert(lines.includes('ok:loadMetricsStore-empty'), 'loadMetricsStore()は空ストアにフォールバックする');
  assert(lines.includes('ok:saveMetricsStore-no-throw'), 'saveMetricsStore()は例外を投げず黙って何もしない');
  assert(lines.includes('ok:clearAllMetrics-no-throw'), 'clearAllMetrics()は例外を投げない');
}

// ============================================================
// 疑似localStorageを用意してから、以降はすべてこのプロセス内で検証する。
// ============================================================
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
(globalThis as unknown as { window: { localStorage: MemoryStorage } }).window = { localStorage: new MemoryStorage() };

function localStorageMock(): MemoryStorage {
  return (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage;
}

const { METRICS_SAVE_KEY, RUN_SAVE_KEY, CODEX_SAVE_KEY, STORAGE_NAMESPACE } = await import('../src/persistence/storageKeys.ts');
const {
  loadMetricsStore,
  saveMetricsStore,
  upsertRun,
  trimRuns,
  clearAllMetrics,
  exportMetricsJson,
  parseImportedRuns,
  mergeImportedRuns,
  emptyMetricsStore,
  MAX_STORED_RUNS,
} = await import('../src/metrics/metricsStorage.ts');
const {
  createEmptyBattleRecord,
  createNewRun,
  upsertBattle,
  recordEnemyCandidates,
  recordEnemyChosen,
  recordBattleStart,
  recordBattleEnd,
  recordPartCandidates,
  recordPartChoice,
  recordFinalBuild,
  completeRun,
  finalizeAsReset,
  finalizeAsAbandoned,
  addSurvey,
  buildActiveSynergyLabels,
} = await import('../src/metrics/runMetricsOps.ts');
const {
  computeBattleStats,
  computeEnemyStats,
  computePartStats,
  computeCommandStats,
  computeSynergyStats,
  computeDeathCauseStats,
  computeBalanceVersionSummaries,
  computeSampleWarnings,
  buildBalanceReport,
  MIN_SAMPLE_SIZE,
} = await import('../src/metrics/aggregate.ts');
type RunMetricsRecord = Awaited<ReturnType<typeof createNewRun>>;

// ============================================================
// 1. 専用ストレージキー(ラン保存・図鑑保存とは別)
// ============================================================
section('1. 専用localStorageキー');
{
  assert(METRICS_SAVE_KEY !== RUN_SAVE_KEY, '計測用キーはラン保存用キーと異なる');
  assert(METRICS_SAVE_KEY !== CODEX_SAVE_KEY, '計測用キーは図鑑保存用キーと異なる');
  assert(METRICS_SAVE_KEY.startsWith(STORAGE_NAMESPACE), '計測用キーも既存の名前空間配下にある');
}

// ============================================================
// 2. runMetricsOps: レコード組み立て(純粋関数・不変性)
// ============================================================
section('2. runMetricsOps: レコード組み立て');
{
  const run0 = createNewRun('run_test_1', 1000, 'gameV1', 'balanceV1');
  assert(run0.status === 'in_progress', '新規ランはin_progressで始まる');
  assert(run0.battles.length === 0, '新規ランは戦闘記録が空');

  const withCandidates = recordEnemyCandidates(run0, 2000, 1, 'normal', ['enemy_a', 'enemy_b', 'enemy_c']);
  assert(run0.battles.length === 0, '元のrunオブジェクトは変更されない(不変性)');
  assert(withCandidates.battles.length === 1, '敵候補記録で戦闘レコードが1件作られる');
  assert(withCandidates.battles[0].enemyCandidateIds.length === 3, '敵候補3体が記録される');
  assert(withCandidates.battles[0].outcome === 'abandoned', '初期状態のoutcomeはabandoned(未決着)扱い');
  assert(withCandidates.battleReached === 1, 'battleReachedが更新される');

  const withChosen = recordEnemyChosen(withCandidates, 2100, 1, 'normal', 'enemy_b');
  assert(withChosen.battles[0].chosenEnemyId === 'enemy_b', '選択した敵が記録される');

  const withStart = recordBattleStart(withChosen, 2200, 1, 'normal', ['cmd_strike', null, 'cmd_guard', null]);
  assert(withStart.battles[0].equippedCommandIds.length === 4, '装備コマンドが4枠ぶん記録される');

  const withEnd = recordBattleEnd(withStart, 3000, 1, 'normal', {
    outcome: 'win',
    battleTimeSeconds: 12.5,
    playerHpRemaining: 80,
    playerMaxHp: 120,
    deathCause: null,
    damage: { auto: 100, command: 50, status: 10 },
    healed: 20,
    commandUsage: { cmd_strike: { count: 2, damage: 50, heal: 0 } },
  });
  assert(withEnd.battles[0].outcome === 'win', '勝利が記録される');
  assert(withEnd.clearedBattles === 1, 'clearedBattlesが加算される');
  assert(withEnd.battles[0].damage.auto === 100, 'ダメージ内訳が記録される');

  const lost = recordBattleEnd(withStart, 3000, 1, 'normal', {
    outcome: 'lose',
    battleTimeSeconds: 8,
    playerHpRemaining: 0,
    playerMaxHp: 120,
    deathCause: '敵の爪撃',
    damage: { auto: 30, command: 0, status: 0 },
    healed: 0,
    commandUsage: {},
  });
  assert(lost.battles[0].deathCause === '敵の爪撃', '敗北時は死亡原因が記録される');
  assert(lost.clearedBattles === 0, '敗北時はclearedBattlesが増えない');

  const withPartCandidates = recordPartCandidates(withEnd, 3100, 1, 'normal', ['part_a', 'part_b', 'part_c']);
  assert(withPartCandidates.battles[0].partCandidateIds?.length === 3, '部位ドロップ候補が記録される');

  const equipped = recordPartChoice(withPartCandidates, 3200, 1, 'normal', 'equip', 'part_a');
  assert(equipped.battles[0].partChoice?.action === 'equip', '部位選択(装着)が記録される');
  const skipped = recordPartChoice(withPartCandidates, 3200, 1, 'normal', 'skip', null);
  assert(skipped.battles[0].partChoice?.action === 'skip' && skipped.battles[0].partChoice.defId === null, '部位スキップも記録できる');

  const withBuild = recordFinalBuild(equipped, 4000, { equippedPartIds: ['part_a', 'part_x'], activeSynergies: ['partType:arm:6'] });
  assert(withBuild.finalBuild?.equippedPartIds.length === 2, '最終ビルドの装着部位が記録される');

  const completed = completeRun(withBuild, 5000, 'victory', 1);
  assert(completed.status === 'completed' && completed.endReason === 'victory', 'ラン完了(勝利)が記録される');
  assert(completed.endedAt === 5000, '終了時刻が記録される');

  const reset = finalizeAsReset(createNewRun('run_test_2', 1000, 'g', 'b'), 1500);
  assert(reset.endReason === 'reset' && reset.resetCount === 1, 'リセット終了はresetCount=1になる');
  assert(completed.resetCount === 0, '通常完了はresetCount=0のまま');

  const abandoned = finalizeAsAbandoned(createNewRun('run_test_3', 1000, 'g', 'b'), 1500);
  assert(abandoned.endReason === 'abandoned', '中断終了(前回セッションの残骸)が記録される');

  const withSurvey = addSurvey(completed, { fun: 5, confusingPoint: '部位効果', wantsReplay: 'yes', answeredAt: 6000 });
  assert(withSurvey.survey?.fun === 5, 'アンケート回答が記録される');
}

// ============================================================
// 3. runMetricsOps: upsertBattle・buildActiveSynergyLabels
// ============================================================
section('3. runMetricsOps: 補助関数');
{
  const empty = createEmptyBattleRecord(3, 'elite');
  assert(empty.battleIndex === 3 && empty.slotType === 'elite', '空の戦闘レコードは指定した番号・種別で作られる');

  let battles = upsertBattle([], 1, 'normal', (b) => ({ ...b, chosenEnemyId: 'e1' }));
  battles = upsertBattle(battles, 1, 'normal', (b) => ({ ...b, chosenEnemyId: 'e2' }));
  assert(battles.length === 1, '同じbattleIndexへの2回目のupsertBattleは新規追加せず上書きする');
  assert(battles[0].chosenEnemyId === 'e2', '上書き後の値が反映される');

  const synergies = {
    partType: {
      arm: { count: 6, activeTiers: [{ count: 3, description: '', effect: { kind: 'attack_speed_all', pct: 5 } }, { count: 6, description: '', effect: { kind: 'attack_speed_all', pct: 10 } }], nextTier: null },
      head: { count: 0, activeTiers: [], nextTier: null },
      heart: { count: 0, activeTiers: [], nextTier: null },
      leg: { count: 0, activeTiers: [], nextTier: null },
      skin: { count: 0, activeTiers: [], nextTier: null },
    },
    species: {
      insect: { count: 4, activeTiers: [{ count: 4, description: '', effect: { kind: 'status_amount_bonus', amount: 1 } }], nextTier: null },
      golem: { count: 0, activeTiers: [], nextTier: null },
      dragon: { count: 0, activeTiers: [], nextTier: null },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const labels = buildActiveSynergyLabels(synergies);
  assert(labels.includes('partType:arm:6'), '腕シナジーは最も高い達成ティア(6)だけをラベル化する');
  assert(!labels.includes('partType:arm:3'), '達成済みの下位ティア(3)は重複して含めない');
  assert(labels.includes('species:insect:4'), '種族シナジーもラベル化される');
  assert(labels.length === 2, '有効なシナジーの数だけラベルが作られる');
}

// ============================================================
// 4. aggregate: 集計(架空のRunMetricsRecordを組み立てて検証)
// ============================================================
section('4. aggregate: 集計ロジック');
{
  function makeRun(overrides: Partial<RunMetricsRecord>): RunMetricsRecord {
    const base = createNewRun(overrides.runId ?? 'r', 0, 'gv1', overrides.balanceVersion ?? 'bv1');
    return { ...base, ...overrides };
  }

  const runA = makeRun({
    runId: 'A',
    status: 'completed',
    endReason: 'victory',
    battleReached: 2,
    battles: [
      {
        battleIndex: 1,
        slotType: 'normal',
        enemyCandidateIds: ['e1', 'e2', 'e3'],
        chosenEnemyId: 'e1',
        outcome: 'win',
        battleTimeSeconds: 10,
        playerHpRemaining: 90,
        playerMaxHp: 100,
        deathCause: null,
        damage: { auto: 100, command: 0, status: 0 },
        healed: 0,
        commandUsage: { cmd_strike: { count: 3, damage: 100, heal: 0 } },
        equippedCommandIds: ['cmd_strike', null, null, null],
        partCandidateIds: ['p1', 'p2', 'p3'],
        partChoice: { action: 'equip', defId: 'p1' },
      },
      {
        battleIndex: 2,
        slotType: 'normal',
        enemyCandidateIds: ['e1', 'e2'],
        chosenEnemyId: 'e2',
        outcome: 'lose',
        battleTimeSeconds: 20,
        playerHpRemaining: 0,
        playerMaxHp: 100,
        deathCause: '毒',
        damage: { auto: 50, command: 0, status: 0 },
        healed: 0,
        commandUsage: {},
        equippedCommandIds: ['cmd_strike', null, null, null],
        partCandidateIds: null,
        partChoice: null,
      },
    ],
    finalBuild: { equippedPartIds: ['p1'], activeSynergies: ['partType:arm:6'] },
  });

  const runB = makeRun({
    runId: 'B',
    status: 'completed',
    endReason: 'defeat',
    battleReached: 1,
    battles: [
      {
        battleIndex: 1,
        slotType: 'normal',
        enemyCandidateIds: ['e1', 'e2', 'e3'],
        chosenEnemyId: 'e1',
        outcome: 'lose',
        battleTimeSeconds: 5,
        playerHpRemaining: 0,
        playerMaxHp: 100,
        deathCause: '毒',
        damage: { auto: 20, command: 0, status: 0 },
        healed: 0,
        commandUsage: { cmd_strike: { count: 1, damage: 20, heal: 0 } },
        equippedCommandIds: ['cmd_strike', null, null, null],
        partCandidateIds: null,
        partChoice: null,
      },
    ],
    finalBuild: { equippedPartIds: ['p1'], activeSynergies: [] },
  });

  const runC = makeRun({
    runId: 'C',
    status: 'in_progress',
    battleReached: 1,
    battles: [
      {
        ...createEmptyBattleRecord(1, 'normal'),
        enemyCandidateIds: ['e1', 'e2', 'e3'],
      },
    ],
  });

  const runD = makeRun({ runId: 'D', status: 'completed', endReason: 'reset', battleReached: 1, balanceVersion: 'bv2' });

  const runs = [runA, runB, runC, runD];

  const battleStats = computeBattleStats(runs);
  const battle1 = battleStats.find((s) => s.battleIndex === 1)!;
  assert(battle1.challengeCount === 3, '第1戦の挑戦数(勝敗決着2件+未決着1件)が正しい');
  assert(battle1.winCount === 1 && battle1.loseCount === 1, '第1戦の勝敗数(runA勝利+runB敗北)が正しい');
  assert(Math.abs((battle1.dropoffRate ?? -1) - 1 / 3) < 1e-9, '第1戦の離脱率(1/3)が正しい');
  const battle2 = battleStats.find((s) => s.battleIndex === 2)!;
  assert(battle2.challengeCount === 1 && battle2.loseCount === 1, '第2戦の挑戦数・敗北数が正しい');

  const enemyStats = computeEnemyStats(runs);
  const e1 = enemyStats.find((s) => s.enemyId === 'e1')!;
  assert(e1.candidateCount === 4, 'e1の候補提示数(A第1戦・A第2戦・B・Cの4戦闘分)が正しい');
  assert(e1.chosenCount === 2, 'e1の選択回数が正しい');
  assert(e1.wins === 1 && e1.losses === 1, 'e1の勝敗数(runA第1戦で勝利・runB第1戦で敗北)が正しい');
  const e2 = enemyStats.find((s) => s.enemyId === 'e2')!;
  assert(e2.wins === 0 && e2.losses === 1 && e2.chosenCount === 1, 'e2の勝敗数・選択回数が正しい');

  const partStats = computePartStats(runs);
  const p1 = partStats.find((s) => s.partId === 'p1')!;
  assert(p1.candidateCount === 1, 'p1の候補出現数(runA第1戦の候補配列に1回だけ登場)が正しい');
  assert(p1.chosenCount === 1 && p1.equippedCount === 1, 'p1の選択・装着回数が正しい');
  assert(p1.finalBuildCount === 2, 'p1は2ラン(A・B)の最終ビルドに含まれる');
  assert(p1.finalBuildWinCount === 1, 'p1の最終ビルド勝利数(Aのみ勝利)が正しい');
  assert(Math.abs((p1.finalBuildWinRate ?? -1) - 0.5) < 1e-9, 'p1の最終ビルド勝率(1/2)が正しい');

  const commandStats = computeCommandStats(runs);
  const cmdStrike = commandStats.find((s) => s.commandId === 'cmd_strike')!;
  assert(cmdStrike.battlesEquipped === 3, 'cmd_strikeの装備戦闘数(3戦)が正しい');
  assert(cmdStrike.battlesUsed === 2, 'cmd_strikeは装備した3戦闘のうち使用実績のある2戦闘だけがbattlesUsedに入る(runA第2戦は装備のみで未使用)');
  assert(cmdStrike.totalUses === 4, 'cmd_strikeの総使用回数(3+1)が正しい');
  assert(cmdStrike.totalDamage === 120, 'cmd_strikeの総ダメージ(100+20)が正しい');
  assert(Math.abs((cmdStrike.avgDamagePerUse ?? -1) - 30) < 1e-9, 'cmd_strikeの平均ダメージ(120/4=30)が正しい');

  const synergyStats = computeSynergyStats(runs);
  const armSynergy = synergyStats.find((s) => s.label === 'partType:arm:6')!;
  assert(armSynergy.adoptionCount === 1, '腕シナジーの採用ラン数(A)が正しい(進行中のCは除外)');
  assert(armSynergy.winCount === 1, '腕シナジーの勝利数が正しい');

  const deathCauseStats = computeDeathCauseStats(runs);
  const poisonCause = deathCauseStats.find((s) => s.cause === '毒')!;
  assert(poisonCause.count === 2, '死亡原因「毒」の件数(runA第2戦+runB)が正しい');
  assert(Math.abs((poisonCause.share ?? -1) - 1) < 1e-9, '死因が毒のみのため割合は100%');

  const versionSummaries = computeBalanceVersionSummaries(runs);
  const bv1 = versionSummaries.find((s) => s.balanceVersion === 'bv1')!;
  assert(bv1.runCount === 3, 'bv1のラン数(A,B,C)が正しい');
  assert(bv1.completedRunCount === 2, 'bv1の完了ラン数(A,B)が正しい(進行中のCは除外)');
  assert(bv1.victoryCount === 1 && bv1.defeatCount === 1, 'bv1の勝敗数が正しい');
  const bv2 = versionSummaries.find((s) => s.balanceVersion === 'bv2')!;
  assert(bv2.resetCount === 1, 'bv2のリセット数が正しい');

  const warnings = computeSampleWarnings({ battleStats, enemyStats, partStats, commandStats, synergyStats }, MIN_SAMPLE_SIZE);
  assert(warnings.some((w) => w.category === 'synergy' && w.key === 'partType:arm:6'), 'サンプル数の少ないシナジーが警告に含まれる(n=1 < 5)');
  assert(warnings.every((w) => w.sampleSize < MIN_SAMPLE_SIZE), '警告はすべて閾値未満のサンプルのみ');

  const report = buildBalanceReport(runs);
  assert(report.totalRuns === 4 && report.completedRuns === 3, 'buildBalanceReportの総数・完了数が正しい');
}

// ============================================================
// 5. metricsStorage: 保存・読み込み・検証・上限トリム
// ============================================================
section('5. metricsStorage: 保存・読み込み・検証・上限トリム');
{
  localStorageMock().removeItem(METRICS_SAVE_KEY);
  assert(loadMetricsStore().runs.length === 0, '未保存時は空ストアを返す');

  localStorageMock().setItem(METRICS_SAVE_KEY, '{not valid json');
  assert(loadMetricsStore().runs.length === 0, '壊れたJSONは空ストアにフォールバックする(クラッシュしない)');

  localStorageMock().setItem(METRICS_SAVE_KEY, JSON.stringify({ schemaVersion: 999, runs: [] }));
  assert(loadMetricsStore().runs.length === 0, 'schemaVersion不一致は空ストアにフォールバックする');

  localStorageMock().removeItem(METRICS_SAVE_KEY);
  const run1 = completeRun(recordFinalBuild(createNewRun('s1', 100, 'g', 'b'), 200, { equippedPartIds: [], activeSynergies: [] }), 300, 'victory', 1);
  let store = upsertRun(loadMetricsStore(), run1);
  saveMetricsStore(store);
  const reloaded = loadMetricsStore();
  assert(reloaded.runs.length === 1 && reloaded.runs[0].runId === 's1', '保存したランが正しく読み込める(往復)');

  const run1Updated = { ...run1, battleReached: 5 };
  store = upsertRun(reloaded, run1Updated);
  assert(store.runs.length === 1, '同じrunIdのupsertRunは追加ではなく置き換え');
  assert(store.runs[0].battleReached === 5, '置き換え後の値が反映される');

  const many = Array.from({ length: MAX_STORED_RUNS + 20 }, (_, i) => createNewRun(`bulk_${i}`, i, 'g', 'b'));
  const trimmed = trimRuns(many);
  assert(trimmed.length === MAX_STORED_RUNS, `保存件数はMAX_STORED_RUNS(${MAX_STORED_RUNS})件を超えない`);
  assert(trimmed.every((r) => Number(r.runId.split('_')[1]) >= 20), '超過分は開始日時(startedAt)が古いランから削除される');

  clearAllMetrics();
  assert(loadMetricsStore().runs.length === 0, '全データ削除後は空ストアになる');

  saveMetricsStore(upsertRun(emptyMetricsStore(), run1));
  const exported = exportMetricsJson(loadMetricsStore(), 'gv-export', 'bv-export');
  const parsed = JSON.parse(exported);
  assert(parsed.gameVersion === 'gv-export' && parsed.balanceVersion === 'bv-export', 'エクスポートJSONに現在のバージョン情報が入る');
  assert(Array.isArray(parsed.runs) && parsed.runs.length === 1, 'エクスポートJSONにランが含まれる');

  const importResult = parseImportedRuns(exported);
  assert(importResult.ok, 'エクスポートしたJSONは再インポート可能な形式である');
  assert(importResult.ok && importResult.runs.length === 1, 'インポート結果のラン件数が正しい');

  const badImport = parseImportedRuns('{"runs": "not-an-array"}');
  assert(!badImport.ok, '不正な形式のインポートはエラーになる');

  clearAllMetrics();
  const merged = mergeImportedRuns(loadMetricsStore(), importResult.ok ? importResult.runs : []);
  saveMetricsStore(merged);
  assert(loadMetricsStore().runs.length === 1, 'インポートしたランがマージ保存される');
  const mergedAgain = mergeImportedRuns(loadMetricsStore(), importResult.ok ? importResult.runs : []);
  assert(mergedAgain.runs.length === 1, '同じrunIdを再インポートしても重複追加されない(上書き)');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
process.exit(failCount > 0 ? 1 : 0);
