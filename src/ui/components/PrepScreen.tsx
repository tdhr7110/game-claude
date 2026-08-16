import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs, getCapacityInfo, getMaxHp, tierOfCurrentBattle, BATTLE_SEQUENCE, TOTAL_BATTLES } from '../../engine/run';
import { getPartDef } from '../../data/parts';
import { computeActiveSynergies } from '../../engine/synergyEngine';
import { computeModifiers } from '../../engine/modifiers';
import { previewCostForNewPart } from '../../engine/capacity';
import { PartCard } from './PartCard';
import { PartDetailPanel } from './PartDetailPanel';
import { CapacityBar } from './CapacityBar';
import { SynergyPanel } from './SynergyPanel';
import { ChimeraAvatar } from './ChimeraAvatar';
import { ChimeraGalleryModal } from './ChimeraGalleryModal';

const SLOT_LABEL: Record<string, string> = { normal: '通常戦', elite: '強敵戦', miniboss: '中ボス戦', boss: '最終ボス戦' };

export function PrepScreen() {
  const { state, dispatch, equipError, setEquipError, setShowIntro, chimeraGallery } = useGame();
  const [selectedDefId, setSelectedDefId] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);
  const synergies = useMemo(() => computeActiveSynergies(eqDefs), [eqDefs]);
  const critChancePct = useMemo(() => Math.round(computeModifiers(eqDefs, synergies).critChance * 100), [eqDefs, synergies]);
  const maxHp = getMaxHp(state);
  const slot = tierOfCurrentBattle(state);

  const selectedDef = selectedDefId ? getPartDef(selectedDefId) : null;
  const selectedEquippedInstance = state.equipped.find((i) => i.defId === selectedDefId);
  const selectedCost = selectedDef
    ? selectedEquippedInstance
      ? capacity.instanceCosts[selectedEquippedInstance.instanceId]
      : previewCostForNewPart(selectedDef, eqDefs)
    : undefined;

  function tryEquip(instanceId: string, cost: number) {
    if (cost > capacity.free) {
      setEquipError(`接続容量が足りません（必要${cost} / 空き${capacity.free}）。先に他の部位を取り外してください`);
      return;
    }
    setEquipError(null);
    dispatch({ type: 'EQUIP', instanceId });
  }

  return (
    <div className="screen prep-screen">
      <header className="screen__header">
        <h1>🧬 戦闘準備 — 第{state.battleIndex}戦 / 全{TOTAL_BATTLES}戦（{SLOT_LABEL[slot]}）</h1>
        <div className="header-right">
          <div className="hp-readout" title="コアHPが0になると敗北です。勝利するまで戦闘間で持ち越されます">
            ❤️ コアHP {state.coreHp} / {maxHp}
          </div>
          <button className="btn btn--small btn--ghost" onClick={() => setShowIntro(true)} title="遊び方を表示">
            ❓遊び方
          </button>
          <button className="btn btn--small btn--ghost" onClick={() => setShowGallery(true)} title="記録したキメラを見る">
            🏛️図鑑{chimeraGallery.length > 0 ? `(${chimeraGallery.length})` : ''}
          </button>
        </div>
      </header>

      {showGallery && <ChimeraGalleryModal onClose={() => setShowGallery(false)} />}

      <div className="prep-layout">
        <div className="prep-col">
          <ChimeraAvatar defs={eqDefs} size="sm" />
          <CapacityBar used={capacity.used} total={capacity.total} />
          {equipError && <div className="error-banner">{equipError}</div>}

          <h2>装着中の部位（{state.equipped.length}）</h2>
          <div className="part-grid">
            {state.equipped.map((item) => {
              const def = getPartDef(item.defId);
              return (
                <div key={item.instanceId} className="part-slot">
                  <PartCard
                    def={def}
                    cost={capacity.instanceCosts[item.instanceId]}
                    selected={selectedDefId === item.defId}
                    onClick={() => setSelectedDefId(item.defId)}
                  />
                  <button
                    className="btn btn--small"
                    onClick={() => {
                      dispatch({ type: 'UNEQUIP', instanceId: item.instanceId });
                      setEquipError(null);
                    }}
                  >
                    取り外す
                  </button>
                </div>
              );
            })}
            {state.equipped.length === 0 && <p className="muted">何も装着していません</p>}
          </div>

          <h2>インベントリ（{state.inventory.length}）</h2>
          <div className="part-grid">
            {state.inventory.map((item) => {
              const def = getPartDef(item.defId);
              const cost = previewCostForNewPart(def, eqDefs);
              const canEquip = cost <= capacity.free;
              return (
                <div key={item.instanceId} className="part-slot">
                  <PartCard def={def} cost={cost} selected={selectedDefId === item.defId} onClick={() => setSelectedDefId(item.defId)} />
                  <button className="btn btn--small" disabled={!canEquip} onClick={() => tryEquip(item.instanceId, cost)}>
                    装着する
                  </button>
                </div>
              );
            })}
            {state.inventory.length === 0 && <p className="muted">インベントリは空です</p>}
          </div>
        </div>

        <div className="prep-col prep-col--narrow">
          <h2>部位詳細</h2>
          {selectedDef ? (
            <PartDetailPanel def={selectedDef} cost={selectedCost} />
          ) : (
            <p className="muted">部位カードを選択すると詳細が表示されます</p>
          )}
          <h2>シナジー状況</h2>
          <SynergyPanel synergies={synergies} critChancePct={critChancePct} />
        </div>
      </div>

      <footer className="screen__footer">
        <div className="muted">
          戦闘予定: {BATTLE_SEQUENCE.map((s, i) => (i + 1 === state.battleIndex ? `【${SLOT_LABEL[s]}】` : '・')).join('')}
        </div>
        <button className="btn btn--primary btn--large" onClick={() => dispatch({ type: 'ENTER_BATTLE' })}>
          ⚔️ 次の戦闘を開始する
        </button>
      </footer>
    </div>
  );
}
