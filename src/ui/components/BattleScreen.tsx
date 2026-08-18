import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { BattleEngine, type BattleEvent, type BattleSnapshot, type CombatantSnapshot, type CommandSnapshot, type SpeedSetting } from '../../engine/battle';
import { getPartDef } from '../../engine/adminStore';
import { CORE_HP_BASE, BASE_DEFENSE, getCapacityInfo, TOTAL_BATTLES } from '../../engine/run';
import { BattleFigure, dominantSpeciesColor, groupCountByType, figureArmsFromSnapshot } from './BattleFigure';
import { FloatingNumbers, HitCounter, SynergyToastList, type Floater, type SynergyToast } from './BattleEffects';
import { CapacityBar } from './CapacityBar';
import { playSE, getSESettings, setSEEnabled, setSEVolume, subscribeSESettings } from '../../engine/soundManager';
import { COMMAND_COLORS } from '../format';

const SPEED_OPTIONS: SpeedSetting[] = [0, 1, 2, 4];
const FLOATER_TTL_MS = 1100;
const TOAST_TTL_MS = 1500;
const FLOATER_CAP_PER_FRAME = 14;
const FLOATER_MAX_ONSCREEN = 40;
const BIG_DAMAGE_THRESHOLD = 20;
const HIT_RESET_GAME_SECONDS = 1.2;

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

function GimmickBadge({ c }: { c: CombatantSnapshot }) {
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
        const colors = COMMAND_COLORS[c.id] ?? COMMAND_COLORS.default;
        return (
          <button
            key={c.id}
            className={`command-btn${ready ? ' command-btn--ready' : ''}${justUsedId === c.id ? ' command-btn--flash' : ''}`}
            style={{ ['--command-color' as string]: colors.color, ['--command-glow' as string]: colors.glow }}
            disabled={!ready}
            title={c.description}
            onClick={() => onUse(c.id)}
          >
            <span className="command-btn__icon">{c.icon}</span>
            <span className="command-btn__name">{c.name}</span>
            <span className="command-btn__status">{ready ? 'READY' : `${c.cooldownRemaining.toFixed(1)} sec`}</span>
            {justUsedId === c.id && <span className="command-btn__flash-text">使用！</span>}
          </button>
        );
      })}
    </div>
  );
}

function SoundSettings() {
  const [settings, setSettingsState] = useState(getSESettings());
  useEffect(() => subscribeSESettings(() => setSettingsState(getSESettings())), []);
  return (
    <div className="sound-settings">
      <button
        className={`btn btn--small${settings.enabled ? ' btn--active' : ''}`}
        onClick={() => setSEEnabled(!settings.enabled)}
        title="効果音のON/OFF"
      >
        {settings.enabled ? '🔊 SE ON' : '🔇 SE OFF'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume}
        onChange={(e) => setSEVolume(parseFloat(e.target.value))}
        disabled={!settings.enabled}
        className="sound-settings__volume"
        title="効果音の音量"
      />
    </div>
  );
}

function synergyGlowFor(snapshot: BattleSnapshot): 'poison' | 'fire' | 'defense' | null {
  if (snapshot.synergies.species.insect.activeTiers.length > 0) return 'poison';
  if (snapshot.synergies.species.dragon.activeTiers.length > 0) return 'fire';
  if (snapshot.synergies.partType.skin.activeTiers.length > 0) return 'defense';
  return null;
}

function activeSynergyLabels(snapshot: BattleSnapshot): string[] {
  const labels: string[] = [];
  for (const group of Object.values(snapshot.synergies.partType)) {
    for (const t of group.activeTiers) labels.push(t.description);
  }
  for (const group of Object.values(snapshot.synergies.species)) {
    for (const t of group.activeTiers) labels.push(t.description);
  }
  return labels;
}

