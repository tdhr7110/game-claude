import { useMemo, useState } from 'react';
import { useGame } from '../GameContext';
import { equippedDefs, getCapacityInfo, getMaxHp } from '../../engine/run';
import { computeActiveSynergies } from '../../engine/synergyEngine';
import { computeModifiers } from '../../engine/modifiers';
import { PartCard } from './PartCard';
import { SynergyPanel } from './SynergyPanel';
import { ChimeraAvatar } from './ChimeraAvatar';

const DEFAULT_NAME = '名もなきキメラ';

export function ResultScreen() {
  const { state, dispatch, addNamedChimera } = useGame();
  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);
  const synergies = useMemo(() => computeActiveSynergies(eqDefs), [eqDefs]);
  const critChancePct = useMemo(() => Math.round(computeModifiers(eqDefs, synergies).critChance * 100), [eqDefs, synergies]);
  const maxHp = getMaxHp(state);
  const victory = state.resultOutcome === 'victory';

  const [nameInput, setNameInput] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);

  function handleSave() {
    const name = nameInput.trim() || DEFAULT_NAME;
    addNamedChimera({
      name,
      outcome: victory ? 'victory' : 'defeat',
      battleReached: state.battleIndex,
      icons: eqDefs.map((d) => d.icon),
    });
    setSavedName(name);
  }

  return (
    <div className="screen result-screen">
      <header className="screen__header">
        <h1>{victory ? '🏆 ラン勝利！最終ボスを撃破した' : '💀 ラン敗北…コアが機能を停止した'}</h1>
        <div className="muted">
          第{state.battleIndex}戦まで到達 ・ 最終HP {state.coreHp} / {maxHp} ・ 接続容量 {capacity.used}/{capacity.total}
        </div>
      </header>

      <ChimeraAvatar defs={eqDefs} />

      {!savedName && !skipped && (
        <div className="naming-box">
          <div className="naming-box__title">🏷️ このキメラに名前をつけますか？</div>
          <div className="naming-box__row">
            <input
              type="text"
              className="naming-box__input"
              placeholder={DEFAULT_NAME}
              maxLength={20}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <button className="btn btn--primary" onClick={handleSave}>
              名前をつける
            </button>
            <button className="btn btn--ghost" onClick={() => setSkipped(true)}>
              つけない
            </button>
          </div>
        </div>
      )}
      {savedName && (
        <div className="naming-box naming-box--done">✅「{savedName}」として図鑑に記録しました（戦闘準備画面の🏛️図鑑から確認できます）</div>
      )}

      <h2>最終ビルド（装着中の部位: {state.equipped.length}）</h2>
      <div className="part-grid">
        {eqDefs.map((def, i) => (
          <PartCard key={state.equipped[i].instanceId} def={def} cost={capacity.instanceCosts[state.equipped[i].instanceId]} />
        ))}
        {eqDefs.length === 0 && <p className="muted">装着部位なし</p>}
      </div>

      <h2>最終シナジー</h2>
      <SynergyPanel synergies={synergies} critChancePct={critChancePct} />

      <button className="btn btn--primary btn--large" onClick={() => dispatch({ type: 'RESET' })}>
        🔄 新しいランを開始する
      </button>
    </div>
  );
}
