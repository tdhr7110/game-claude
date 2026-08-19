import type { PartDef } from '../data/types';
import { typeLabel } from './format';
import { commandSourceParts, resolveCommandRarity, COMMAND_CATEGORY_LABELS, type CommandDef } from '../data/commandDefs';
import { commandEffectSummary, describeCommandEvolutionChanges } from './commandFormat';
import type { CommandChangeEvent } from '../engine/commandRewards';
import type { RewardCard } from '../data/rewardPresentation';

// ============================================================
// 部位獲得・コマンド獲得・コマンド進化の各イベントから、共通のRewardCardを組み立てる
// ヘルパー。実際の報酬フロー(DropScreen)とTESTモード(DebugPanel)の両方から
// 同じ関数を呼ぶことで、表示内容が食い違わないようにする。
// ============================================================

let rewardCardSeq = 0;
function nextRewardCardId(prefix: string): string {
  rewardCardSeq += 1;
  return `${prefix}_${rewardCardSeq}_${Date.now().toString(36)}`;
}

export function buildPartAcquiredCard(def: PartDef): RewardCard {
  return {
    id: nextRewardCardId('part'),
    rewardType: 'part_acquired',
    itemId: def.id,
    name: def.name,
    rarity: def.rarity,
    icon: def.icon,
    color: def.color,
    categoryLabel: typeLabel(def.type),
    description: def.description,
    sourcePartNames: [],
    connectionCost: def.cost,
    mainAbilityText: def.passiveDescription ?? def.description,
  };
}

function commandCard(cmd: CommandDef, equippedAfter: PartDef[]): Omit<RewardCard, 'id' | 'rewardType'> {
  const sourceParts = commandSourceParts(cmd, equippedAfter);
  return {
    itemId: cmd.commandId,
    name: cmd.name,
    rarity: resolveCommandRarity(cmd, equippedAfter),
    icon: cmd.icon,
    color: cmd.color,
    categoryLabel: COMMAND_CATEGORY_LABELS[cmd.category],
    description: commandEffectSummary(cmd),
    sourcePartNames: sourceParts.map((p) => p.name),
    familyId: cmd.familyId,
    metabolismCost: cmd.metabolismCost,
    cooldownSeconds: cmd.cooldownSeconds,
  };
}

export function buildCommandRewardCard(change: CommandChangeEvent, equippedAfter: PartDef[]): RewardCard {
  const base = commandCard(change.to, equippedAfter);
  if (change.kind === 'unlocked') {
    return {
      id: nextRewardCardId('cmd_unlock'),
      rewardType: 'command_unlocked',
      ...base,
      alreadyEquippedSlot: change.wasEquippedSlot,
    };
  }
  const from = change.from!;
  return {
    id: nextRewardCardId('cmd_evolve'),
    rewardType: 'command_evolved',
    ...base,
    alreadyEquippedSlot: change.wasEquippedSlot,
    fromName: from.name,
    fromIcon: from.icon,
    changeHighlights: describeCommandEvolutionChanges(from, change.to),
  };
}