export function BattleScreen() {
  const { state, dispatch, battleEngineRef } = useGame();
  const [snapshot, setSnapshot] = useState<BattleSnapshot | null>(null);
  const [justUsedId, setJustUsedId] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [shakeOn, setShakeOn] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const avatarDefs = useMemo(() => state.equipped.map((i) => getPartDef(i.defId)), [state.equipped]);
  const playerCounts = useMemo(() => groupCountByType(avatarDefs), [avatarDefs]);
  const playerColor = useMemo(() => dominantSpeciesColor(avatarDefs), [avatarDefs]);
  const capacity = useMemo(() => getCapacityInfo(state), [state]);

  const floatersRef = useRef<Floater[]>([]);
  const toastsRef = useRef<(SynergyToast & { createdAt: number })[]>([]);
  const playerPulsesRef = useRef<Record<string, number>>({});
  const enemyPulsesRef = useRef<Record<string, number>>({});
  const floaterIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const hitCountRef = useRef(0);
  const lastHitGameTimeRef = useRef(0);
  const lastGimmickPhaseRef = useRef<string | null>(null);

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
    floatersRef.current = [];
    toastsRef.current = [];
    playerPulsesRef.current = {};
    enemyPulsesRef.current = {};
    hitCountRef.current = 0;
    lastHitGameTimeRef.current = 0;
    lastGimmickPhaseRef.current = null;

    function spawnFloaterForAttack(e: Extract<BattleEvent, { type: 'attack' }>, now: number) {
      const kind = e.isFixed ? 'fixed' : e.isCrit ? 'crit' : e.damage >= BIG_DAMAGE_THRESHOLD ? 'big' : 'normal';
      floatersRef.current.push({
        id: ++floaterIdRef.current,
        side: e.targetSide,
        text: `${e.isFixed ? '固定' : ''}${e.damage}`,
        kind,
        createdAt: now,
        xPct: 25 + Math.random() * 50,
      });
    }

    function processEvents(events: BattleEvent[], gameTime: number) {
      if (events.length === 0) return;
      const now = performance.now();
      const attackEvents = events.filter((e): e is Extract<BattleEvent, { type: 'attack' }> => e.type === 'attack');

      const toShow = attackEvents.slice(0, FLOATER_CAP_PER_FRAME);
      const overflow = attackEvents.slice(FLOATER_CAP_PER_FRAME);
      for (const e of toShow) spawnFloaterForAttack(e, now);
      if (overflow.length > 0) {
        const bySide = new Map<'player' | 'enemy', { sum: number; count: number }>();
        for (const e of overflow) {
          const cur = bySide.get(e.targetSide) ?? { sum: 0, count: 0 };
          cur.sum += e.damage;
          cur.count += 1;
          bySide.set(e.targetSide, cur);
        }
        for (const [side, agg] of bySide) {
          floatersRef.current.push({ id: ++floaterIdRef.current, side, text: `+${agg.sum}(${agg.count}HIT)`, kind: 'merged', createdAt: now, xPct: 50 });
        }
      }

      let sawAlphaStrike = false;
      for (const e of attackEvents) {
        const pulses = e.side === 'player' ? playerPulsesRef.current : enemyPulsesRef.current;
        pulses[e.partInstanceId] = (pulses[e.partInstanceId] ?? 0) + 1;
        if (e.tag === 'alpha_strike') sawAlphaStrike = true;
        else if (e.isFixed) playSE('fixed');
        else if (e.isCrit) playSE('crit');
        else if (e.damage >= BIG_DAMAGE_THRESHOLD) playSE('hit_big');
        else playSE('hit');
      }
      if (sawAlphaStrike) {
        playSE('alpha_strike');
        setFlashOn(true);
        setTimeout(() => setFlashOn(false), 260);
        setShakeOn(true);
        setTimeout(() => setShakeOn(false), 260);
      }
      if (attackEvents.length > 0) {
        hitCountRef.current += attackEvents.length;
        lastHitGameTimeRef.current = gameTime;
      }

      for (const e of events) {
        if (e.type === 'evade') {
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.targetSide, text: 'MISS', kind: 'evade', createdAt: now, xPct: 25 + Math.random() * 50 });
        } else if (e.type === 'heal') {
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `+${e.amount}`, kind: 'heal', createdAt: now, xPct: 25 + Math.random() * 50 });
          playSE('heal');
        } else if (e.type === 'command') {
          playSE(e.id === 'guard' ? 'guard' : 'command');
        } else if (e.type === 'synergy') {
          toastsRef.current.push({ id: ++toastIdRef.current, label: e.label, side: e.side, createdAt: now });
          playSE('synergy');
        } else if (e.type === 'victory') {
          playSE('victory');
        } else if (e.type === 'defeat') {
          playSE('defeat');
        }
      }

      floatersRef.current = floatersRef.current.filter((f) => now - f.createdAt < FLOATER_TTL_MS).slice(-FLOATER_MAX_ONSCREEN);
      toastsRef.current = toastsRef.current.filter((t) => now - t.createdAt < TOAST_TTL_MS);
    }

    function loop(now: number) {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      engine.tick(dt);
      const snap = engine.getSnapshot();
      const events = engine.drainEvents();
      processEvents(events, snap.time);

      if (snap.time - lastHitGameTimeRef.current > HIT_RESET_GAME_SECONDS) hitCountRef.current = 0;
      const wallNow = performance.now();
      if (floatersRef.current.some((f) => wallNow - f.createdAt >= FLOATER_TTL_MS) || toastsRef.current.some((t) => wallNow - t.createdAt >= TOAST_TTL_MS)) {
        floatersRef.current = floatersRef.current.filter((f) => wallNow - f.createdAt < FLOATER_TTL_MS);
        toastsRef.current = toastsRef.current.filter((t) => wallNow - t.createdAt < TOAST_TTL_MS);
      }

      const gPhase = snap.enemy.gimmick?.phase ?? null;
      if (gPhase !== lastGimmickPhaseRef.current) {
        if (gPhase === 'telegraph') playSE('enemy_charge');
        else if (gPhase === 'active') playSE('hit_big');
        lastGimmickPhaseRef.current = gPhase;
      }

      setSnapshot(snap);
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

  const enemyDef = state.currentEnemy;
  const enemyArms = figureArmsFromSnapshot(snapshot.enemy);
  const playerArms = figureArmsFromSnapshot(snapshot.player);
  const glow = synergyGlowFor(snapshot);
  const synergyLabels = activeSynergyLabels(snapshot);

  return (
    <div className={`screen battle-screen-v2${shakeOn ? ' battle-screen-v2--shake' : ''}`}>
      <header className="screen__header battle-header-v2">
        <h1>⚔️ 第{snapshot.battleIndex}戦 / 全{TOTAL_BATTLES}戦</h1>
        <div className="battle-header-v2__right">
          <span className="muted">{snapshot.time.toFixed(1)}秒</span>
          <SoundSettings />
        </div>
      </header>

      <div className="battle-stage">
        <div className="battle-stage__enemy-row">
          <div className="battle-stage__enemy-info">
            <div className="battle-stage__name">
              {enemyDef?.icon} {snapshot.enemy.name} {snapshot.enemy.isDead && <span className="danger-text">（撃破）</span>}
            </div>
            <HpBar hp={snapshot.enemy.hp} maxHp={snapshot.enemy.maxHp} color="#f87171" />
            <StatusRow c={snapshot.enemy} />
          </div>
          <GimmickBadge c={snapshot.enemy} />
        </div>

        <div className="battle-stage__arena">
          <div className="battle-stage__enemy-figure">
            <BattleFigure
              side="enemy"
              bodyColor={enemyDef?.color ?? '#7c3aed'}
              bodyIcon={enemyDef?.icon ?? '👹'}
              arms={enemyArms}
              headCount={0}
              legCount={0}
              heartCount={0}
              skinCount={0}
              isDead={snapshot.enemy.isDead}
              rampageActive={snapshot.enemy.tempAttackSpeedMult > 1}
              slowedActive={snapshot.enemy.tempAttackSpeedMult < 1}
              guardActive={snapshot.enemy.tempDamageReductionPct > 0}
              pulses={enemyPulsesRef.current}
              synergyGlow={null}
            />
          </div>

          <div className="battle-stage__effects-layer">
            <FloatingNumbers floaters={floatersRef.current} />
            <SynergyToastList toasts={toastsRef.current} />
            <HitCounter count={hitCountRef.current} />
            {flashOn && <div className="battle-stage__flash" />}
          </div>

          <div className="battle-stage__player-figure">
            <BattleFigure
              side="player"
              bodyColor={playerColor}
              bodyIcon="🧬"
              arms={playerArms}
              headCount={playerCounts.head}
              legCount={playerCounts.leg}
              heartCount={playerCounts.heart}
              skinCount={playerCounts.skin}
              isDead={snapshot.player.isDead}
              rampageActive={snapshot.player.tempAttackSpeedMult > 1}
              slowedActive={snapshot.player.tempAttackSpeedMult < 1}
              guardActive={snapshot.player.tempDamageReductionPct > 0}
              pulses={playerPulsesRef.current}
              synergyGlow={glow}
            />
          </div>

          {snapshot.status !== 'ongoing' && (
            <div className="battle-overlay">
              <div className="battle-overlay__title">{snapshot.status === 'won' ? '🎉 勝利！' : '💀 敗北…'}</div>
              <button className="btn btn--primary btn--large" onClick={handleContinue}>
                続ける
              </button>
            </div>
          )}
        </div>

        <div className="battle-stage__player-row">
          <div className="battle-stage__name">
            🧬 {snapshot.player.name} {snapshot.player.isDead && <span className="danger-text">（機能停止）</span>}
          </div>
          <HpBar hp={snapshot.player.hp} maxHp={snapshot.player.maxHp} color="#4ade80" />
          <StatusRow c={snapshot.player} />
          {synergyLabels.length > 0 && (
            <div className="battle-stage__synergy-summary" title={synergyLabels.join(' / ')}>
              主要シナジー: {synergyLabels.length}件有効
            </div>
          )}
        </div>
      </div>

      <div className="battle-bottom">
        <div className="battle-bottom__capacity">
          <CapacityBar used={capacity.used} total={capacity.total} compact />
        </div>
        <CommandBar commands={snapshot.commands} onUse={handleUseCommand} justUsedId={justUsedId} />
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
