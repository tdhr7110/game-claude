import { useState } from 'react';
import { useGame } from '../GameContext';
import { getPartDef } from '../../data/parts';
import { FUSION_CATEGORY_LABELS, FUSION_RECIPES_BY_ID } from '../../data/fusion';
import { PartDetailPanel } from './PartDetailPanel';
import { FusionIcon } from './FusionIcon';

interface FusionCodexModalProps {
  onClose: () => void;
}

// 融合図鑑（TEST16）: これまでに成立させた融合レシピの一覧。キメラ図鑑と同様、
// ラン進行状況とは独立してlocalStorageへ永続化される（GameContext参照）。
export function FusionCodexModal({ onClose }: FusionCodexModalProps) {
  const { fusionCodex } = useGame();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const selectedRecipe = selectedRecipeId ? FUSION_RECIPES_BY_ID[selectedRecipeId] : null;
  const selectedDef = selectedRecipe ? getPartDef(selectedRecipe.resultDefId) : null;

  return (
    <div className="intro-overlay" onClick={onClose}>
      <div className="intro-card gallery-card" onClick={(e) => e.stopPropagation()}>
        <div className="intro-card__title">🧬 融合図鑑（{fusionCodex.length}種）</div>
        {fusionCodex.length === 0 ? (
          <p className="muted gallery-empty">まだ融合したことはありません。ボス（中ボス・ボス）を撃破すると、材料が揃っていれば融合を提案されます。</p>
        ) : (
          <div className="gallery-list">
            {fusionCodex.map((entry) => {
              const recipe = FUSION_RECIPES_BY_ID[entry.recipeId];
              if (!recipe) return null; // 将来レシピが削除された場合でも壊れずに読み飛ばす（保存互換）
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`gallery-entry fusion-codex-entry${selectedRecipeId === entry.recipeId ? ' fusion-codex-entry--selected' : ''}`}
                  onClick={() => setSelectedRecipeId(entry.recipeId)}
                >
                  <FusionIcon recipe={recipe} />
                  <div className="gallery-entry__info">
                    <div className="gallery-entry__name">
                      {recipe.name} <span className="chip">{FUSION_CATEGORY_LABELS[recipe.category]}</span>
                    </div>
                    <div className="muted gallery-entry__sub">融合回数 {entry.timesCreated}回</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {selectedDef && (
          <div className="gallery-detail">
            <PartDetailPanel def={selectedDef} />
          </div>
        )}
        <button className="btn btn--primary btn--large" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
