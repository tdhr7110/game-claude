import type { EnemyTier, PartInstance } from '../data/types';
import { getPartDef } from '../data/parts';
import { FUSION_RECIPES, FUSION_RECIPES_BY_ID, type FusionRecipe } from '../data/fusion';

// ============================================================
// 部位融合エンジン（TEST16）
// - どのレシピが今の装着/インベントリで成立するかを判定する
// - 融合を確定し、材料2部位を消費して結果部位を1個生成する（純粋関数）
// engine層はRunStateを直接扱わず、PartInstance配列だけを入出力とすることで
// run.ts側との循環import（run.ts→fusion.ts→run.tsの型）を避けている。
// ============================================================

// ボス撃破後にのみ融合を提示する。ミニボス・ボスの両方を「ボス撃破」として扱う
// （通常戦・強敵戦の撃破では提示しない）。
export function isFusionEligibleTier(tier: EnemyTier): boolean {
  return tier === 'miniboss' || tier === 'boss';
}

export interface FusionCandidate {
  recipe: FusionRecipe;
  sourceInstances: [PartInstance, PartInstance];
}

// 融合済み部位(isFused)は材料にできない＝融合の再帰的連鎖を構造的に禁止する
// (MAX_FUSION_DEPTH=1のランタイム側での担保。data/fusion.ts側のレシピ定義でも
// 通常部位のdefIdしか参照しないため、通常運用ではこの分岐に到達すること自体がない)。
function canBeFusionMaterial(instance: PartInstance): boolean {
  try {
    return !getPartDef(instance.defId).isFused;
  } catch {
    return false;
  }
}

// 装着中・インベントリの両方を材料として扱える（取り外している部位でも融合可能）。
export function findFusionCandidates(equipped: PartInstance[], inventory: PartInstance[]): FusionCandidate[] {
  const pool = [...equipped, ...inventory].filter(canBeFusionMaterial);
  const candidates: FusionCandidate[] = [];
  for (const recipe of FUSION_RECIPES) {
    const [idA, idB] = recipe.sourceDefIds;
    const instA = pool.find((i) => i.defId === idA);
    if (!instA) continue;
    const instB = pool.find((i) => i.defId === idB && i.instanceId !== instA.instanceId);
    if (!instB) continue;
    candidates.push({ recipe, sourceInstances: [instA, instB] });
  }
  return candidates;
}

export interface ApplyFusionResult {
  ok: boolean;
  reason?: string;
  equipped?: PartInstance[];
  inventory?: PartInstance[];
  resultDefId?: string;
}

// 材料2部位を装着/インベントリのどちらから持ち込んでいても正しく取り除き、
// 融合結果を新しい部位インスタンスとしてインベントリへ追加する。
// 新しいinstanceIdの発行はRunState.instanceSeqを持つrun.ts側の責務とし、この関数は
// 呼び出し側から渡されたIDをそのまま使う（純粋関数として状態を持たない）。
export function applyFusion(
  equipped: PartInstance[],
  inventory: PartInstance[],
  recipeId: string,
  newInstanceId: string
): ApplyFusionResult {
  const recipe = FUSION_RECIPES_BY_ID[recipeId];
  if (!recipe) return { ok: false, reason: '不明な融合レシピです' };

  const candidates = findFusionCandidates(equipped, inventory);
  const match = candidates.find((c) => c.recipe.id === recipeId);
  if (!match) return { ok: false, reason: '融合に必要な2部位が揃っていません' };

  const [instA, instB] = match.sourceInstances;
  const removeIds = new Set([instA.instanceId, instB.instanceId]);
  const nextEquipped = equipped.filter((i) => !removeIds.has(i.instanceId));
  const nextInventory = inventory.filter((i) => !removeIds.has(i.instanceId));
  const resultItem: PartInstance = { instanceId: newInstanceId, defId: recipe.resultDefId };

  return {
    ok: true,
    equipped: nextEquipped,
    inventory: [...nextInventory, resultItem],
    resultDefId: recipe.resultDefId,
  };
}
