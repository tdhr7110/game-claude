// タイトル画面・初期コア選択・場面別ヒント・セーブ/再開(TEST13)の自動テスト
// （本番ビルドには含まれない）。UIを介さず、データ定義とセーブ/マイグレーションの
// 純粋関数レイヤーだけを検証する。
// 実行: npx tsx scripts/onboardingTest.ts
import { CORE_DEFS, CORE_DEFS_BY_ID, getCoreDef, isCoreId } from '../src/data/cores';
import { HINTS, ALL_HINT_SCENE_IDS, type HintSceneId } from '../src/data/hints';
import { createInitialRunState, getCapacityInfo, getMaxHp, BASE_CAPACITY, type RunState } from '../src/engine/run';
import { getPartDef } from '../src/data/parts';
import { RUN_SAVE_VERSION, parseRunSave, serializeRunSave } from '../src/ui/storage';

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

const EXPECTED_SCENES: HintSceneId[] = [
  'first_enemy',
  'first_part',
  'capacity_over',
  'first_command',
  'command_evolve',
  'first_synergy',
  'first_save',
  'first_defeat',
];

section('1. 初期コア3択の定義');
{
  assert(CORE_DEFS.length === 3, '初期コアはちょうど3種類定義されている');
  const ids = new Set(CORE_DEFS.map((c) => c.id));
  assert(ids.size === 3, '初期コアのidは重複しない');
  for (const core of CORE_DEFS) {
    assert(core.name.length > 0 && core.tagline.length > 0, `${core.id}: 名前と一言説明がある`);
    assert(core.description.length > 0 && core.description.length <= 80, `${core.id}: 説明が短文に収まっている（長文を避ける）`);
    assert(core.strengths.length >= 1 && core.strengths.length <= 2, `${core.id}: 得意分野タグは1〜2個`);
    assert(core.abilityPreview.length >= 1 && core.abilityPreview.length <= 3, `${core.id}: 能力プレビューは1〜3行に収まっている`);
    assert(core.startingPartIds.length >= 1, `${core.id}: 初期部位が1つ以上ある`);
    for (const partId of core.startingPartIds) {
      assert(!!getPartDef(partId), `${core.id}: 初期部位「${partId}」は実在の部位データを参照している`);
    }
  }
  assert(getCoreDef('gluttony')?.colorName === '赤', '赤=暴食コアが解決できる');
  assert(getCoreDef('parasite')?.colorName === '緑', '緑=寄生コアが解決できる');
  assert(getCoreDef('iron_shell')?.colorName === '青', '青=鉄殻コアが解決できる');
  assert(getCoreDef('unknown_core_id') === null, '未知のidはnullを返す（例外を投げない）');
  assert(isCoreId('gluttony') && !isCoreId('unknown_core_id'), 'isCoreIdが正しく判定する');
  assert(Object.keys(CORE_DEFS_BY_ID).length === 3, 'CORE_DEFS_BY_IDにも3件登録されている');
}

section('2. コア選択によるラン初期化');
{
  for (const core of CORE_DEFS) {
    const run = createInitialRunState(core.id);
    assert(run.coreId === core.id, `${core.id}: RunState.coreIdが選択したコアになる`);
    assert(run.equipped.length === core.startingPartIds.length, `${core.id}: 初期装着数がコア定義の部位数と一致する`);
    const equippedDefIds = run.equipped.map((i) => i.defId).sort();
    assert(
      JSON.stringify(equippedDefIds) === JSON.stringify([...core.startingPartIds].sort()),
      `${core.id}: 初期装着部位がコア定義の部位と一致する`
    );
    const capacity = getCapacityInfo(run);
    assert(capacity.used <= BASE_CAPACITY, `${core.id}: 初期装着だけで接続容量(${BASE_CAPACITY})を超過しない（used=${capacity.used}）`);
    assert(getMaxHp(run) > 0, `${core.id}: 初期最大HPが正の値になる`);
  }

  const legacy = createInitialRunState();
  assert(legacy.coreId === null, 'コア未指定時はcoreIdがnull（デバッグ強制リセット等の後方互換）');
  assert(legacy.equipped.length === 2 && legacy.equipped.every((i) => i.defId === 'weak_arm'), 'コア未指定時は従来通り弱い腕x2で開始する');
}

section('3. 場面別ヒント定義（8場面ちょうど・短文・既読管理を前提にした構造）');
{
  assert(ALL_HINT_SCENE_IDS.length === 8, 'ヒントの対象場面はちょうど8つ');
  for (const scene of EXPECTED_SCENES) {
    const hint = HINTS[scene];
    assert(!!hint, `場面「${scene}」のヒントが定義されている`);
    assert(hint.id === scene, `場面「${scene}」: HintDef.idがキーと一致する`);
    assert(hint.text.length > 0 && hint.text.length <= 70, `場面「${scene}」: 1メッセージが短文に収まっている（${hint.text.length}文字）`);
    assert(hint.icon.length > 0, `場面「${scene}」: アイコンがある`);
  }
  const idSet = new Set(ALL_HINT_SCENE_IDS);
  assert(EXPECTED_SCENES.every((s) => idSet.has(s)), '要求された8場面がすべて網羅されている');
}

section('4. ランセーブのシリアライズ/マイグレーション（saveVersion）');
{
  const run: RunState = createInitialRunState('iron_shell');
  const serialized = serializeRunSave(run);
  const parsed = parseRunSave(serialized);
  assert(parsed !== null, '保存した内容を復元できる');
  assert(JSON.stringify(parsed) === JSON.stringify(run), '復元したRunStateが保存前と完全に一致する（往復可能）');
  assert(RUN_SAVE_VERSION === 1, '現行のセーブバージョンは1');

  assert(parseRunSave('not json') === null, '壊れたJSONはクラッシュせずnullを返す');
  assert(parseRunSave('{}') === null, '空オブジェクトはnullを返す（saveVersion不一致）');
  assert(parseRunSave(JSON.stringify({ saveVersion: 999, run })) === null, '未知のsaveVersionはnullを返す（将来のマイグレーション実装ポイント）');
  assert(
    parseRunSave(JSON.stringify({ saveVersion: 1, run: { phase: 'prep' } })) === null,
    'run側の必須フィールドが欠けている場合もnullを返す'
  );
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
