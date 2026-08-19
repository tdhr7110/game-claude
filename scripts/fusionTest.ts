// 部位融合システム(TEST16)の自動テスト（本番ビルドには含まれない）。
// engine/fusion.ts・engine/run.tsの融合フロー、BattleEngineのfusion_burst_on_hit処理、
// および融合がセーブ・図鑑・計測・自由合体レイヤー表示を壊さないことを検証する。
// 実行: npx tsx scripts/fusionTest.ts
import { BattleEngine, type PlayerBattleSetup } from '../src/engine/battle';
import { getPartDef } from '../src/data/parts';
import { FUSION_RECIPES, FUSION_RECIPES_BY_ID, FUSION_RESULT_DEFS } from '../src/data/fusion';
import { findFusionCandidates, isFusionEligibleTier } from '../src/engine/fusion';
import {
  createInitialRunState,
  finishBattle,
  performFusion,
  resolveFusionStep,
  debugForceFusionPhase,
  fusionEligiblePairs,
  equipPart,
  debugGrantPart,
  CORE_HP_BASE,
  BASE_DEFENSE,
  BASE_CAPACITY,
  type RunState,
} from '../src/engine/run';
import { computeCapacity } from '../src/engine/capacity';
import { groupPartTypeCounts } from '../src/ui/freeLayer/freeLayerFromParts';
import { markPartsDiscovered, createEmptyCodex } from '../src/engine/codex';
import type { EnemyDef, PartInstance } from '../src/data/types';

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
    tier: 'boss',
    hp: 100000,
    defense: 8,
    damageReductionPct: 10,
    evasionPct: 0,
    moves: [{ id: 'dummy_hit', name: '弱い反撃', attack: 1, interval: 5, tags: [], effects: [], icon: '💢' }],
    description: '',
    icon: '🎯',
    color: '#888',
    bodyPartIds: [],
    rareDropPartIds: [],
    gimmickSummary: '',
    gimmicks: [],
    ...overrides,
  };
}

// 融合に使う代表レシピ: 竜爪 + 竜尾 → 双牙の断裂爪(fusion_burst_on_hit持ち)
const RECIPE = FUSION_RECIPES_BY_ID['fusion_attack_twinfang'];
if (!RECIPE) throw new Error('前提となるレシピ fusion_attack_twinfang が見つかりません');
const [SRC_A, SRC_B] = RECIPE.sourceDefIds;
const RESULT_ID = RECIPE.resultDefId;

function stateWithMaterials(overrides: Partial<RunState> = {}): RunState {
  let state = createInitialRunState();
  state = debugGrantPart(state, SRC_A);
  state = debugGrantPart(state, SRC_B);
  return { ...state, ...overrides };
}

