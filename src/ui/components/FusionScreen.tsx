import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { fusionEligiblePairs } from '../../engine/run';
import { getPartDef } from '../../data/parts';
import { FUSION_CATEGORY_LABELS, type FusionRecipe } from '../../data/fusion';
import type { FusionCandidate } from '../../engine/fusion';
import type { PartEffect } from '../../data/types';
import { PartCard } from './PartCard';
import { FusionIcon } from './FusionIcon';

// 融合プレビューで「継承した能力」を短い日本語文へ変換する。
// フュージョン専用能力(fusion_burst_on_hit)はrecipe.exclusiveDescriptionで別枠表示するため、
// ここでは通常の継承候補として現実的にあり得る効果種のみをカバーする。
function describeEffect(e: PartEffect): string {
  switch (e.kind) {
    case 'apply_poison':
      return `攻撃命中時、毒+${e.amount}`;
    case 'apply_burn':
      return `攻撃命中時、炎上(${e.dps}dmg/秒・${e.duration}秒)`;
    case 'damage_reduction_pct':
      return `受けるダメージ-${e.pct}%`;
    case 'counter_on_hit':
      return `被弾時、敵へ固定ダメージ${e.damage}で反撃`;
    case 'heal_tick':
      return `一定間隔でHP${e.amount}回復`;
    case 'capacity_bonus':
      return `接続容量+${e.amount}`;
    case 'battle_start_defense':
      return `戦闘開始時に防御+${e.amount}`;
    case 'status_amount_bonus':
      return `状態異常の付与量+${e.amount}`;
    case 'evasion_bonus':
      return `回避率+${e.pct}%`;
    case 'attack_speed_all':
      return `全部位の攻撃速度${e.pct >= 0 ? '+' : ''}${e.pct}%`;
    case 'attack_speed_type':
      return `${e.targetType}の攻撃速度${e.pct >= 0 ? '+' : ''}${e.pct}%`;
    case 'poison_no_decay_chance':
      return `毒が${Math.round(e.chance * 100)}%の確率で減衰しない`;
    case 'crit_multiplier_bonus':
      return `会心ダメージ倍率+${e.amount}`;
    default:
      return e.kind;
  }
}

function FusionPreview({ candidate, onConfirm, onCancel }: { candidate: FusionCandidate; onConfirm: () => void; onCancel: () => void }) {
  const { recipe } = candidate;
  const defA = getPartDef(recipe.sourceDefIds[0]);
  const defB = getPartDef(recipe.sourceDefIds[1]);
  const resultDef = getPartDef(recipe.resultDefId);
  const sumCost = defA.cost + defB.cost;
  const saved = sumCost - resultDef.cost;

  return (
    <div className="fusion-preview">
      <div className="fusion-preview__row">
        <PartCard def={defA} compact />
        <span className="fusion-preview__plus">＋</span>
        <PartCard def={defB} compact />
        <span className="fusion-preview__arrow">→</span>
        <div className="fusion-preview__result">
          <FusionIcon recipe={recipe} size="lg" />
          <div className="fusion-preview__result-name">{resultDef.name}</div>
        </div>
      </div>

      <p className="detail-panel__desc">{resultDef.description}</p>

      <div className="fusion-preview__cost">
        🔌 接続コスト: 元の合計{sumCost} → 融合後{resultDef.cost}
        {saved > 0 && <span className="fusion-preview__saved">（{saved}節約）</span>}
      </div>

      <div className="fusion-preview__abilities">
        <div className="fusion-preview__abilities-title">継承した能力（元部位の能力を一部だけ引き継ぐ）</div>
        {recipe.inheritedEffects.length === 0 ? (
          <p className="muted">今回は継承できる能力がありませんでした（融合専用能力のみ付与）</p>
        ) : (
          <ul>
            {recipe.inheritedEffects.map((e, i) => (
              <li key={i}>🔗 {describeEffect(e)}</li>
            ))}
          </ul>
        )}
        <div className="fusion-preview__abilities-title fusion-preview__abilities-title--exclusive">融合専用能力（この融合でしか得られない）</div>
        <p className="fusion-preview__exclusive">✨ {recipe.exclusiveDescription}</p>
      </div>

      <div className="fusion-preview__actions">
        <button className="btn btn--primary btn--large btn--block" onClick={onConfirm}>
          この融合を確定する
        </button>
        <button className="btn btn--ghost btn--block" onClick={onCancel}>
          選び直す
        </button>
      </div>
    </div>
  );
}

