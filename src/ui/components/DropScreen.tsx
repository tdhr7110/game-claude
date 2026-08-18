import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs } from '../../engine/run';
import { previewCostForNewPart } from '../../engine/capacity';
import { getCapacityInfo } from '../../engine/run';
import { PartCard } from './PartCard';
import { PartDetailPanel } from './PartDetailPanel';
import { computeSynergyDelta } from '../synergyPreview';

export function DropScreen() {
  const { state, dispatch } = useGame();
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);

  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);

  const hasCandidates = state.dropCandidates.length > 0;
  const selectedDef = state.dropCandidates.find((d) => d.id === selectedDefId) ?? null;
  const compareWith = selectedDef ? eqDefs.filter((d) => d.type === selectedDef.type && d.id !== selectedDef.id) : [];
  const previewCost = selectedDef ? previewCostForNewPart(selectedDef, eqDefs) : 0;
  const canEquip = selectedDef ? previewCost <= capacity.free : false;
  const synergyDelta = useMemo(() => (selectedDef ? computeSynergyDelta(eqDefs, selectedDef) : []), [selectedDef, eqDefs]);

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
                  onClick={() => dispatch({ type: 'ACCEPT_DROP', defId: selectedDef.id, wantEquip: true })}
                >
                  すぐ装着する
                </button>
                <button
                  className="btn btn--block"
                  onClick={() => dispatch({ type: 'ACCEPT_DROP', defId: selectedDef.id, wantEquip: false })}
                >
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
