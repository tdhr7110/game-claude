// TEST10統合の回帰テスト: セーブ／再開・図鑑・敵候補選択(TEST7×TEST9)の結合部分を検証する。
// 実行: npx tsx scripts/persistenceCodexTest.ts
//
// storageAvailability.tsの可用性判定(isStorageAvailable)はプロセス内で一度だけ判定して
// キャッシュする実装のため、「localStorageが利用できない」ケースは同一プロセス内で後から
// 再現できない(先に使える状態で判定してしまうと以後ずっとtrueのまま)。そのため、その1件だけは
// window未定義のままの別プロセス(子プロセス)で検証し、それ以外は疑似localStorageを積んだ
// このプロセス内でまとめて検証する。
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
// 0. localStorageが利用できない環境でのフォールバック(子プロセスで検証)
// ============================================================
section('0. localStorageが利用できない場合のフォールバック');
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tmpDir = mkdtempSync(path.join(tmpdir(), 'chimera-storage-fallback-'));
  const childPath = path.join(tmpDir, 'child.ts');
  const runPersistencePath = path.join(repoRoot, 'src/persistence/runPersistence.ts').replace(/\\/g, '/');
  const codexPersistencePath = path.join(repoRoot, 'src/persistence/codexPersistence.ts').replace(/\\/g, '/');
  writeFileSync(
    childPath,
    `
    // windowを一切定義しない状態(Node標準)で、localStorageが無い環境を模す。
    import { loadRunState, hasValidRunSave, saveRunState, clearRunSave } from '${runPersistencePath}';
    import { loadCodexState, saveCodexState } from '${codexPersistencePath}';
    import { createInitialRunState } from '${path.join(repoRoot, 'src/engine/run.ts').replace(/\\/g, '/')}';
    import { createEmptyCodex } from '${path.join(repoRoot, 'src/engine/codex.ts').replace(/\\/g, '/')}';

    const results: string[] = [];
    try {
      results.push(loadRunState() === null ? 'ok:loadRunState-null' : 'ng:loadRunState-not-null');
      results.push(hasValidRunSave() === false ? 'ok:hasValidRunSave-false' : 'ng:hasValidRunSave-true');
      saveRunState(createInitialRunState());
      results.push('ok:saveRunState-no-throw');
      clearRunSave();
      results.push('ok:clearRunSave-no-throw');
      const codex = loadCodexState();
      results.push(JSON.stringify(codex) === JSON.stringify(createEmptyCodex()) ? 'ok:loadCodexState-empty' : 'ng:loadCodexState-not-empty');
      saveCodexState(codex);
      results.push('ok:saveCodexState-no-throw');
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
  assert(lines.includes('ok:loadRunState-null'), 'loadRunState()はnullを返す(クラッシュしない)');
  assert(lines.includes('ok:hasValidRunSave-false'), 'hasValidRunSave()はfalseを返す');
  assert(lines.includes('ok:saveRunState-no-throw'), 'saveRunState()は例外を投げず黙って何もしない');
  assert(lines.includes('ok:clearRunSave-no-throw'), 'clearRunSave()は例外を投げない');
  assert(lines.includes('ok:loadCodexState-empty'), 'loadCodexState()は空の図鑑にフォールバックする');
  assert(lines.includes('ok:saveCodexState-no-throw'), 'saveCodexState()は例外を投げない');
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

const { loadRunState, saveRunState, clearRunSave, RUN_SAVE_VERSION } = await import('../src/persistence/runPersistence.ts');
const { RUN_SAVE_KEY, STORAGE_NAMESPACE } = await import('../src/persistence/storageKeys.ts');
const { safeGetItem, safeSetItem } = await import('../src/persistence/storageAvailability.ts');
const { loadCodexState, saveCodexState } = await import('../src/persistence/codexPersistence.ts');
const { createEmptyCodex, recordEnemyEncounter, recordEnemyDefeat, isEnemyEncountered, isEnemyDefeated } = await import('../src/engine/codex.ts');
const { createInitialRunState, enterEnemySelect, chooseEnemy, finishBattle } = await import('../src/engine/run.ts');
const { PARTS_BY_ID } = await import('../src/data/parts.ts');

function localStorageMock(): MemoryStorage {
  return (globalThis as unknown as { window: { localStorage: MemoryStorage } }).window.localStorage;
}

// ============================================================
// 1. ストレージ名前空間(TEST10)
// ============================================================
section('1. ストレージ名前空間');
{
  assert(STORAGE_NAMESPACE === 'chimera-battle:test10', 'STORAGE_NAMESPACEがtest10へ変更されている');
  assert(RUN_SAVE_KEY.startsWith(STORAGE_NAMESPACE), 'RUN_SAVE_KEYがtest10名前空間の配下にある');
}

// ============================================================
// 2. enemySelect中に保存でき、敵候補・選択後の敵が正しく復元される
// ============================================================
section('2. enemySelect中の保存・復元(敵候補・選択結果)');
{
  localStorageMock().removeItem(RUN_SAVE_KEY);
  const prep = createInitialRunState();
  const selecting = enterEnemySelect(prep);
  assert(selecting.phase === 'enemySelect', '前提: enterEnemySelect後はphaseがenemySelect');
  assert(selecting.enemyCandidates.length > 0, '前提: 敵候補が生成されている');

  saveRunState(selecting);
  const loaded1 = loadRunState();
  assert(loaded1 !== null, 'enemySelectフェーズのRunStateを保存・復元できる');
  assert(loaded1?.phase === 'enemySelect', '復元後もphaseがenemySelectのまま');
  const savedIds = selecting.enemyCandidates.map((e) => e.id).join(',');
  const loadedIds1 = loaded1?.enemyCandidates.map((e) => e.id).join(',');
  assert(loadedIds1 === savedIds, '敵候補(id列)が保存前と一致して復元される');

  // 「リロード」を模して、同じ保存データを再度読み込む(再抽選が起きないことの確認)。
  const loaded2 = loadRunState();
  const loadedIds2 = loaded2?.enemyCandidates.map((e) => e.id).join(',');
  assert(loadedIds2 === savedIds, '繰り返し読み込んでも敵候補が変化しない(再抽選されない)');

  // 保存データ本体にRunSaveEnvelope側の別枠enemyCandidatesが存在しない(二重管理していない)ことを確認する。
  const raw = safeGetItem(RUN_SAVE_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  assert(parsed !== null && typeof parsed === 'object', '保存データがJSONとして読める');
  assert(!Object.prototype.hasOwnProperty.call(parsed, 'enemyCandidates'), 'RunSaveEnvelope直下にenemyCandidatesの別枠が存在しない(state.enemyCandidatesのみが正)');
  assert(Object.prototype.hasOwnProperty.call(parsed.state, 'enemyCandidates'), 'state.enemyCandidatesとして保持されている');

  const chosenId = selecting.enemyCandidates[1].id;
  const chosenResult = chooseEnemy(selecting, chosenId);
  assert(chosenResult.ok, '前提: 敵選択が成功する');
  saveRunState(chosenResult.state);
  const loaded3 = loadRunState();
  assert(loaded3?.phase === 'battle', '選択後はphaseがbattleへ復元される');
  assert(loaded3?.currentEnemy?.id === chosenId, '選択した敵がcurrentEnemyとして正しく復元される');
  assert((loaded3?.enemyCandidates.length ?? -1) === 0, '選択後はenemyCandidatesが空で復元される');
}

// ============================================================
// 3. 戦闘後のドロップが敵の所持部位に従う(復元後も含む)
// ============================================================
section('3. ドロップ候補が敵のbodyPartIds/rareDropPartIdsの範囲内');
{
  const prep = createInitialRunState();
  const selecting = enterEnemySelect(prep);
  const enemy = selecting.enemyCandidates[0];
  const battleState = chooseEnemy(selecting, enemy.id).state;
  const dropState = finishBattle(battleState, 'won', 1);
  assert(dropState.phase === 'drop', '前提: 勝利後はdropフェーズへ遷移する');
  assert(dropState.dropCandidates.length > 0, '前提: ドロップ候補が生成されている');
  const allowed = new Set([...enemy.bodyPartIds, ...enemy.rareDropPartIds]);
  const allWithinPool = dropState.dropCandidates.every((p) => allowed.has(p.id));
  assert(allWithinPool, 'ドロップ候補はすべて敵のbodyPartIds/rareDropPartIdsの範囲内');

  saveRunState(dropState);
  const loaded = loadRunState();
  assert(loaded?.phase === 'drop', '復元後もdropフェーズのまま');
  const revivedAllWithinPool = (loaded?.dropCandidates ?? []).every((p) => allowed.has(p.id) && PARTS_BY_ID[p.id] === p);
  assert(revivedAllWithinPool, '復元後のドロップ候補も敵の所持部位の範囲内かつマスターデータから引き直されている');
}

// ============================================================
// 4. 図鑑: 遭遇/撃破の記録タイミング
// ============================================================
section('4. 図鑑: 遭遇・撃破の記録');
{
  const prep = createInitialRunState();
  const selecting = enterEnemySelect(prep);
  const codexBefore = createEmptyCodex();
  for (const e of selecting.enemyCandidates) {
    assert(!isEnemyEncountered(codexBefore, e.id), `候補一覧に表示されただけでは「${e.name}」は未遭遇のまま`);
  }

  const chosen = selecting.enemyCandidates[0];
  // GameContext.tsxの実装方針(敵選択→battleフェーズへの実遷移で遭遇を記録)を模す。
  const codexAfterEncounter = recordEnemyEncounter(codexBefore, chosen.id);
  assert(isEnemyEncountered(codexAfterEncounter, chosen.id), '敵選択(battleフェーズ突入)後は遭遇済みになる');
  assert(!isEnemyDefeated(codexAfterEncounter, chosen.id), 'この時点ではまだ未撃破');

  const codexAfterDefeat = recordEnemyDefeat(codexAfterEncounter, chosen.id);
  assert(isEnemyDefeated(codexAfterDefeat, chosen.id), '撃破後は図鑑に撃破済みとして記録される');
  assert(codexAfterDefeat.enemyEntries[chosen.id].defeatCount === 1, '撃破回数が1でカウントされる');

  saveCodexState(codexAfterDefeat);
  const loadedCodex = loadCodexState();
  assert(isEnemyEncountered(loadedCodex, chosen.id) && isEnemyDefeated(loadedCodex, chosen.id), '図鑑の保存・復元後も遭遇・撃破状態が維持される');
}

// ============================================================
// 5. 壊れたセーブデータ・バージョン不一致への安全な対応
// ============================================================
section('5. 壊れたデータ・バージョン不一致への対応');
{
  // 5a. 壊れたJSON
  safeSetItem(RUN_SAVE_KEY, '{this is not valid json');
  assert(loadRunState() === null, '壊れたJSONはクラッシュせずnullとして扱われる');

  // 5b. バージョン不一致
  const prep = createInitialRunState();
  saveRunState(prep);
  const raw = safeGetItem(RUN_SAVE_KEY)!;
  const parsed = JSON.parse(raw);
  parsed.saveVersion = RUN_SAVE_VERSION - 1;
  safeSetItem(RUN_SAVE_KEY, JSON.stringify(parsed));
  assert(loadRunState() === null, '古いsaveVersionのデータは無効化され、新規ランとして継続できる');

  parsed.saveVersion = RUN_SAVE_VERSION + 1;
  safeSetItem(RUN_SAVE_KEY, JSON.stringify(parsed));
  assert(loadRunState() === null, '未来のsaveVersion(不正な値)も同様に無効化される');

  // 5c. 敵ギミック関連フィールドが欠けた旧形式のcurrentEnemy/enemyCandidates
  const selecting = enterEnemySelect(prep);
  const chosen = chooseEnemy(selecting, selecting.enemyCandidates[0].id).state;
  saveRunState(chosen);
  const raw2 = JSON.parse(safeGetItem(RUN_SAVE_KEY)!);
  delete raw2.state.currentEnemy.gimmicks;
  safeSetItem(RUN_SAVE_KEY, JSON.stringify(raw2));
  assert(loadRunState() === null, 'currentEnemyからgimmicksが欠落したデータは無効化される');

  saveRunState(chosen);
  const raw4 = JSON.parse(safeGetItem(RUN_SAVE_KEY)!);
  delete raw4.state.currentEnemy.bodyPartIds;
  safeSetItem(RUN_SAVE_KEY, JSON.stringify(raw4));
  assert(loadRunState() === null, 'currentEnemyからbodyPartIdsが欠落したデータは無効化される');

  clearRunSave();
  assert(loadRunState() === null, 'clearRunSave後はloadRunStateがnullを返す');
}

// ============================================================
// 6. 名前付きキメラのギャラリーが壊れていない(GameContext.tsx側の設計を静的に確認)
// ============================================================
section('6. 名前付きキメラギャラリーの健全性');
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const src = (await import('node:fs')).readFileSync(path.join(repoRoot, 'src/ui/GameContext.tsx'), 'utf-8');
  assert(src.includes("'chimera-battle:gallery:v1'"), 'キメラ図鑑のlocalStorageキーはTEST9以前のまま変更されていない(既存データを失わない)');
  assert(src.includes('Array.isArray(parsed)'), 'ギャラリー読み込み時にArray.isArrayで形式検証している');
  assert(src.includes('} catch {'), 'ギャラリー読み込みがtry/catchで保護されている(壊れたJSONでもクラッシュしない)');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
