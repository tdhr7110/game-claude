import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { BattleEngine, type BattleSnapshot, type CombatantSnapshot, type CommandSlotSnapshot, type SpeedSetting } from '../../engine/battle';
import { getPartDef } from '../../data/parts';
import { CORE_HP_BASE, BASE_DEFENSE, getCapacityInfo, TOTAL_BATTLES } from '../../engine/run';
import { ChimeraAvatar } from './ChimeraAvatar';
import { CapacityBar } from './CapacityBar';
import { formatBigNumber } from '../format';
import '../commandSystem.css';

const SPEED_OPTIONS: SpeedSetting[] = [0, 1, 2, 4];

const EFFECT_KIND_ICONS: Record<string, string> = {
  attack_speed: '💨',
  crit: '👁️',
  damage_reduction: '🛡️',
  reflect: '🔰',
  vulnerability: '💥',
  poison_on_hit: '🧬',
  stun: '🕸️',
  heal_over_time: '💓',
};

function HpBar({ hp, maxHp, color, shield }: { hp: number; maxHp: number; color: string; shield?: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="hp-bar">
      <div className="hp-bar__fill" style={{ width: `${pct}%`, background: color }} />
      <div className="hp-bar__label">
        {hp} / {maxHp}
        {shield ? ` (+🛡️${shield})` : ''}
      </div>
    </div>
  );
}

function StatusRow({ c }: { c: CombatantSnapshot }) {
  if (c.poison === 0 && !c.burn) return null;
  return (
    <div className="status-row">
      {c.poison > 0 && <span className="status-badge status-badge--poison">☠️毒{c.poison}</span>}
      {c.burn && (
        <span className="status-badge status-badge--burn">
          🔥炎上{Math.round(c.burn.dps * 10) / 10}/秒(残{Math.round(c.burn.timeLeft * 10) / 10}s)
        </span>
      )}
    </div>
  );
}

function EffectBadges({ effects }: { effects: CombatantSnapshot['activeEffects'] }) {
  if (effects.length === 0) return null;
  return (
    <div className="cmd-effect-badges">
      {effects.map((e) => (
        <span key={e.key} className="cmd-effect-badge" title={e.sourceName}>
          {EFFECT_KIND_ICONS[e.kind] ?? '✨'} {e.sourceName} {e.remaining}s
        </span>
      ))}
    </div>
  );
}

function CombatantStatsMini({ c }: { c: CombatantSnapshot }) {
  return (
    <div className="battle-stage__stats-mini muted">
      🛡️{c.defense} ・ 📉{c.damageReductionPct}% ・ 💨{c.evasionPct}%
      {c.critPct > 0 && ` ・ 💥${c.critPct}%`} ・ ⚔️与ダメ{c.stats.damageDealt} ・ 💚回復{c.stats.healed}
      {c.stats.critCount > 0 && ` ・ 💥会心×${c.stats.critCount}`}
    </div>
  );
}

function MetabolismBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="metabolism-bar" title="代謝ゲージ: 時間経過・攻撃命中で回復し、コマンド発動に消費する">
      <div className="metabolism-bar__fill" style={{ width: `${pct}%` }} />
      <div className="metabolism-bar__label">
        💧代謝 {current} / {max}
      </div>
    </div>
  );
}

function CommandButton({ slot, glow, onUse }: { slot: CommandSlotSnapshot | null; glow: boolean; onUse: () => void }) {
  if (!slot) {
    return (
      <button className="cmd-button cmd-button--empty" disabled>
        <span className="muted">空き枠</span>
      </button>
    );
  }
  const cdActive = slot.cooldownRemaining > 0;
  const gaugeShort = !slot.affordable && !cdActive;
  return (
    <button
      className={`cmd-button${slot.usable ? ' cmd-button--usable' : ''}${gaugeShort ? ' cmd-button--nogauge' : ''}${glow ? ' cmd-button--glow' : ''}`}
      style={{ ['--command-color' as string]: slot.color, ['--command-glow' as string]: `${slot.color}66`, borderColor: slot.color }}
      disabled={!slot.usable}
      onClick={onUse}
      title={slot.description}
    >
      <span className="cmd-button__icon" style={{ color: slot.color }}>
        {slot.icon}
      </span>
      <span className="cmd-button__name">{slot.name}</span>
      <span className="cmd-button__cost">💧{slot.metabolismCost}</span>
      {cdActive && <div className="cmd-button__cd-overlay">{Math.ceil(slot.cooldownRemaining)}</div>}
    </button>
  );
}

function ResultBreakdown({ snapshot }: { snapshot: BattleSnapshot }) {
  const r = snapshot.resultStats;
  return (
    <div className="battle-result-breakdown">
      <div className="battle-result-breakdown__title">📊 戦闘結果の内訳</div>
      <div className="battle-result-breakdown__grid">
        <span>⏱️戦闘時間</span>
        <span>{r.timeSeconds}秒</span>
        <span>⚔️オート総ダメージ</span>
        <span>{formatBigNumber(r.autoDamage)}</span>
        <span>⚡コマンド総ダメージ</span>
        <span>{formatBigNumber(r.commandDamage)}</span>
        <span>☠️状態異常総ダメージ</span>
        <span>{formatBigNumber(r.statusDamage)}</span>
        <span>💚総回復量</span>
        <span>{formatBigNumber(r.healed)}</span>
        <span>💥最大単発ダメージ</span>
        <span>{formatBigNumber(r.maxSingleHit)}</span>
        <span>🏆最も活躍したコマンド</span>
        <span>{r.mostDamagingCommandName ?? '—'}</span>
      </div>
    </div>
  );
}

