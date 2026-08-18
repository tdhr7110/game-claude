import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { BattleEngine, type BattleSnapshot, type CombatantSnapshot, type CommandSnapshot, type SpeedSetting } from '../../engine/battle';
import { getPartDef } from '../../engine/adminStore';
import { CORE_HP_BASE, BASE_DEFENSE, getCapacityInfo, TOTAL_BATTLES } from '../../engine/run';
import { ChimeraAvatar } from './ChimeraAvatar';
import type { PartDef } from '../../data/types';

const SPEED_OPTIONS: SpeedSetting[] = [0, 1, 2, 4];

function HpBar({ hp, maxHp, color }: { hp: number; maxHp: number; color: string }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="hp-bar">
      <div className="hp-bar__fill" style={{ width: `${pct}%`, background: color }} />
      <div className="hp-bar__label">
        {hp} / {maxHp}
      </div>
    </div>
  );
}

// TEST2フェーズ2: 敵ギミックの予告・発動状態を、戦闘ログだけでなくキャラクター付近にも視覚的に表示する（要件19）
function GimmickIndicator({ c }: { c: CombatantSnapshot }) {
  if (!c.gimmick || c.gimmick.phase === 'idle') return null;
  const g = c.gimmick;
  const total = Math.max(0.01, g.phaseDurationSeconds);
  const elapsed = Math.max(0, total - g.timeLeft);
  const blocks = 5;
  const filled = Math.min(blocks, Math.round((elapsed / total) * blocks));
  const bar = '■'.repeat(filled) + '□'.repeat(blocks - filled);
  const icon = g.phase === 'telegraph' ? '⚠️' : g.kind === 'golem_fortify' ? '🛡️' : g.kind === 'insect_frenzy' ? '💢' : '🔥';
  return (
    <div className={`gimmick-indicator gimmick-indicator--${g.phase}`}>
      <div className="gimmick-indicator__label">
        {icon} {g.label}
      </div>
      <div className="gimmick-indicator__bar">{bar}</div>
      <div className="gimmick-indicator__time">{g.timeLeft.toFixed(1)} sec</div>
    </div>
  );
}

