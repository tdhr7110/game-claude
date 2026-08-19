import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { acceptDrop, equippedDefs } from '../../engine/run';
import { previewCostForNewPart } from '../../engine/capacity';
import { getCapacityInfo } from '../../engine/run';
import { PartCard } from './PartCard';
import { PartDetailPanel } from './PartDetailPanel';
import { computeSynergyDelta } from '../synergyPreview';
import { detectCommandChanges } from '../../engine/commandRewards';
import { buildCommandRewardCard, buildPartAcquiredCard } from '../rewardCardBuilders';
import { getPartDef } from '../../data/parts';

export function DropScreen() {
  const { state, dispatch, pushRewardCards, triggerHint } = useGame();
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);

  useEffect(() => {
    if (state.dropCandidates.length > 0) triggerHint('first_part');
  }, [state.dropCandidates.length, triggerHint]);

  // 部位獲得を確定し、同じ操作の中で新しく解放・進化したコマンドを判定して
  // 報酬演出キューへ積む。既存のacceptDrop()自体は純粋関数なので、実際にdispatchする前に
  // 同じ入力で一度呼び、変化前後の装着部位を比較するためだけに使う(判定ロジックの重複実装はしない)。
  function handleAccept(defId: string, wantEquip: boolean) {
    const before = eqDefs;
    const preview = acceptDrop(state, defId, wantEquip);
    const after = equippedDefs(preview.state);
    // 一度でも確認済み(knownCommandIds)のcommandIdは、部位の付け外しで再び同じ組み合わせに
    // 戻っても「新規」として扱わない(演出の二重発生防止)。
    const changes = detectCommandChanges(before, after, state.commandLoadout).filter(
      (c) => !state.knownCommandIds.includes(c.to.commandId)
    );

    const cards = [buildPartAcquiredCard(getPartDef(defId)), ...changes.map((c) => buildCommandRewardCard(c, after))];
    dispatch({ type: 'ACCEPT_DROP', defId, wantEquip });
    if (changes.length > 0) {
      dispatch({ type: 'RECORD_COMMAND_DISCOVERIES', commandIds: changes.map((c) => c.to.commandId) });
    }
    pushRewardCards(cards);
  }

  const hasCandidates = state.dropCandidates.length > 0;
  const selectedDef = state.dropCandidates.find((d) => d.id === selectedDefId) ?? null;
  const compareWith = selectedDef ? eqDefs.filter((d) => d.type === selectedDef.type && d.id !== selectedDef.id) : [];
  const previewCost = selectedDef ? previewCostForNewPart(selectedDef, eqDefs) : 0;
  const canEquip = selectedDef ? previewCost <= capacity.free : false;
  const synergyDelta = useMemo(() => (selectedDef ? computeSynergyDelta(eqDefs, selectedDef) : []), [selectedDef, eqDefs]);

  useEffect(() => {
    if (selectedDef && !canEquip) triggerHint('capacity_over');
  }, [selectedDef, canEquip, triggerHint]);

  if (!hasCandidates) {
    return (
      <div className="screen drop-screen">
        <header className="screen__header">
          <h1>🎁 部位を獲得</h1>
        </header>
        <p>部位の選択が完了しました。準備が整ったら次の戦闘へ進みましょう。</p>
        <button className="btn btn--primary btn--large" onClick={() => dispatch({ type: 'NEXT_BATTLE' })}>
          次の戦闘へ進む ➡️
        </button>
      </div>
    );
  }

  return (
    <div className="screen drop-screen">
      <header className="screen__header">
        <h1>🎁 部位を獲得 — 1個選んでください</h1>
      </header>
      <div className="drop-candidates">
        {state.dropCandidates.map((def) => (
          <PartCard
            key={def.id}
            def={def}
            badge={def.rarity === 'rare' ? '★' : undefined}
            selected={selectedDefId === def.id}
            onClick={() => setSelectedDefId(def.id)}
          />
        ))}
      </div>

      {selectedDef && (
        <div className="drop-detail">
          <PartDetailPanel
            def={selectedDef}
            cost={previewCost}
            compareWith={compareWith}
            synergyDelta={synergyDelta}
            actions={
              <div className="drop-actions">
                <button
                  className="btn btn--primary btn--large btn--block"
                  disabled={!canEquip}
                  title={!canEquip ? `接続容量が足りません（必要${previewCost} / 空き${capacity.free}）` : undefined}
                  onClick={() => handleAccept(selectedDef.id, true)}
                >
                  すぐ装着する
                </button>
                <button className="btn btn--block" onClick={() => handleAccept(selectedDef.id, false)}>
                  インベントリに保管する
                </button>
                <button className="btn btn--ghost btn--block" onClick={() => dispatch({ type: 'SKIP_DROP' })}>
                  どれも受け取らない
                </button>
              </div>
            }
          />
          {!canEquip && (
            <p className="error-banner">接続容量が足りないため装着できません（必要{previewCost} / 空き{capacity.free}）。保管して後で入れ替えられます。</p>
          )}
        </div>
      )}

      {!selectedDef && (
        <button className="btn btn--ghost" onClick={() => dispatch({ type: 'SKIP_DROP' })}>
          どれも受け取らない
        </button>
      )}
    </div>
  );
}