// getSnapshot().logは直近の一部(最新40件)しか保持しないリングバッファのため、
// 長時間の戦闘を一度に回してから最後にlogを読むと、序盤に発生したイベントが
// 後続の大量のログに押し出されて消えてしまう(=ゲームバグではなく観測側の問題)。
// そのため一定間隔ごとにポーリングし、ログ先頭の連番("#123 ...")で重複排除しながら
// 該当メッセージを漏れなく積算する。
function collectMatchingLogsOverTime(engine: BattleEngine, totalSeconds: number, pollEverySeconds: number, matcher: (line: string) => boolean): string[] {
  const seenSeq = new Set<number>();
  const collected: string[] = [];
  const dt = 0.1;
  let t = 0;
  let elapsedSincePoll = 0;

  function poll() {
    for (const line of engine.getSnapshot().log) {
      const m = line.match(/^#(\d+)\s/);
      if (!m) continue;
      const seq = Number(m[1]);
      if (seenSeq.has(seq)) continue;
      seenSeq.add(seq);
      if (matcher(line)) collected.push(line);
    }
  }

  while (t < totalSeconds && engine.getStatus() === 'ongoing') {
    engine.tick(dt);
    t += dt;
    elapsedSincePoll += dt;
    if (elapsedSincePoll >= pollEverySeconds) {
      poll();
      elapsedSincePoll = 0;
    }
  }
  poll();
  return collected;
}

// ============================================================
// 1. データ整合性: 融合済み部位は再融合の材料にできない(構造的保証)
// ============================================================
section('1. 融合済み部位は再融合の材料にできない');
{
  for (const [id, def] of Object.entries(FUSION_RESULT_DEFS)) {
    assert(def.isFused === true, `融合結果 ${id} はisFused=trueとして生成される`);
  }
  const fusedIds = new Set(Object.keys(FUSION_RESULT_DEFS));
  const anyRecipeSourcesFusedPart = FUSION_RECIPES.some((r) => r.sourceDefIds.some((id) => fusedIds.has(id)));
  assert(!anyRecipeSourcesFusedPart, 'どのレシピのsourceDefIdsも融合結果部位を参照していない(無限連鎖の禁止)');

  // 融合結果インスタンスを材料プールに入れても、それ単体では何とも候補化されない
  // (isFusedな部位はcanBeFusionMaterialで除外され、そもそもどのレシピのsourceDefIdsとも一致しない)。
  const fusedInstance: PartInstance = { instanceId: 'fused_1', defId: RESULT_ID };
  const candidatesFromFusedAlone = findFusionCandidates([], [fusedInstance]);
  assert(candidatesFromFusedAlone.length === 0, '融合済み部位だけのプールからは融合候補が生成されない');

  // 対照実験: 同じ関数で正規の2部位を渡せば候補が出る(検出ロジック自体は機能していることの確認)。
  const freshA: PartInstance = { instanceId: 'a', defId: SRC_A };
  const freshB: PartInstance = { instanceId: 'b', defId: SRC_B };
  const positiveControl = findFusionCandidates([], [freshA, freshB]);
  assert(positiveControl.some((c) => c.recipe.id === RECIPE.id), '(対照)正規の2部位を渡せば候補が検出される');
}

// ============================================================
// 2. 正しい2部位で融合できる(候補として検出される)
// ============================================================
section('2. 正しい2部位が揃っていれば融合候補として検出される');
{
  const state = stateWithMaterials();
  const candidates = fusionEligiblePairs(state);
  assert(
    candidates.some((c) => c.recipe.id === RECIPE.id),
    '材料2部位(竜爪+竜尾)を持っていると双牙の断裂爪レシピが候補に出る'
  );
}

// ============================================================
// 3. 融合実行: 材料2個が消える・結果1個が生成される
// ============================================================
section('3. 融合実行で材料2個が消え、結果1個が生成される');
{
  const state = stateWithMaterials();
  const beforeInventoryCount = state.inventory.length;
  const result = performFusion(state, RECIPE.id);
  assert(result.ok === true, '材料が揃っていれば融合は成功する');
  assert(result.resultDefId === RESULT_ID, '融合結果のdefIdが正しい(双牙の断裂爪)');

  const after = result.state;
  const stillHasSrcA = after.inventory.some((i) => i.defId === SRC_A) || after.equipped.some((i) => i.defId === SRC_A);
  const stillHasSrcB = after.inventory.some((i) => i.defId === SRC_B) || after.equipped.some((i) => i.defId === SRC_B);
  assert(!stillHasSrcA && !stillHasSrcB, '材料2部位(竜爪・竜尾)がインベントリ/装着のどちらからも消えている');
  assert(after.inventory.length === beforeInventoryCount - 2 + 1, 'インベントリ総数が「-2素材+1結果」で正しく変化する');
  const resultInstances = after.inventory.filter((i) => i.defId === RESULT_ID);
  assert(resultInstances.length === 1, '融合結果の部位インスタンスがちょうど1個生成される');
}

// ============================================================
// 4. 素材不足では融合できない
// ============================================================
section('4. 素材不足では融合できない');
{
  let state = createInitialRunState();
  state = debugGrantPart(state, SRC_A); // 片方だけ付与
  const result = performFusion(state, RECIPE.id);
  assert(result.ok === false, '材料が1個しか無い場合は融合が失敗する');
  assert(state.inventory.length === result.state.inventory.length, '失敗時はインベントリが変化しない(状態が変わらず返る)');

  const noMaterialState = createInitialRunState();
  const result2 = performFusion(noMaterialState, RECIPE.id);
  assert(result2.ok === false, '材料が全く無い場合も融合が失敗する');

  const result3 = performFusion(noMaterialState, 'unknown_recipe_id');
  assert(result3.ok === false, '存在しないレシピIDを指定した場合も失敗する(reason付き)');
  assert(!!result3.reason, '失敗時はreasonが返る');
}

// ============================================================
// 5. 1ボス撃破につき融合は最大1回
// ============================================================
section('5. 1ボス撃破につき融合は最大1回');
{
  // 双牙の断裂爪の材料をもう1セット追加で持たせ、「2回目の融合ができてしまわないか」を検証する。
  let state = stateWithMaterials();
  state = debugGrantPart(state, SRC_A);
  state = debugGrantPart(state, SRC_B);
  state = { ...state, phase: 'fusion', fusionOfferUsed: false };

  const first = performFusion(state, RECIPE.id);
  assert(first.ok === true, '1回目の融合(材料が2セットある状態)は成功する');
  assert(first.state.fusionOfferUsed === true, '1回目の融合成功後はfusionOfferUsedがtrueになる');

  // 2セット目の材料がまだ残っているにもかかわらず、同じオファー内での2回目は拒否されるべき。
  const stillHasMaterials = fusionEligiblePairs(first.state).some((c) => c.recipe.id === RECIPE.id);
  assert(stillHasMaterials, '前提: 2セット目の材料がまだ残っている(拒否理由が「材料不足」ではないことを保証するため)');

  const second = performFusion(first.state, RECIPE.id);
  assert(second.ok === false, '同じボス撃破オファー内での2回目の融合は、材料が残っていても拒否される');
  assert(second.state.inventory.length === first.state.inventory.length, '2回目が拒否された場合、インベントリは変化しない');

  // オファーを解決(resolveFusionStep)すると、次のオファーに備えてフラグがリセットされる。
  const resolved = resolveFusionStep(first.state);
  assert(resolved.fusionOfferUsed === false, 'resolveFusionStep後はfusionOfferUsedがfalseにリセットされる(次のボス撃破に備える)');

  // debugForceFusionPhaseでも同様にリセットされる。
  const forced = debugForceFusionPhase({ ...first.state, phase: 'drop' });
  assert(forced.fusionOfferUsed === false, 'debugForceFusionPhaseで融合オファーへ入るときもfusionOfferUsedはfalseから始まる');
}

// ============================================================
// 6. 融合をスキップできる / 7. 融合後も通常報酬へ進める
// ============================================================
section('6-7. 融合のスキップ、および融合後の通常報酬遷移');
{
  // ラン中盤(battleIndex=1)でボスを撃破し、融合オファーが出ることを確認する。
  let state = stateWithMaterials({ battleIndex: 1, currentEnemy: dummyEnemy({ tier: 'boss' }) });
  const afterWin = finishBattle(state, 'won', state.coreHp);
  assert(afterWin.phase === 'fusion', 'ボス撃破後、融合可能な部位があれば融合オファー画面(phase=fusion)へ遷移する');
  assert(afterWin.fusionOfferUsed === false, '融合オファー開始時点ではfusionOfferUsedはfalse');

  // スキップ: 何も融合せずにresolveFusionStepを呼ぶ。
  const skipped = resolveFusionStep(afterWin);
  assert(skipped.phase === 'drop', '融合をスキップすると通常のドロップ画面(phase=drop)へ進める');
  assert(skipped.inventory.length === afterWin.inventory.length, 'スキップ時は部位の増減が起きない');

  // 融合してから進む場合。
  const fused = performFusion(afterWin, RECIPE.id);
  assert(fused.ok === true, '融合オファー画面で融合を確定できる');
  const proceeded = resolveFusionStep(fused.state);
  assert(proceeded.phase === 'drop', '融合を確定した後も通常のドロップ画面へ進める');
  assert(
    proceeded.inventory.some((i) => i.defId === RESULT_ID),
    '融合後に通常報酬へ進んでも、生成された融合部位はインベントリに残っている'
  );
}

// ============================================================
// 8. ボス撃破時のみ融合オファーが出る(通常戦・強敵戦では出ない)
// ============================================================
section('8. ボス撃破時のみ融合オファーが出る');
{
  assert(isFusionEligibleTier('boss') === true, 'bossはisFusionEligibleTier=trueを持つ');
  assert(isFusionEligibleTier('miniboss') === true, 'minibossはisFusionEligibleTier=trueを持つ');
  assert(isFusionEligibleTier('normal') === false, 'normalはisFusionEligibleTier=falseを持つ');
  assert(isFusionEligibleTier('elite') === false, 'eliteはisFusionEligibleTier=falseを持つ');

  const normalState = stateWithMaterials({ battleIndex: 1, currentEnemy: dummyEnemy({ tier: 'normal' }) });
  const afterNormalWin = finishBattle(normalState, 'won', normalState.coreHp);
  assert(afterNormalWin.phase !== 'fusion', '通常戦を撃破しても融合オファーは出ない(材料が揃っていても)');
  assert(afterNormalWin.phase === 'drop', '通常戦撃破後はそのままdropフェーズへ進む');

  const noMaterialBoss = { ...createInitialRunState(), battleIndex: 1, currentEnemy: dummyEnemy({ tier: 'boss' }) };
  const afterBossWinNoMaterial = finishBattle(noMaterialBoss, 'won', noMaterialBoss.coreHp);
  assert(afterBossWinNoMaterial.phase !== 'fusion', '融合可能な材料が無ければ、ボス撃破でも融合オファーは出ない');
}

// ============================================================
// 9. 融合部位を装着できる
// ============================================================
section('9. 融合部位を装着できる');
{
  const state = stateWithMaterials();
  const fused = performFusion(state, RECIPE.id);
  const resultInstance = fused.state.inventory.find((i) => i.defId === RESULT_ID);
  assert(!!resultInstance, '前提: 融合結果のインスタンスがインベントリに存在する');
  if (resultInstance) {
    const capBefore = computeCapacity(
      fused.state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) })),
      BASE_CAPACITY,
      fused.state.permanentCapacityBonus
    );
    const equipResult = equipPart(fused.state, resultInstance.instanceId);
    assert(equipResult.ok === true || capBefore.free < getPartDef(RESULT_ID).cost, '融合部位は通常の部位と同じ装着APIで装着できる(容量が足りていれば成功する)');
    if (equipResult.ok) {
      assert(
        equipResult.state.equipped.some((i) => i.instanceId === resultInstance.instanceId),
        '装着後、equippedリストに融合部位のインスタンスが含まれる'
      );
    }
  }
}