export function FusionScreen() {
  const { state, dispatch, registerFusionCodexEntry } = useGame();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  // 1回のボス撃破オファーにつき融合は最大1回まで（無限に融合し続けられないようにするUI側の歯止め）。
  const [fusedResultDefId, setFusedResultDefId] = useState<string | null>(null);

  const candidates = useMemo(() => fusionEligiblePairs(state), [state]);
  const selectedCandidate = selectedRecipeId ? candidates.find((c) => c.recipe.id === selectedRecipeId) ?? null : null;

  function handleConfirm(recipe: FusionRecipe) {
    registerFusionCodexEntry(recipe.id, recipe.resultDefId);
    dispatch({ type: 'CONFIRM_FUSION', recipeId: recipe.id });
    setFusedResultDefId(recipe.resultDefId);
    setSelectedRecipeId(null);
  }

  function proceed() {
    dispatch({ type: 'RESOLVE_FUSION_STEP' });
  }

  return (
    <div className="screen fusion-screen">
      <header className="screen__header">
        <h1>🧬 部位融合（任意）</h1>
        <p className="muted">
          {state.currentEnemy?.name ?? 'ボス'}を撃破した！ 2部位を1部位へ圧縮し、能力の一部と融合専用能力を持つ新しい部位を作れます。行わなくても通常の報酬へ進めます。
        </p>
      </header>

      {fusedResultDefId ? (
        <div className="fusion-result-banner">
          <div className="fusion-result-banner__title">✅ {getPartDef(fusedResultDefId).name} を生成しました！</div>
          <p className="muted">インベントリに追加され、融合図鑑にも記録されました。装着は戦闘準備画面でいつでも行えます。</p>
          <PartCard def={getPartDef(fusedResultDefId)} />
        </div>
      ) : candidates.length === 0 ? (
        <p className="muted">現在装着中・インベントリの部位では、融合できる組み合わせがありません。</p>
      ) : (
        <div className="fusion-candidate-list">
          {candidates.map((c) => (
            <button
              key={c.recipe.id}
              type="button"
              className={`fusion-candidate-row${selectedRecipeId === c.recipe.id ? ' fusion-candidate-row--selected' : ''}`}
              onClick={() => setSelectedRecipeId(c.recipe.id)}
            >
              <FusionIcon recipe={c.recipe} />
              <div className="fusion-candidate-row__info">
                <div className="fusion-candidate-row__name">
                  {c.recipe.name} <span className="chip">{FUSION_CATEGORY_LABELS[c.recipe.category]}</span>
                </div>
                <div className="muted fusion-candidate-row__sources">
                  {getPartDef(c.recipe.sourceDefIds[0]).icon} {getPartDef(c.recipe.sourceDefIds[0]).name} ＋ {getPartDef(c.recipe.sourceDefIds[1]).icon}{' '}
                  {getPartDef(c.recipe.sourceDefIds[1]).name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedCandidate && !fusedResultDefId && (
        <FusionPreview
          candidate={selectedCandidate}
          onConfirm={() => handleConfirm(selectedCandidate.recipe)}
          onCancel={() => setSelectedRecipeId(null)}
        />
      )}

      <div className="sticky-cta">
        <button className="btn btn--large btn--block" onClick={proceed}>
          {fusedResultDefId ? '報酬へ進む ➡️' : '融合せずに報酬へ進む ➡️'}
        </button>
      </div>
    </div>
  );
}
