// コマンド獲得・進化の報酬演出フロー(TEST6)の自動テスト（本番ビルドには含まれない）。
// 実際の部位獲得〜コマンド変化検出〜報酬カード生成〜装備状態までを、
// UIを介さず純粋関数のレイヤーだけで検証する。
// 実行: npx tsx scripts/rewardFlowTest.ts
import { getPartDef } from '../src/data/parts';
import {
  createInitialRunState,
  equipPart,
  markCommandsSeen,
  recordCommandDiscoveries,
  setCommandSlot,
  type RunState,
} from '../src/engine/run';
import { equippedDefs } from '../src/engine/run';
import { detectCommandChanges } from '../src/engine/commandRewards';
import { getCommandDef, resolveCommandRarity, commandSourceParts, resolveFamilyBestCommand } from '../src/data/commandDefs';
import { buildCommandRewardCard, buildPartAcquiredCard } from '../src/ui/rewardCardBuilders';

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

function grantAndEquip(state: RunState, defId: string): RunState {
  const instanceId = `inst_test_${defId}_${Math.random().toString(36).slice(2, 7)}`;
  const withInventory: RunState = { ...state, inventory: [...state.inventory, { instanceId, defId }] };
  return equipPart(withInventory, instanceId).state;
}

section('1. 新規解放の検出（腕を3個以上装着→全腕斉射）');
{
  let state = createInitialRunState(); // 初期状態で腕(weak_arm)を2個装着済み
  const before = equippedDefs(state);
  state = grantAndEquip(state, 'insect_sickle_arm'); // 3個目の腕
  const after = equippedDefs(state);
  const changes = detectCommandChanges(before, after, state.commandLoadout);
  const unlock = changes.find((c) => c.familyId === 'allarms');
  assert(!!unlock, '全腕斉射(allarms family)の変化が検出される');
  assert(unlock?.kind === 'unlocked', '検出された変化の種別がunlockedである');
  assert(unlock?.from === null, '解放前は技を持っていなかった(from=null)');
  assert(unlock?.to.commandId === 'cmd_all_arms_volley', '解放されたのは全腕斉射(基礎形)である');
}

section('2. 進化の検出（毒爆発→疫病爆発）');
{
  let state = createInitialRunState();
  state = grantAndEquip(state, 'insect_poison_gland');
  const before = equippedDefs(state);
  const changesBase = detectCommandChanges([], before, state.commandLoadout);
  assert(
    changesBase.some((c) => c.familyId === 'poisonburst' && c.to.commandId === 'cmd_poison_burst'),
    '毒腺装着だけでは毒爆発(基礎形)が解放される'
  );

  state = grantAndEquip(state, 'special_plague_core');
  const after = equippedDefs(state);
  const changes = detectCommandChanges(before, after, state.commandLoadout);
  const evo = changes.find((c) => c.familyId === 'poisonburst');
  assert(!!evo, '疫病核の追加でpoisonburst familyの変化が検出される');
  assert(evo?.kind === 'evolved', '検出された変化の種別がevolvedである');
  assert(evo?.from?.commandId === 'cmd_poison_burst', '進化前は毒爆発だった');
  assert(evo?.to.commandId === 'cmd_plague_burst', '進化後は疫病爆発になる');
}

section('3. 変化なしの場合は空配列（誤検出しない）');
{
  const state = createInitialRunState();
  const defs = equippedDefs(state);
  const changes = detectCommandChanges(defs, defs, state.commandLoadout);
  assert(changes.length === 0, '装着部位が変化していなければ検出結果は空');
}

section('4. 同じ部位構成なら常に同じ結果（重複獲得の温床にならない）');
{
  let state = createInitialRunState();
  state = grantAndEquip(state, 'insect_sickle_arm');
  const before = equippedDefs(createInitialRunState());
  const after = equippedDefs(state);
  const changes1 = detectCommandChanges(before, after, state.commandLoadout);
  const changes2 = detectCommandChanges(before, after, state.commandLoadout);
  assert(changes1.length === changes2.length && changes1.length > 0, '同じbefore/afterを2回判定しても結果は同じ件数');
  assert(
    changes1.map((c) => c.to.commandId).join(',') === changes2.map((c) => c.to.commandId).join(','),
    '2回判定しても中身も完全に一致する(純粋関数として冪等)'
  );
}

section('5. 既に装備中の枠が進化した場合、枠は自動的に維持される');
{
  let state = createInitialRunState();
  state = grantAndEquip(state, 'insect_poison_gland');
  const setResult = setCommandSlot(state, 3, 'poisonburst');
  assert(setResult.ok, '毒爆発(基礎形)を枠4へ装備できる');
  state = setResult.state;
  assert(state.commandLoadout[3] === 'poisonburst', '枠4にpoisonburst familyが装備されている');

  const beforeEvo = equippedDefs(state);
  state = grantAndEquip(state, 'special_plague_core');
  const afterEvo = equippedDefs(state);
  assert(state.commandLoadout[3] === 'poisonburst', '進化後もfamilyIdベースの装備枠(枠4)はそのまま維持される');
  const resolved = resolveFamilyBestCommand('poisonburst', afterEvo);
  assert(resolved?.commandId === 'cmd_plague_burst', '枠4を経由して解決される技は自動的に疫病爆発(進化後)になる');

  const changes = detectCommandChanges(beforeEvo, afterEvo, state.commandLoadout);
  const evo = changes.find((c) => c.familyId === 'poisonburst');
  assert(evo?.wasEquippedSlot === 3, 'detectCommandChangesもこの技が枠4に装備済みだったことを報告する');
}