// ============================================================
// 10. 戦闘: 融合部位が能力を発動する(fusion_burst_on_hit) / 11. 発動回数が上限を超えない
// ============================================================
section('10-11. fusion_burst_on_hitの発動と、1戦闘あたりの上限');
{
  const maxActivations = RECIPE.exclusiveEffect.kind === 'fusion_burst_on_hit' ? RECIPE.exclusiveEffect.maxActivationsPerBattle : -1;
  assert(maxActivations > 0, '前提: fusion_attack_twinfangのexclusiveEffectはfusion_burst_on_hitでmaxActivationsPerBattle>0を持つ');

  const setup: PlayerBattleSetup = {
    equipped: [{ instanceId: 'fused_1', def: getPartDef(RESULT_ID) }],
    coreHpBase: CORE_HP_BASE,
    currentHp: CORE_HP_BASE,
    baseDefense: BASE_DEFENSE,
    freeCapacity: 0,
  };
  // 攻撃回数を十分に稼ぐため低防御・低軽減の的を長時間殴らせる(発動確率25%を十分な試行回数で飽和させる)。
  const engine = new BattleEngine(setup, dummyEnemy({ hp: 10_000_000, defense: 0, damageReductionPct: 0 }), 1, { verbose: false });
  const burstLogs = collectMatchingLogsOverTime(engine, 200, 2, (l) => l.includes('融合の追撃'));
  assert(burstLogs.length > 0, '十分な攻撃回数の中でfusion_burst_on_hitが少なくとも1回は発動する');
  assert(
    burstLogs.length <= maxActivations,
    `fusion_burst_on_hitの発動回数(${burstLogs.length}回)が1戦闘あたりの上限(${maxActivations}回)を超えない`
  );
}