function CombatantPanel({ c, side, avatarDefs }: { c: CombatantSnapshot; side: 'player' | 'enemy'; avatarDefs?: PartDef[] }) {
  return (
    <div className={`combatant-panel combatant-panel--${side}`}>
      <div className="combatant-panel__name">
        {side === 'player' ? '🧬' : '👹'} {c.name} {c.isDead && <span className="danger-text">（撃破）</span>}
      </div>
      {avatarDefs && <ChimeraAvatar defs={avatarDefs} size="sm" />}
      <GimmickIndicator c={c} />
      <HpBar hp={c.hp} maxHp={c.maxHp} color={side === 'player' ? '#4ade80' : '#f87171'} />
      <div className="combatant-panel__row">
        <span title="防御力">🛡️{c.defense}</span>
        <span title="被ダメージ軽減率">
          📉{c.damageReductionPct}
          {c.tempDamageReductionPct > 0 ? `+${c.tempDamageReductionPct}` : ''}%
        </span>
        <span title="回避率">💨{c.evasionPct}%</span>
        {c.critPct > 0 && (
          <span title="会心率（頭・口・目の装着数で上昇）" className="crit-stat">
            💥{c.critPct}%
          </span>
        )}
        {c.tempAttackSpeedMult !== 1 && (
          <span title="攻撃速度倍率（暴走コマンド・狂乱ギミック等）" className={c.tempAttackSpeedMult > 1 ? 'crit-stat' : 'danger-text'}>
            ⏩×{c.tempAttackSpeedMult}
          </span>
        )}
      </div>
      <div className="combatant-panel__row">
        {c.poison > 0 && <span className="status-badge status-badge--poison">☠️毒{c.poison}</span>}
        {c.burn && (
          <span className="status-badge status-badge--burn">
            🔥炎上{Math.round(c.burn.dps * 10) / 10}/秒(残{Math.round(c.burn.timeLeft * 10) / 10}s)
          </span>
        )}
        {c.poison === 0 && !c.burn && <span className="muted">状態異常なし</span>}
      </div>
      <div className="combatant-panel__row">
        <span>⚔️与ダメ{c.stats.damageDealt}</span>
        <span>💚回復{c.stats.healed}</span>
        {c.stats.critCount > 0 && <span className="crit-stat">💥会心×{c.stats.critCount}</span>}
      </div>
      <div className="part-activity-list">
        {c.parts.length === 0 && <p className="muted">攻撃・パッシブ部位なし</p>}
        {c.parts.map((p) => (
          <div key={p.instanceId} className="part-activity">
            <span className="part-activity__icon">{p.icon}</span>
            <span className="part-activity__name">{p.name}</span>
            <div className="part-activity__bar">
              <div className="part-activity__bar-fill" style={{ width: `${p.progress * 100}%` }} />
            </div>
            <span className="part-activity__count">×{p.activations}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// TEST2フェーズ2: コマンドボタン。名前・使用可否・クールダウン残り・効果説明を最低限表示し（要件9）、
// 使用時はボタンの一時的な反応表示で「押した感」を出す（要件10。詳細は戦闘ログ側で確認できる）。
function CommandBar({
  commands,
  onUse,
  justUsedId,
}: {
  commands: CommandSnapshot[];
  onUse: (id: string) => void;
  justUsedId: string | null;
}) {
  if (commands.length === 0) return null;
  return (
    <div className="command-bar">
      {commands.map((c) => {
        const ready = c.cooldownRemaining <= 0;
        return (
          <button
            key={c.id}
            className={`command-btn${ready ? ' command-btn--ready' : ''}${justUsedId === c.id ? ' command-btn--flash' : ''}`}
            disabled={!ready}
            title={c.description}
            onClick={() => onUse(c.id)}
          >
            <span className="command-btn__icon">{c.icon}</span>
            <span className="command-btn__name">{c.name}</span>
            <span className="command-btn__status">{ready ? 'READY' : `残り${c.cooldownRemaining.toFixed(1)}秒`}</span>
            {justUsedId === c.id && <span className="command-btn__flash-text">使用！</span>}
          </button>
        );
      })}
    </div>
  );
}

export function BattleScreen() {
  const { state, dispatch, battleEngineRef } = useGame();
  const [snapshot, setSnapshot] = useState<BattleSnapshot | null>(null);
  const [justUsedId, setJustUsedId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const avatarDefs = useMemo(() => state.equipped.map((i) => getPartDef(i.defId)), [state.equipped]);

  useEffect(() => {
    if (!state.currentEnemy) return;
    const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
    const freeCapacity = getCapacityInfo(state).free;
    const engine = new BattleEngine(
      { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE, freeCapacity },
      state.currentEnemy,
      state.battleIndex,
      { verbose: state.verboseLog }
    );
    battleEngineRef.current = engine;
    setSnapshot(engine.getSnapshot());
    lastTimeRef.current = performance.now();

    function loop(now: number) {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      engine.tick(dt);
      setSnapshot(engine.getSnapshot());
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      battleEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.battleIndex, state.currentEnemy]);

  if (!snapshot) return <div className="screen">戦闘を準備中...</div>;

  function setSpeed(v: SpeedSetting) {
    battleEngineRef.current?.setSpeed(v);
    setSnapshot(battleEngineRef.current?.getSnapshot() ?? snapshot);
  }

  function handleContinue() {
    if (!battleEngineRef.current) return;
    const result = battleEngineRef.current.getStatus();
    if (result === 'ongoing') return;
    dispatch({ type: 'FINISH_BATTLE', result, finalHp: battleEngineRef.current.getFinalPlayerHp() });
  }

  function handleUseCommand(id: string) {
    if (!battleEngineRef.current) return;
    const res = battleEngineRef.current.useCommand(id);
    if (res.ok) {
      setJustUsedId(id);
      setTimeout(() => setJustUsedId((cur) => (cur === id ? null : cur)), 700);
    }
    setSnapshot(battleEngineRef.current.getSnapshot());
  }

  return (
    <div className="screen battle-screen">
      <header className="screen__header">
        <h1>⚔️ 第{snapshot.battleIndex}戦 / 全{TOTAL_BATTLES}戦</h1>
        <div className="muted">経過時間 {snapshot.time.toFixed(1)}秒</div>
      </header>

      <div className="battle-layout">
        <CombatantPanel c={snapshot.player} side="player" avatarDefs={avatarDefs} />
        <div className="battle-center">
          <div className="battle-center__vs">VS</div>
          {snapshot.status !== 'ongoing' && (
            <div className="battle-overlay">
              <div className="battle-overlay__title">{snapshot.status === 'won' ? '🎉 勝利！' : '💀 敗北…'}</div>
              <button className="btn btn--primary btn--large" onClick={handleContinue}>
                続ける
              </button>
            </div>
          )}
        </div>
        <CombatantPanel c={snapshot.enemy} side="enemy" />
      </div>

      <CommandBar commands={snapshot.commands} onUse={handleUseCommand} justUsedId={justUsedId} />

      <footer className="battle-footer">
        <div className="speed-controls">
          速度:
          {SPEED_OPTIONS.map((s) => (
            <button key={s} className={`btn btn--small${snapshot.speed === s ? ' btn--active' : ''}`} onClick={() => setSpeed(s)}>
              {s === 0 ? '⏸ 一時停止' : `${s}x`}
            </button>
          ))}
        </div>
        <div className="battle-log">
          {snapshot.log.map((line) => (
            <div key={line} className="battle-log__line">
              {line}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
