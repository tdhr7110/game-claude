import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import type { RunState } from '../../engine/run';
import { equippedDefs, getCapacityInfo, getMaxHp, battleSlotLabel, battleSlotLabelForIndex, BATTLE_SEQUENCE, TOTAL_BATTLES } from '../../engine/run';
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
import { CommandEditModal } from './CommandEditModal';

type PrepTab = 'status' | 'parts' | 'synergy';

const NAV_ITEMS: { id: PrepTab; icon: string; label: string }[] = [
  { id: 'status', icon: '❤️', label: 'ステータス' },
  { id: 'parts', icon: '🦴', label: '部位' },
  { id: 'synergy', icon: '⭐', label: 'シナジー' },
];

interface SelectedPart {
  instanceId: string;
  defId: string;
  source: 'equipped' | 'inventory';
}

export function PrepScreen() {
  const { state, dispatch, equipError, setEquipError, setShowIntro, chimeraGallery } = useGame();
  const [tab, setTab] = useState<PrepTab>('parts');
  const [selected, setSelected] = useState<SelectedPart | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [showCommandEdit, setShowCommandEdit] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const unseenCommandCount = state.unseenCommandIds.length;

  function openCommandEdit() {
    setShowCommandEdit(true);
    // 編集画面を開いて内容を確認したことをもってNEWバッジを解除する。
    if (unseenCommandCount > 0) dispatch({ type: 'MARK_COMMANDS_SEEN' });
  }

  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);
  const synergies = useMemo(() => computeActiveSynergies(eqDefs), [eqDefs]);
  const critChancePct = useMemo(() => Math.round(computeModifiers(eqDefs, synergies).critChance * 100), [eqDefs, synergies]);
  const maxHp = getMaxHp(state);
  const slotLabel = battleSlotLabel(state);

  const selectedDef = selected ? getPartDef(selected.defId) : null;
  const selectedCost = selected
    ? selected.source === 'equipped'
      ? capacity.instanceCosts[selected.instanceId]
      : previewCostForNewPart(selectedDef!, eqDefs)
    : undefined;
  const activeSynergyCount =
    Object.values(synergies.partType).reduce((n, g) => n + g.activeTiers.length, 0) +
    Object.values(synergies.species).reduce((n, g) => n + g.activeTiers.length, 0);

  function tryEquip(instanceId: string, cost: number) {
    if (cost > capacity.free) {
      setEquipError(`接続容量が足りません（必要${cost} / 空き${capacity.free}）。先に他の部位を取り外してください`);
      return;
    }
    setEquipError(null);
    dispatch({ type: 'EQUIP', instanceId });
    setSelected(null);
  }

  function unequip(instanceId: string) {
    dispatch({ type: 'UNEQUIP', instanceId });
    setEquipError(null);
    setSelected(null);
  }

  return (
    <div className="screen prep-screen">
      <header className="screen__header">
        <h1>🧬 第{state.battleIndex}戦 / 全{TOTAL_BATTLES}戦（{slotLabel}）</h1>
        <div className="header-right">
          <button className="btn btn--small btn--ghost" onClick={() => setShowIntro(true)} title="遊び方を表示">
            ❓
          </button>
          <button className="btn btn--small btn--ghost" onClick={() => setShowGallery(true)} title="記録したキメラを見る">
            🏛️{chimeraGallery.length > 0 ? `(${chimeraGallery.length})` : ''}
          </button>
          <button className="btn btn--small btn--ghost" onClick={() => setShowMenu(true)} title="その他のメニュー">
            ⋯
          </button>
        </div>
      </header>

      {showGallery && <ChimeraGalleryModal onClose={() => setShowGallery(false)} />}
      {showCommandEdit && <CommandEditModal onClose={() => setShowCommandEdit(false)} />}
      {showMenu && (
        <div className="modal-overlay" onClick={() => setShowMenu(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__header">
              <h2 style={{ margin: 0, fontSize: '1.1em' }}>☰ メニュー</h2>
              <button className="modal-card__close" onClick={() => setShowMenu(false)}>
                ✕
              </button>
            </div>
            <div className="prep-menu-list">
              <button
                className="btn"
                onClick={() => {
                  setShowMenu(false);
                  setShowIntro(true);
                }}
              >
                ❓ 遊び方を見る
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowMenu(false);
                  setShowGallery(true);
                }}
              >
                🏛️ キメラ図鑑を見る{chimeraGallery.length > 0 ? `（${chimeraGallery.length}体）` : ''}
              </button>
              <p className="muted">
                戦闘予定: {BATTLE_SEQUENCE.map((_s, i) => (i + 1 === state.battleIndex ? `【${battleSlotLabelForIndex(i + 1)}】` : '・')).join('')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="prep-hero">
        <ChimeraAvatar defs={eqDefs} />
        <div className="prep-hero__title">あなたのキメラ・Lv{state.equipped.length}部位</div>
        <CapacityBar used={capacity.used} total={capacity.total} />
        {equipError && <div className="error-banner">{equipError}</div>}
      </div>

      <div className="tab-panel">
        {tab === 'status' && (
          <StatusTab
            coreHp={state.coreHp}
            maxHp={maxHp}
            capacityUsed={capacity.used}
            capacityTotal={capacity.total}
            critChancePct={critChancePct}
            equippedCount={state.equipped.length}
            activeSynergyCount={activeSynergyCount}
          />
        )}

        {tab === 'parts' && (
          <PartsTab
            state={state}
            eqDefs={eqDefs}
            capacity={capacity}
            selectedInstanceId={selected?.instanceId ?? null}
            onSelectEquipped={(instanceId, defId) => setSelected({ instanceId, defId, source: 'equipped' })}
            onSelectInventory={(instanceId, defId) => setSelected({ instanceId, defId, source: 'inventory' })}
          />
        )}

        {tab === 'synergy' && <SynergyPanel synergies={synergies} critChancePct={critChancePct} />}
      </div>

      {selectedDef && selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-card__header">
              <h2 style={{ margin: 0, fontSize: '1em' }}>部位の詳細</h2>
              <button className="modal-card__close" onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <PartDetailPanel
              def={selectedDef}
              cost={selectedCost}
              actions={
                selected.source === 'equipped' ? (
                  <button className="btn btn--danger btn--block" onClick={() => unequip(selected.instanceId)}>
                    取り外す
                  </button>
                ) : (
                  <button
                    className="btn btn--primary btn--block"
                    disabled={(selectedCost ?? 0) > capacity.free}
                    onClick={() => tryEquip(selected.instanceId, selectedCost ?? 0)}
                  >
                    装着する
                  </button>
                )
              }
            />
          </div>
        </div>
      )}

      <div className="sticky-cta">
        <button className="btn btn--primary btn--large btn--block" onClick={() => dispatch({ type: 'ENTER_ENEMY_SELECT' })}>
          ⚔️ 次の戦闘を開始する
        </button>
      </div>

      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`bottom-nav__item${tab === item.id ? ' bottom-nav__item--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        ))}
        <button
          className={`bottom-nav__item${unseenCommandCount > 0 ? ' bottom-nav__item--attention' : ''}`}
          onClick={openCommandEdit}
        >
          <span className="bottom-nav__icon">
            ⚡
            {unseenCommandCount > 0 && <span className="bottom-nav__badge">{unseenCommandCount > 9 ? '9+' : unseenCommandCount}</span>}
          </span>
          <span className="bottom-nav__label">コマンド</span>
        </button>
      </nav>
    </div>
  );
}

function StatusTab({
  coreHp,
  maxHp,
  capacityUsed,
  capacityTotal,
  critChancePct,
  equippedCount,
  activeSynergyCount,
}: {
  coreHp: number;
  maxHp: number;
  capacityUsed: number;
  capacityTotal: number;
  critChancePct: number;
  equippedCount: number;
  activeSynergyCount: number;
}) {
  return (
    <div className="section-card">
      <div className="hp-readout" title="コアHPが0になると敗北です。勝利するまで戦闘間で持ち越されます">
        ❤️ コアHP {coreHp} / {maxHp}
      </div>
      <div className="prep-status-grid">
        <div className="prep-status-tile">
          <div className="prep-status-tile__value">
            {capacityUsed} / {capacityTotal}
          </div>
          <div className="prep-status-tile__label">🔗 接続容量</div>
        </div>
        <div className="prep-status-tile">
          <div className="prep-status-tile__value">{critChancePct}%</div>
          <div className="prep-status-tile__label">💥 会心率</div>
        </div>
        <div className="prep-status-tile">
          <div className="prep-status-tile__value">{equippedCount}</div>
          <div className="prep-status-tile__label">🦴 装着部位数</div>
        </div>
        <div className="prep-status-tile">
          <div className="prep-status-tile__value">{activeSynergyCount}</div>
          <div className="prep-status-tile__label">⭐ 発動中シナジー</div>
        </div>
      </div>
    </div>
  );
}

function PartsTab({
  state,
  eqDefs,
  capacity,
  selectedInstanceId,
  onSelectEquipped,
  onSelectInventory,
}: {
  state: RunState;
  eqDefs: ReturnType<typeof equippedDefs>;
  capacity: ReturnType<typeof getCapacityInfo>;
  selectedInstanceId: string | null;
  onSelectEquipped: (instanceId: string, defId: string) => void;
  onSelectInventory: (instanceId: string, defId: string) => void;
}) {
  return (
    <>
      <div className="prep-part-section">
        <div className="prep-part-section__head">
          <h2>装着中（{state.equipped.length}）</h2>
        </div>
        <div className="part-grid">
          {state.equipped.map((item) => {
            const def = getPartDef(item.defId);
            return (
              <PartCard
                key={item.instanceId}
                def={def}
                compact
                cost={capacity.instanceCosts[item.instanceId]}
                selected={selectedInstanceId === item.instanceId}
                onClick={() => onSelectEquipped(item.instanceId, item.defId)}
              />
            );
          })}
          {state.equipped.length === 0 && <p className="muted">何も装着していません</p>}
        </div>
      </div>

      <div className="prep-part-section">
        <div className="prep-part-section__head">
          <h2>インベントリ（{state.inventory.length}）</h2>
        </div>
        <div className="part-grid">
          {state.inventory.map((item) => {
            const def = getPartDef(item.defId);
            const cost = previewCostForNewPart(def, eqDefs);
            const canEquip = cost <= capacity.free;
            return (
              <PartCard
                key={item.instanceId}
                def={def}
                compact
                cost={cost}
                disabled={!canEquip}
                selected={selectedInstanceId === item.instanceId}
                onClick={() => onSelectInventory(item.instanceId, item.defId)}
              />
            );
          })}
          {state.inventory.length === 0 && <p className="muted">インベントリは空です</p>}
        </div>
      </div>
    </>
  );
}