// ============================================================
// 12. fusion_burst_on_hitのダメージは防御・軽減計算を通る(「通常の追加攻撃」としての扱い)
// ============================================================
section('12. fusion_burst_on_hitは防御・ダメージ軽減を無視しない');
{
  assert(
    !RECIPE.exclusiveDescription.includes('固定') && !RECIPE.exclusiveDescription.includes('防御無視'),
    '前提: 双牙の断裂爪のUI説明は「固定ダメージ」「防御無視」を謳っていない(通常の追加攻撃として説明されている)'
  );

  const setup: PlayerBattleSetup = {
    equipped: [{ instanceId: 'fused_1', def: getPartDef(RESULT_ID) }],
    coreHpBase: CORE_HP_BASE,
    currentHp: CORE_HP_BASE,
    baseDefense: BASE_DEFENSE,
    freeCapacity: 0,
  };
  // 通常攻撃(基礎攻撃力8)ですらMath.max(1,...)まで削られる極端な高防御・高軽減の的。
  // fusion_burst_on_hitの追加ダメージ(基礎攻撃力の60%≈5)も同様に防御を通していれば
  // 同じく1まで削られるはずで、防御無視のまま(約5)なら不一致で検出できる。
  const tankyEnemy = dummyEnemy({ hp: 10_000_000, defense: 500, damageReductionPct: 90 });
  const engine = new BattleEngine(setup, tankyEnemy, 1, { verbose: false });
  const burstLogs = collectMatchingLogsOverTime(engine, 200, 2, (l) => l.includes('融合の追撃'));
  assert(burstLogs.length > 0, '前提: 高防御の的に対してもfusion_burst_on_hitが発動している(検証対象のログが存在する)');
  const damages = burstLogs.map((l) => {
    const m = l.match(/\+(\d+)ダメージ/);
    return m ? Number(m[1]) : NaN;
  });
  assert(
    damages.every((d) => Number.isFinite(d)),
    '融合の追撃ログからダメージ数値を正しく抽出できる'
  );
  assert(
    damages.every((d) => d <= 1),
    `高防御(防御500/軽減90%)の的に対するfusion_burst_on_hitのダメージが通常攻撃と同じく防御で1まで軽減される(実測: ${JSON.stringify(damages)})`
  );
}