function PartActivityList({ label, parts }: { label: string; parts: CombatantSnapshot['parts'] }) {
  return (
    <div className="part-activity-list">
      <div className="part-activity-list__label">{label}</div>
      {parts.length === 0 && <p className="muted">攻撃・パッシブ部位なし</p>}
      {parts.map((p) => (
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
  );
}

export function BattleScreen() {
  const { state, dispatch, battleEngineRef, battleResetSignal } = useGame();
  const [snapshot, setSnapshot] = useState<BattleSnapshot | null>(null);
  const [glowSlot, setGlowSlot] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const avatarDefs = useMemo(() => state.equipped.map((i) => getPartDef(i.defId)), [state.equipped]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);

  useEffect(() => {
    if (!state.currentEnemy) return;
    const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
    const freeCapacity = getCapacityInfo(state).free;
    const engine = new BattleEngine(
      { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE, freeCapacity },
      state.currentEnemy,
      state.battleIndex,
      { verbose: state.verboseLog, commandFamilyIds: state.commandLoadout }
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
  }, [state.battleIndex, state.currentEnemy, battleResetSignal]);

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

  function activateCommand(slotIndex: number) {
    const engine = battleEngineRef.current;
    if (!engine) return;
    const result = engine.useCommand(slotIndex);
    if (result.ok) {
      setGlowSlot(slotIndex);
      setTimeout(() => setGlowSlot((s) => (s === slotIndex ? null : s)), 450);
    }
    setSnapshot(engine.getSnapshot());
  }

  const enemyDef = state.currentEnemy;

  return (
    <div className="screen battle-screen-v2">
      <header className="screen__header battle-header-v2">
        <h1>⚔️ 第{snapshot.battleIndex}戦 / 全{TOTAL_BATTLES}戦</h1>
        <div className="battle-header-v2__right">
          <span className="muted">{snapshot.time.toFixed(1)}秒</span>
        </div>
      </header>

      <div className="battle-stage">
        <div className="battle-stage__enemy-row">
          <div className="battle-stage__name">
            {enemyDef?.icon} {snapshot.enemy.name} {snapshot.enemy.isDead && <span className="danger-text">（撃破）</span>}
          </div>
          <HpBar hp={snapshot.enemy.hp} maxHp={snapshot.enemy.maxHp} color="#f87171" shield={snapshot.enemy.shieldValue} />
          <StatusRow c={snapshot.enemy} />
          <EffectBadges effects={snapshot.enemy.activeEffects} />
        </div>

        <div className="battle-stage__arena">
          <div className="battle-stage__enemy-figure">
            <div
              className="cmd-enemy-figure"
              style={{ background: `radial-gradient(circle, ${enemyDef?.color ?? '#7c3aed'}33, transparent 70%)` }}
            >
              <span style={{ opacity: snapshot.enemy.isDead ? 0.35 : 1 }}>{enemyDef?.icon ?? '👹'}</span>
            </div>
          </div>

          {snapshot.commandsEnabled && snapshot.lastCommandEvent && (
            <div key={snapshot.lastCommandEvent.time} className={`cmd-stage-banner cmd-stage-banner--${snapshot.lastCommandEvent.category}`}>
              {snapshot.lastCommandEvent.name}
            </div>
          )}

          <div className="battle-stage__player-figure">
            <ChimeraAvatar defs={avatarDefs} size="sm" />
          </div>

          {snapshot.status !== 'ongoing' && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ textAlign: 'center' }}>
                <div className="battle-overlay__title">{snapshot.status === 'won' ? '🎉 勝利！' : '💀 敗北…'}</div>
                <ResultBreakdown snapshot={snapshot} />
                <button className="btn btn--primary btn--large btn--block" onClick={handleContinue}>
                  続ける
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="battle-stage__player-row">
          <div className="battle-stage__name">
            🧬 {snapshot.player.name} {snapshot.player.isDead && <span className="danger-text">（機能停止）</span>}
          </div>
          <HpBar hp={snapshot.player.hp} maxHp={snapshot.player.maxHp} color="#4ade80" shield={snapshot.player.shieldValue} />
          <StatusRow c={snapshot.player} />
          <EffectBadges effects={snapshot.player.activeEffects} />
        </div>
      </div>

      <div className="battle-bottom">
        <div className="battle-bottom__capacity">
          <CapacityBar used={capacity.used} total={capacity.total} compact />
        </div>

        {snapshot.commandsEnabled && (
          <div className="cmd-battle-panel">
            <MetabolismBar current={snapshot.metabolism.current} max={snapshot.metabolism.max} />
            <div className="cmd-grid-2x2">
              {snapshot.commandSlots.map((slot, i) => (
                <CommandButton key={i} slot={slot} glow={glowSlot === i} onUse={() => activateCommand(i)} />
              ))}
            </div>
          </div>
        )}

        <div className="battle-bottom__controls">
          <div className="speed-controls">
            速度:
            {SPEED_OPTIONS.map((s) => (
              <button key={s} className={`btn btn--small${snapshot.speed === s ? ' btn--active' : ''}`} onClick={() => setSpeed(s)}>
                {s === 0 ? '⏸' : `${s}x`}
              </button>
            ))}
          </div>
          <button className="btn btn--small" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? '詳細を閉じる ▲' : '詳細を見る ▼'}
          </button>
        </div>

        {showDetails && (
          <div className="battle-details">
            <CombatantStatsMini c={snapshot.player} />
            <CombatantStatsMini c={snapshot.enemy} />
            <div className="battle-details__stats">
              <PartActivityList label="自分の部位" parts={snapshot.player.parts} />
              <PartActivityList label="敵の部位" parts={snapshot.enemy.parts} />
            </div>
            <div className="battle-log">
              {snapshot.log.map((line) => (
                <div key={line} className="battle-log__line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
