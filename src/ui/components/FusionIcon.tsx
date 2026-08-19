import { getPartDef } from '../../data/parts';
import type { FusionRecipe } from '../../data/fusion';

interface FusionIconProps {
  recipe: FusionRecipe;
  size?: 'sm' | 'md' | 'lg';
}

// 融合専用画像（アイコン）を持つレシピはそのまま単一アイコンを表示する。
// 専用画像を持たないレシピ(iconMode==='composite')は、画像素材を持たないこのプロトタイプの
// 方針(ChimeraAvatar等と同様)に沿って、既存の2部位アイコンを1つの枠にレイヤー合成して表示する。
// これが「融合専用画像がない場合は既存画像レイヤーを合成する」の実装。
export function FusionIcon({ recipe, size = 'md' }: FusionIconProps) {
  if (recipe.iconMode === 'custom') {
    return (
      <span className={`fusion-icon fusion-icon--${size} fusion-icon--custom`} title={recipe.name}>
        {recipe.resultBase.icon}
      </span>
    );
  }
  const [defIdA, defIdB] = recipe.sourceDefIds;
  const iconA = getPartDef(defIdA).icon;
  const iconB = getPartDef(defIdB).icon;
  return (
    <span className={`fusion-icon fusion-icon--${size} fusion-icon--composite`} title={`${recipe.name}（融合専用画像なし・既存アイコンを合成表示）`}>
      <span className="fusion-icon__layer fusion-icon__layer--a">{iconA}</span>
      <span className="fusion-icon__layer fusion-icon__layer--b">{iconB}</span>
    </span>
  );
}