// ============================================================
// 13. セーブ/再開が融合フェーズ・融合部位を壊さない
// ============================================================
section('13. セーブ/再開(runPersistence)が融合フェーズ・融合部位を壊さない');
{
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

  const { saveRunState, loadRunState, clearRunSave } = await import('../src/persistence/runPersistence.ts');

  clearRunSave();
  const state = stateWithMaterials({ battleIndex: 1, currentEnemy: dummyEnemy({ tier: 'boss' }) });
  const afterWin = finishBattle(state, 'won', state.coreHp);
  const fused = performFusion(afterWin, RECIPE.id);
  assert(fused.ok === true, '前提: 融合が成功している');

  saveRunState(fused.state);
  const loaded = loadRunState();
  assert(loaded !== null, '融合オファー中(phase=fusion)のRunStateを保存・復元できる');
  assert(loaded?.phase === 'fusion', '復元後もphase=fusionが保たれる');
  assert(loaded?.fusionOfferUsed === true, '復元後もfusionOfferUsedの値(true)が保たれる');
  assert(
    (loaded?.inventory ?? []).some((i) => i.defId === RESULT_ID),
    '復元後のインベントリにも融合結果の部位が残っている'
  );

  // 融合(TEST16)導入前の旧セーブ(fusionOfferUsedフィールドが存在しない)でもクラッシュせず、
  // false補完で安全に復元できることを確認する。
  const legacyState = { ...createInitialRunState() } as Record<string, unknown>;
  delete legacyState.fusionOfferUsed;
  const legacyEnvelope = { saveVersion: 2, savedAt: Date.now(), state: legacyState };
  (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage.setItem(
    'chimera-battle:test10:run:v2',
    JSON.stringify(legacyEnvelope)
  );
  let legacyLoaded: RunState | null = null;
  let threw = false;
  try {
    legacyLoaded = loadRunState();
  } catch {
    threw = true;
  }
  assert(!threw, '融合フィールドの無い旧形式セーブを読み込んでも例外を投げない');
  assert(legacyLoaded !== null && legacyLoaded.fusionOfferUsed === false, '旧形式セーブはfusionOfferUsed=falseへ安全に補完される');
  clearRunSave();
}

// ============================================================
// 14. 図鑑(codex)が融合部位のidを壊さない
// ============================================================
section('14. 図鑑(codex)が融合部位のidを壊さない');
{
  const empty = createEmptyCodex();
  let threw = false;
  let after = empty;
  try {
    after = markPartsDiscovered(empty, [RESULT_ID, SRC_A]);
  } catch {
    threw = true;
  }
  assert(!threw, '融合結果の部位idを図鑑に記録しても例外を投げない');
  assert(after.discoveredPartIds.includes(RESULT_ID), '融合結果の部位idが部位図鑑の発見済みリストに記録される');
}

// ============================================================
// 15. 計測(metrics)が融合部位のidを壊さない・専用ストレージキーを維持する
// ============================================================
section('15. 計測(metrics)が融合部位のidを壊さない');
{
  const { METRICS_SAVE_KEY, RUN_SAVE_KEY, CODEX_SAVE_KEY } = await import('../src/persistence/storageKeys.ts');
  assert(METRICS_SAVE_KEY !== RUN_SAVE_KEY && METRICS_SAVE_KEY !== CODEX_SAVE_KEY, '計測用のストレージキーはラン保存・図鑑保存と別キーのまま(既存データと混ざらない)');

  const { ensureRunStarted, recordPartCandidates, recordPartChoice, recordRunEnd, __resetMetricsRecorderForTests } = await import(
    '../src/metrics/metricsRecorder.ts'
  );
  __resetMetricsRecorderForTests();
  let threw = false;
  try {
    ensureRunStarted('new');
    recordPartCandidates(1, 'boss', [RESULT_ID, SRC_A]);
    recordPartChoice(1, 'boss', 'equip', RESULT_ID);
    recordRunEnd('victory', 1, [RESULT_ID, SRC_A], { partType: {}, species: {} });
  } catch {
    threw = true;
  }
  assert(!threw, '融合結果の部位idを含む計測イベントを記録しても例外を投げない');
}

// ============================================================
// 16. 自由合体レイヤー表示(groupPartTypeCounts)が融合部位を壊さない
// ============================================================
section('16. 自由合体レイヤー表示が融合部位を壊さない');
{
  const fusedDef = getPartDef(RESULT_ID);
  let threw = false;
  let counts: Record<string, number> = {};
  try {
    counts = groupPartTypeCounts([{ type: fusedDef.type }, { type: 'arm' }]);
  } catch {
    threw = true;
  }
  assert(!threw, '融合部位を含む装着パーツをgroupPartTypeCountsに渡しても例外を投げない');
  assert(counts[fusedDef.type] >= 1, `融合部位のtype(${fusedDef.type})が自由合体レイヤーの集計に正しく反映される`);
}

// ============================================================
// 結果サマリ
// ============================================================
console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