section('6. コマンドのレアリティ解決（部位の最高レアリティにフォールバック）');
{
  const cmd = getCommandDef('cmd_plague_burst')!;
  assert(cmd.rarity === undefined, '疫病爆発コマンド自体には明示的なレアリティが設定されていない(フォールバック確認のため)');
  const sourceParts = commandSourceParts(cmd, []);
  const rarity = resolveCommandRarity(cmd, []);
  const highest = sourceParts.reduce<string>((acc, p) => (['common', 'uncommon', 'rare'].indexOf(p.rarity) > ['common', 'uncommon', 'rare'].indexOf(acc) ? p.rarity : acc), 'common');
  assert(rarity === highest, `関係部位の最高レアリティ(${highest})へフォールバックする`);

  const noPartsRarity = resolveCommandRarity(getCommandDef('cmd_strike')!, []);
  assert(noPartsRarity === 'common', '関係部位が無いコマンド(初期解放技)はコモン扱いになる');
}

section('7. 報酬カード生成（part_acquired / command_unlocked / command_evolved）');
{
  const partCard = buildPartAcquiredCard(getPartDef('insect_sickle_arm'));
  assert(partCard.rewardType === 'part_acquired', 'part_acquiredカードのrewardTypeが正しい');
  assert(partCard.name === getPartDef('insect_sickle_arm').name, '部位名がそのまま反映される');

  const lower = getCommandDef('cmd_poison_burst')!;
  const upper = getCommandDef('cmd_plague_burst')!;
  const unlockCard = buildCommandRewardCard({ familyId: 'poisonburst', kind: 'unlocked', from: null, to: lower, wasEquippedSlot: -1 }, []);
  assert(unlockCard.rewardType === 'command_unlocked', 'command_unlockedカードのrewardTypeが正しい');
  assert(unlockCard.itemId === 'cmd_poison_burst', 'unlockCardのitemIdが対象コマンドのcommandIdと一致する');

  const evolveCard = buildCommandRewardCard({ familyId: 'poisonburst', kind: 'evolved', from: lower, to: upper, wasEquippedSlot: -1 }, []);
  assert(evolveCard.rewardType === 'command_evolved', 'command_evolvedカードのrewardTypeが正しい');
  assert(evolveCard.fromName === lower.name, '進化前の技名がfromNameへ反映される');
  assert((evolveCard.changeHighlights?.length ?? 0) > 0, '進化差分のハイライトが1件以上生成される');
}

section('8. 既知コマンド・未確認バッジの状態管理（重複防止・解除）');
{
  let state = createInitialRunState();
  assert(state.knownCommandIds.length === 0 && state.unseenCommandIds.length === 0, '初期状態では既知・未確認ともに空');

  state = recordCommandDiscoveries(state, ['cmd_plague_burst']);
  assert(state.knownCommandIds.includes('cmd_plague_burst'), '記録後は既知リストに含まれる');
  assert(state.unseenCommandIds.includes('cmd_plague_burst'), '記録後は未確認リストにも含まれる(バッジ表示対象)');

  state = recordCommandDiscoveries(state, ['cmd_plague_burst']);
  assert(state.knownCommandIds.filter((id) => id === 'cmd_plague_burst').length === 1, '同じcommandIdを2回記録しても重複しない');

  state = markCommandsSeen(state, ['cmd_plague_burst']);
  assert(!state.unseenCommandIds.includes('cmd_plague_burst'), '個別に確認済みにするとバッジ対象から外れる');
  assert(state.knownCommandIds.includes('cmd_plague_burst'), '確認済みにしても既知リストからは消えない(再取得防止のため)');

  state = recordCommandDiscoveries(state, ['cmd_all_arms_volley', 'cmd_hundred_arms_barrage']);
  assert(state.unseenCommandIds.length === 2, '複数件を一括記録できる');
  state = markCommandsSeen(state); // 引数なし = 全解除
  assert(state.unseenCommandIds.length === 0, '引数なしのmarkCommandsSeenで全バッジが解除される');
}

section('9. 再入手時に演出が重複しない（一度確認したコマンドの再検出を除外する運用を確認）');
{
  let state = createInitialRunState();
  const before = equippedDefs(state);
  state = grantAndEquip(state, 'insect_poison_gland');
  const after = equippedDefs(state);
  const changes = detectCommandChanges(before, after, state.commandLoadout);
  const newIds = changes.map((c) => c.to.commandId);
  state = recordCommandDiscoveries(state, newIds);
  assert(state.knownCommandIds.includes('cmd_poison_burst'), '1回目の解放でknownCommandIdsに登録される');

  // UI側(DropScreen)は実際には「対象commandIdがknownCommandIdsに無いものだけ」をカードにする。
  // ここではその選別ロジック自体を検証する。
  const stillNew = changes.filter((c) => !state.knownCommandIds.includes(c.to.commandId));
  assert(stillNew.length === 0, '既にknownCommandIdsへ登録済みのcommandIdは「新規」として再度カード化されない');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
process.exit(failCount > 0 ? 1 : 0);
