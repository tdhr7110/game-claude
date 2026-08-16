import { useEffect, useState } from 'react';
import { useGame } from '../GameContext';
import { ALL_PARTS } from '../../data/parts';
import type { SpeedSetting } from '../../engine/battle';

export function DebugPanel() {
  const { state, dispatch, battleEngineRef } = useGame();
  const [open, setOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState(ALL_PARTS[0]?.id ?? '');

  useEffect(() => {
    document.body.classList.toggle('debug-open', open);
    return () => document.body.classList.remove('debug-open');
  }, [open]);

  function fullHeal() {
    const engine = battleEngineRef.current;
    if (state.phase === 'battle' && engine) engine.debugFullHeal();
    else dispatch({ type: 'DEBUG_FULL_HEAL' });
  }

  function killEnemy() {
    battleEngineRef.current?.debugKillEnemy();
  }

  function setSpeed(v: SpeedSetting) {
    battleEngineRef.current?.setSpeed(v);
  }

  function advance() {
    if (state.phase === 'prep') {
      dispatch({ type: 'ENTER_BATTLE' });
    } else if (state.phase === 'battle') {
      const engine = battleEngineRef.current;
      if (!engine) return;
      engine.debugKillEnemy();
      const result = engine.getStatus();
      if (result !== 'ongoing') {
        dispatch({ type: 'FINISH_BATTLE', result, finalHp: engine.getFinalPlayerHp() });
      }
    } else if (state.phase === 'drop') {
      dispatch({ type: 'SKIP_DROP' });
      dispatch({ type: 'NEXT_BATTLE' });
    }
  }

  if (!open) {
    return (
      <button className="debug-toggle" onClick={() => setOpen(true)}>
        🛠 デバッグ
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-panel__header">
        <span>🛠 デバッグパネル</span>
        <button className="btn btn--small" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>

      <div className="debug-panel__group">
        <label>任意の部位を取得</label>
        <div className="debug-panel__row">
          <select value={selectedPartId} onChange={(e) => setSelectedPartId(e.target.value)}>
            {ALL_PARTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_GRANT_PART', defId: selectedPartId })}>
            付与
          </button>
        </div>
      </div>

      <div className="debug-panel__group">
        <label>接続容量（永続ボーナス: {state.permanentCapacityBonus}）</label>
        <div className="debug-panel__row">
          <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_ADD_CAPACITY', delta: -1 })}>
            -1
          </button>
          <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_ADD_CAPACITY', delta: 1 })}>
            +1
          </button>
          <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_ADD_CAPACITY', delta: 5 })}>
            +5
          </button>
        </div>
      </div>

      <div className="debug-panel__group">
        <label>HP / 戦闘</label>
        <div className="debug-panel__row">
          <button className="btn btn--small" onClick={fullHeal}>
            HP全回復
          </button>
          <button className="btn btn--small" disabled={state.phase !== 'battle'} onClick={killEnemy}>
            敵を即時撃破
          </button>
        </div>
      </div>

      <div className="debug-panel__group">
        <label>ゲーム速度（戦闘中のみ）</label>
        <div className="debug-panel__row">
          {[0, 1, 2, 4].map((v) => (
            <button key={v} className="btn btn--small" disabled={state.phase !== 'battle'} onClick={() => setSpeed(v as SpeedSetting)}>
              {v === 0 ? '停止' : `${v}x`}
            </button>
          ))}
        </div>
      </div>

      <div className="debug-panel__group">
        <div className="debug-panel__row">
          <button className="btn btn--small" onClick={advance} disabled={state.phase === 'result'}>
            次の戦闘へ進む
          </button>
          <button className="btn btn--small btn--danger" onClick={() => dispatch({ type: 'RESET' })}>
            ランをリセット
          </button>
        </div>
      </div>

      <div className="debug-panel__group">
        <label>
          <input type="checkbox" checked={state.verboseLog} onChange={() => dispatch({ type: 'TOGGLE_VERBOSE' })} /> 戦闘計算ログの詳細表示（次戦闘から）
        </label>
      </div>

      <div className="debug-panel__group muted">
        フェーズ: {state.phase} / 戦闘番号: {state.battleIndex} / コアHP: {state.coreHp}
      </div>
    </div>
  );
}
