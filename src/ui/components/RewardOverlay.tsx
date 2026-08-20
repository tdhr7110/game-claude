import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { RARITY_EFFECT_CONFIG, type RewardCard } from '../../data/rewardPresentation';
import { RARITY_COLORS, rarityLabel } from '../format';
import { getCommandDef, resolveFamilyBestCommand } from '../../data/commandDefs';
import { describeCommandEvolutionChanges } from '../commandFormat';
import { equippedDefs } from '../../engine/run';
import { playSE } from '../../engine/soundManager';
import '../commandSystem.css';

// ============================================================
// 部位獲得・コマンド獲得・コマンド進化を同じ形で表示する共通の報酬演出オーバーレイ。
// GameContextのrewardQueueを1件ずつ消化する。画面遷移は行わず、
// 現在のフェーズ画面の上に重ねて表示するだけなので、報酬フローが
// 何度も画面を移動することはない。
// ============================================================

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function RewardOverlay() {
  const { state, dispatch, rewardQueue, advanceRewardQueue } = useGame();
  const batchTotalRef = useRef(0);
  const prevLenRef = useRef(0);
  if (rewardQueue.length > 0 && prevLenRef.current === 0) {
    batchTotalRef.current = rewardQueue.length;
  }
  prevLenRef.current = rewardQueue.length;

  const [swapTarget, setSwapTarget] = useState<number | null>(null);

  const card = rewardQueue[0];

  // TEST18: 部位獲得・コマンド獲得(進化含む)のたびに専用SEを1回だけ鳴らす。
  useEffect(() => {
    if (!card) return;
    playSE(card.rewardType === 'part_acquired' ? 'part_acquired' : 'command_acquired');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (!card) return null;

  const reduced = prefersReducedMotion();

  const total = batchTotalRef.current;
  const index = total - rewardQueue.length + 1;
  const cfg = RARITY_EFFECT_CONFIG[card.rarity];

  function next() {
    setSwapTarget(null);
    advanceRewardQueue();
  }

  function equipToSlot(slotIndex: number) {
    if (!card.familyId) return;
    dispatch({ type: 'SET_COMMAND_SLOT', slotIndex, familyId: card.familyId });
    dispatch({ type: 'MARK_COMMANDS_SEEN', commandIds: [card.itemId] });
    next();
  }

  const emptySlotIndex = state.commandLoadout.indexOf(null);
  const isAutoRetainedEvolution = card.rewardType === 'command_evolved' && (card.alreadyEquippedSlot ?? -1) >= 0;
  const needsEquipChoice = (card.rewardType === 'command_unlocked' || card.rewardType === 'command_evolved') && !isAutoRetainedEvolution;

  return (
    <div
      className={`reward-overlay${reduced ? ' reward-overlay--reduced' : ''}${cfg.screenShake && !reduced ? ' reward-overlay--shake' : ''}`}
      style={
        {
          '--reward-duration': `${cfg.durationMs}ms`,
          '--reward-glow': cfg.glowIntensity,
          '--reward-scale': cfg.scale,
          '--reward-bg-dark': cfg.backgroundDarkness,
          '--reward-color': card.color || RARITY_COLORS[card.rarity],
        } as React.CSSProperties
      }
    >
      <div className="reward-overlay__backdrop" />
      <div className={`reward-card reward-card--rarity-${card.rarity}`}>
        {total > 1 && (
          <div className="reward-card__progress">
            {index}/{total}
          </div>
        )}

        <div className="reward-card__kicker">
          {card.rewardType === 'part_acquired' && 'NEW PART'}
          {card.rewardType === 'command_unlocked' && 'NEW COMMAND'}
          {card.rewardType === 'command_evolved' && 'COMMAND EVOLUTION'}
        </div>
        <div className="reward-card__headline">
          {card.rewardType === 'part_acquired' && '部位獲得！'}
          {card.rewardType === 'command_unlocked' && 'コマンド獲得！'}
          {card.rewardType === 'command_evolved' && 'コマンド進化！'}
        </div>

        {cfg.haloRing && !reduced && <div className="reward-card__halo" />}
        {!reduced &&
          Array.from({ length: cfg.particleCount }).map((_, i) => (
            <span key={i} className="reward-card__particle" style={{ '--i': i, '--n': cfg.particleCount } as React.CSSProperties} />
          ))}
        {cfg.beamCount > 0 && !reduced && (
          <div className="reward-card__beams">
            {Array.from({ length: cfg.beamCount }).map((_, i) => (
              <span key={i} className="reward-card__beam" style={{ '--i': i, '--n': cfg.beamCount } as React.CSSProperties} />
            ))}
          </div>
        )}

        {card.rewardType === 'command_evolved' && (
          <div className="reward-card__evolution-chain">
            <span className="reward-card__evolution-old">
              {card.fromIcon} {card.fromName}
            </span>
            <span className="reward-card__evolution-arrow">↓</span>
          </div>
        )}

        <div className="reward-card__icon" style={{ color: card.color }}>
          {card.icon}
        </div>
        <div className="reward-card__name">{card.name}</div>
        <div className="reward-card__meta">
          <span className="chip" style={{ color: RARITY_COLORS[card.rarity], borderColor: RARITY_COLORS[card.rarity] }}>
            {rarityLabel(card.rarity)}
          </span>
          <span className="chip">{card.categoryLabel}</span>
        </div>
        <p className="reward-card__desc">{card.description}</p>

        {card.rewardType === 'part_acquired' && (
          <div className="reward-card__stats">
            <span>🔌 接続コスト {card.connectionCost}</span>
          </div>
        )}

        {card.rewardType !== 'part_acquired' && (
          <div className="reward-card__stats">
            <span>💧代謝{card.metabolismCost}</span>
            <span>⏱CD{card.cooldownSeconds}秒</span>
          </div>
        )}

        {card.rewardType === 'command_evolved' && card.changeHighlights && card.changeHighlights.length > 0 && (
          <ul className="reward-card__changes">
            {card.changeHighlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}

        {isAutoRetainedEvolution && (
          <>
            <p className="muted reward-card__auto-note">装備中のコマンドとして自動的に反映されます。</p>
            <button className="btn btn--primary btn--block" onClick={next}>
              OK
            </button>
          </>
        )}

        {needsEquipChoice && swapTarget === null && (
          <div className="reward-card__actions">
            {emptySlotIndex >= 0 ? (
              <button className="btn btn--primary btn--block" onClick={() => equipToSlot(emptySlotIndex)}>
                空き枠へ装備
              </button>
            ) : (
              <>
                <p className="reward-card__swap-hint">どのコマンドと入れ替えますか？</p>
                <div className="reward-card__slot-picker">
                  {state.commandLoadout.map((familyId, i) => (
                    <SlotChip key={i} familyId={familyId} card={card} onPick={() => setSwapTarget(i)} />
                  ))}
                </div>
              </>
            )}
            <button className="btn btn--ghost btn--block" onClick={next}>
              あとで変更
            </button>
          </div>
        )}

        {needsEquipChoice && swapTarget !== null && (
          <SwapConfirm slotIndex={swapTarget} card={card} onConfirm={() => equipToSlot(swapTarget)} onCancel={() => setSwapTarget(null)} />
        )}

        {card.rewardType === 'part_acquired' && (
          <button className="btn btn--primary btn--block" onClick={next}>
            つぎへ ▶
          </button>
        )}
      </div>
    </div>
  );
}

function useEquippedCommandLabel(familyId: string | null): string {
  const { state } = useGame();
  return useMemo(() => {
    if (!familyId) return '空き';
    const cmd = resolveFamilyBestCommand(familyId, equippedDefs(state));
    return cmd ? `${cmd.icon} ${cmd.name}` : familyId;
  }, [familyId, state]);
}

function SlotChip({
  familyId,
  card,
  onPick,
}: {
  familyId: string | null;
  card: RewardCard;
  onPick: () => void;
}) {
  const label = useEquippedCommandLabel(familyId);
  return (
    <button className="btn btn--small reward-card__slot-chip" onClick={onPick}>
      {label} → {card.icon}
      {card.name}
    </button>
  );
}

// TEST18: 以前は入れ替え前後の能力を2カラムで並べる冗長な比較表示だったが、
// 「最終的に何がどう変わるか」だけ分かれば十分なため、1行のサマリー+変化点の
// 箇条書きだけに簡略化した。
function SwapConfirm({
  slotIndex,
  card,
  onConfirm,
  onCancel,
}: {
  slotIndex: number;
  card: RewardCard;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { state } = useGame();
  const fromFamilyId = state.commandLoadout[slotIndex];
  const fromCmd = fromFamilyId ? resolveFamilyBestCommand(fromFamilyId, equippedDefs(state)) : null;
  const toCmd = getCommandDef(card.itemId);
  const changes = fromCmd && toCmd ? describeCommandEvolutionChanges(fromCmd, toCmd) : [];

  return (
    <div className="reward-card__swap-confirm">
      <div className="reward-card__swap-summary">
        {fromCmd ? (
          <>
            {fromCmd.icon} {fromCmd.name}
          </>
        ) : (
          '空き枠'
        )}
        <span className="reward-card__evolution-arrow"> → </span>
        {card.icon} {card.name}
      </div>

      {changes.length > 0 && (
        <ul className="reward-card__changes">
          {changes.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      <button className="btn btn--primary btn--block" onClick={onConfirm}>
        この内容で入れ替える
      </button>
      <button className="btn btn--ghost btn--block" onClick={onCancel}>
        キャンセル
      </button>
    </div>
  );
}
