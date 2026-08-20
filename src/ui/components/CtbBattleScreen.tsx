import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { CtbBattleEngine, type CtbEvent, type CtbSide, type CtbSnapshot } from '../../engine/ctbBattle';
import { getPartDef } from '../../data/parts';
import { CORE_HP_BASE, BASE_DEFENSE, getCapacityInfo, TOTAL_BATTLES } from '../../engine/run';
import { FloatingNumbers, ToastList, type Floater, type Toast } from './BattleEffects';
import { playSE, initAudioUnlock } from '../../engine/soundManager';
import '../commandSystem.css';
import '../ctbBattle.css';

// ============================================================
// TEST19: CTB(行動順可視化型コマンドバトル)プロトタイプの戦闘画面。
//
// 本線のBattleScreen.tsx(TEST18)は一切変更せず、独立した新規コンポーネントとして
// 追加している。App.tsx側で「CTBモード」がONのときだけ、state.phase === 'battle' の
// 描画をBattleScreenからこちらへ差し替える(要件24: 既存オートバトルは削除せず、
// CTB使用時だけ無効化する方式)。
//
// 戦闘終了後は本線と同じ dispatch({type:'FINISH_BATTLE', ...}) を呼ぶことで、
// 報酬・部位ドロップ・次戦闘への進行など既存の戦後処理をそのまま再利用する
// (要件21)。CTB戦闘中に生成するCtbBattleEngineインスタンスはこのコンポーネントの
// ローカルrefにのみ保持し、GameContextのbattleEngineRef(本線BattleEngine専用)には
// 触れない。
// ============================================================

const FLOATER_TTL_MS = 1100;
const TOAST_TTL_MS = 1500;
const SHAKE_MS = 260;
const FLASH_MS = 220;
const ATTACK_FX_MS = 180;
const HIT_FX_MS = 220;

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

function MetabolismBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="metabolism-bar" title="代謝ゲージ: プレイヤーターン開始時に回復し、コマンド発動に消費する">
      <div className="metabolism-bar__fill" style={{ width: `${pct}%` }} />
      <div className="metabolism-bar__label">
        💧代謝 {current} / {max}
      </div>
    </div>
  );
}

function OrderTimeline({ order, enemyIcon }: { order: CtbSide[]; enemyIcon: string }) {
  return (
    <div className="ctb-order">
      <div className="ctb-order__title">⏱ 行動順</div>
      <div className="ctb-order__track">
        {order.map((side, i) => (
          <div key={i} className={`ctb-order__item ctb-order__item--${side}${i === 0 ? ' ctb-order__item--now' : ''}`}>
            <span className="ctb-order__icon">{side === 'player' ? '🧬' : enemyIcon}</span>
            <span className="ctb-order__label">{i === 0 ? 'NOW' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CtbBattleScreen() {
  const { state, dispatch } = useGame();
  const engineRef = useRef<CtbBattleEngine | null>(null);
  const [snapshot, setSnapshot] = useState<CtbSnapshot | null>(null);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [hoverCommandId, setHoverCommandId] = useState<string | null>(null);
  const [shakeOn, setShakeOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [, forceTick] = useState(0);

  const floatersRef = useRef<(Floater & { createdAt: number })[]>([]);
  const toastsRef = useRef<(Toast & { createdAt: number })[]>([]);
  const floaterIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const lastAttackAtRef = useRef<{ player: number; enemy: number }>({ player: 0, enemy: 0 });
  const lastHitAtRef = useRef<{ player: number; enemy: number }>({ player: 0, enemy: 0 });

  useEffect(() => {
    initAudioUnlock();
  }, []);

  function processEvents(events: CtbEvent[]) {
    if (events.length === 0) return;
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'attack') {
        const kind = e.isCrit ? 'crit' : 'normal';
        floatersRef.current.push({
          id: ++floaterIdRef.current,
          side: e.targetSide,
          text: `${e.damage}`,
          kind,
          createdAt: now,
          xPct: 25 + Math.random() * 50,
        });
        lastAttackAtRef.current[e.side] = now;
        lastHitAtRef.current[e.targetSide] = now;
        playSE(e.isCrit ? 'crit' : 'hit');
        setShakeOn(true);
        setTimeout(() => setShakeOn(false), SHAKE_MS);
      } else if (e.type === 'evade') {
        floatersRef.current.push({ id: ++floaterIdRef.current, side: e.targetSide, text: 'MISS', kind: 'evade', createdAt: now, xPct: 25 + Math.random() * 50 });
      } else if (e.type === 'poison_apply' || e.type === 'poison_tick') {
        const amount = e.type === 'poison_apply' ? e.amount : e.damage;
        floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `☠️${amount}`, kind: 'poison', createdAt: now, xPct: 25 + Math.random() * 50 });
        playSE('poison');
      } else if (e.type === 'burn_apply') {
        playSE('burn');
      } else if (e.type === 'burn_tick') {
        floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `🔥${e.damage}`, kind: 'burn', createdAt: now, xPct: 25 + Math.random() * 50 });
        playSE('burn');
      } else if (e.type === 'guard') {
        toastsRef.current.push({ id: ++toastIdRef.current, label: '防御', icon: '🛡️', side: e.side, kind: 'special', createdAt: now });
        playSE('guard');
      } else if (e.type === 'command') {
        playSE('command');
      } else if (e.type === 'victory') {
        setFlashOn(true);
        setTimeout(() => setFlashOn(false), FLASH_MS);
        playSE('victory');
      } else if (e.type === 'defeat') {
        playSE('defeat');
      }
    }
    floatersRef.current = floatersRef.current.filter((f) => now - f.createdAt < FLOATER_TTL_MS).slice(-30);
    toastsRef.current = toastsRef.current.filter((t) => now - t.createdAt < TOAST_TTL_MS).slice(-6);
  }

  useEffect(() => {
    if (!state.currentEnemy) return;
    const equipped = state.equipped.map((i) => ({ instanceId: i.instanceId, def: getPartDef(i.defId) }));
    const freeCapacity = getCapacityInfo(state).free;
    const engine = new CtbBattleEngine(
      { equipped, coreHpBase: CORE_HP_BASE, currentHp: state.coreHp, baseDefense: BASE_DEFENSE, freeCapacity },
      state.currentEnemy,
      state.battleIndex
    );
    engineRef.current = engine;
    floatersRef.current = [];
    toastsRef.current = [];
    lastAttackAtRef.current = { player: 0, enemy: 0 };
    lastHitAtRef.current = { player: 0, enemy: 0 };
    setSelectedCommandId(null);
    setHoverCommandId(null);
    processEvents(engine.drainEvents());
    setSnapshot(engine.getSnapshot());

    return () => {
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.battleIndex, state.currentEnemy]);

  // 演出(フローティング数字・トースト)の寿命管理専用ループ。CTB自体はイベント駆動(離散)だが、
  // 表示の消滅タイミングだけは実時間で判定する必要があるため、本線BattleScreenと同様に
  // requestAnimationFrameで軽量に監視する(戦闘ロジックのtickは一切行わない)。
  useEffect(() => {
    let raf: number;
    function loop() {
      const now = performance.now();
      let changed = false;
      if (floatersRef.current.some((f) => now - f.createdAt >= FLOATER_TTL_MS)) {
        floatersRef.current = floatersRef.current.filter((f) => now - f.createdAt < FLOATER_TTL_MS);
        changed = true;
      }
      if (toastsRef.current.some((t) => now - t.createdAt >= TOAST_TTL_MS)) {
        toastsRef.current = toastsRef.current.filter((t) => now - t.createdAt < TOAST_TTL_MS);
        changed = true;
      }
      if (changed) forceTick((v) => v + 1);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function executeCommand(commandId: string) {
    const engine = engineRef.current;
    if (!engine) return;
    const result = engine.useCommand(commandId);
    if (result.ok) {
      processEvents(engine.drainEvents());
      setSelectedCommandId(null);
      setHoverCommandId(null);
    }
    setSnapshot(engine.getSnapshot());
  }

  // AUTO ON時: プレイヤーターンになったら一定時間後に自動でコマンドを選ぶ(要件15,17)。
  // 倍速設定はこの待ち時間にのみ影響させ、プレイヤーの手動選択待ちには影響させない(要件17)。
  useEffect(() => {
    if (!snapshot) return;
    if (!snapshot.autoMode || snapshot.status !== 'ongoing' || snapshot.phase !== 'player_turn') return;
    const delay = snapshot.speed === 2 ? 450 : 900;
    const timer = setTimeout(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const cmd = engine.decideAutoCommand();
      executeCommand(cmd.id);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  function handleCommandTap(commandId: string, usable: boolean) {
    if (!usable) return;
    if (selectedCommandId === commandId) {
      executeCommand(commandId);
    } else {
      setSelectedCommandId(commandId);
    }
  }

  function toggleAuto() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setAutoMode(!engine.getAutoMode());
    setSnapshot(engine.getSnapshot());
  }

  function setSpeed(v: 1 | 2) {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setSpeed(v);
    setSnapshot(engine.getSnapshot());
  }

  function handleContinue() {
    const engine = engineRef.current;
    if (!engine) return;
    const result = engine.getStatus();
    if (result === 'ongoing') return;
    dispatch({ type: 'FINISH_BATTLE', result, finalHp: engine.getFinalPlayerHp() });
  }

  const previewTargetId = selectedCommandId ?? hoverCommandId;
  const order = useMemo(() => {
    if (!engineRef.current || !snapshot) return [];
    return engineRef.current.previewOrder(previewTargetId);
  }, [previewTargetId, snapshot]);

  if (!snapshot) return <div className="screen">CTB戦闘を準備中...</div>;

  const fxNow = performance.now();
  const playerAttackFx = fxNow - lastAttackAtRef.current.player < ATTACK_FX_MS;
  const enemyAttackFx = fxNow - lastAttackAtRef.current.enemy < ATTACK_FX_MS;
  const playerHitFx = fxNow - lastHitAtRef.current.player < HIT_FX_MS;
  const enemyHitFx = fxNow - lastHitAtRef.current.enemy < HIT_FX_MS;
  const selectedCommand = snapshot.commands.find((c) => c.id === selectedCommandId) ?? null;

  return (
    <div className={`screen battle-screen-v2 ctb-screen${shakeOn ? ' battle-screen-v2--shake' : ''}`}>
      <header className="screen__header battle-header-v2">
        <h1>
          ⚔️ 第{snapshot.battleIndex}戦 / 全{TOTAL_BATTLES}戦 <span className="ctb-badge">CTB試作</span>
        </h1>
        <div className="battle-header-v2__right">
          <span className="muted">ターン{snapshot.turnCount}</span>
        </div>
      </header>

      <OrderTimeline order={order} enemyIcon={snapshot.enemy.icon} />
      {previewTargetId && (
        <div className="ctb-preview-note muted">
          {snapshot.commands.find((c) => c.id === previewTargetId)?.name}を選んだ場合の予測行動順を表示中
        </div>
      )}

      <div className="battle-stage">
        <div className="battle-stage__enemy-row">
          <div className="battle-stage__name">
            {snapshot.enemy.icon} {snapshot.enemy.name} {snapshot.enemy.isDead && <span className="danger-text">（撃破）</span>}
          </div>
          <HpBar hp={snapshot.enemy.hp} maxHp={snapshot.enemy.maxHp} color="#f87171" />
          {snapshot.enemy.poison > 0 && (
            <span className="status-badge status-badge--poison" title={`毒 ${snapshot.enemy.poison}`}>
              ☠️{snapshot.enemy.poison}
            </span>
          )}
          {snapshot.enemy.burn && (
            <span className="status-badge status-badge--burn" title="炎上">
              🔥{snapshot.enemy.burn.turnsLeft}T
            </span>
          )}
        </div>

        <div className="battle-stage__arena">
          <div className="battle-stage__enemy-figure">
            <div className={`figure-anchor${enemyAttackFx ? ' figure-anchor--attack' : ''}${enemyHitFx ? ' figure-anchor--hit' : ''}`}>
              <div className="ctb-figure ctb-figure--enemy">{snapshot.enemy.icon}</div>
            </div>
          </div>

          <div className="battle-stage__effects-layer">
            <FloatingNumbers floaters={floatersRef.current} />
            <ToastList toasts={toastsRef.current} />
            {flashOn && <div className="battle-stage__flash" />}
          </div>

          <div className="battle-stage__player-figure">
            <div className={`figure-anchor${playerAttackFx ? ' figure-anchor--attack' : ''}${playerHitFx ? ' figure-anchor--hit' : ''}`}>
              <div className="ctb-figure ctb-figure--player">🧬</div>
              {snapshot.player.guardActive && <span className="ctb-guard-badge" title="次の被弾を軽減">🛡️</span>}
            </div>
          </div>

          {snapshot.status !== 'ongoing' && (
            <button type="button" className={`battle-end-overlay battle-end-overlay--${snapshot.status}`} onClick={handleContinue}>
              <div className="battle-end-overlay__text">{snapshot.status === 'won' ? '勝利！' : '敗北…'}</div>
              <div className="battle-end-overlay__hint">タップして次へ</div>
            </button>
          )}
        </div>

        <div className="battle-stage__player-row">
          <div className="battle-stage__name">
            🧬 キメラ {snapshot.player.isDead && <span className="danger-text">（機能停止）</span>}
          </div>
          <HpBar hp={snapshot.player.hp} maxHp={snapshot.player.maxHp} color="#4ade80" />
          {snapshot.player.poison > 0 && (
            <span className="status-badge status-badge--poison" title={`毒 ${snapshot.player.poison}`}>
              ☠️{snapshot.player.poison}
            </span>
          )}
          {snapshot.player.burn && (
            <span className="status-badge status-badge--burn" title="炎上">
              🔥{snapshot.player.burn.turnsLeft}T
            </span>
          )}
        </div>
      </div>

      <div className="battle-bottom">
        <div className="cmd-battle-panel">
          <MetabolismBar current={snapshot.metabolism.current} max={snapshot.metabolism.max} />
          <div className="ctb-command-grid">
            {snapshot.commands.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                className={`ctb-command${cmd.usable ? ' ctb-command--usable' : ''}${selectedCommandId === cmd.id ? ' ctb-command--selected' : ''}`}
                style={{ ['--command-color' as string]: cmd.color, borderColor: cmd.color }}
                disabled={!cmd.usable}
                onClick={() => handleCommandTap(cmd.id, cmd.usable)}
                onMouseEnter={() => setHoverCommandId(cmd.id)}
                onMouseLeave={() => setHoverCommandId((v) => (v === cmd.id ? null : v))}
              >
                <span className="cmd-button__icon" style={{ color: cmd.color }}>
                  {cmd.icon}
                </span>
                <span className="cmd-button__name">{cmd.name}</span>
                <span className="cmd-button__desc">{cmd.description}</span>
                <span className="cmd-button__cost">
                  💧{cmd.metabolismCost} ・ {cmd.ctLabel}
                </span>
              </button>
            ))}
          </div>
          {selectedCommand && (
            <div className="ctb-confirm-bar">
              <span>
                {selectedCommand.icon} {selectedCommand.name}を選択中 — もう一度タップで実行
              </span>
              <button type="button" className="btn btn--small btn--primary" onClick={() => executeCommand(selectedCommand.id)}>
                実行する
              </button>
              <button type="button" className="btn btn--small" onClick={() => setSelectedCommandId(null)}>
                取消
              </button>
            </div>
          )}
        </div>

        <div className="battle-bottom__controls">
          <button className={`btn btn--small${snapshot.autoMode ? ' btn--active' : ''}`} onClick={toggleAuto}>
            🤖 AUTO{snapshot.autoMode ? ' ON' : ' OFF'}
          </button>
          <button className={`btn btn--small speed-toggle${snapshot.speed === 2 ? ' btn--active' : ''}`} onClick={() => setSpeed(snapshot.speed === 2 ? 1 : 2)}>
            ⏩ 倍速{snapshot.speed === 2 ? ' ON' : ''}
          </button>
        </div>

        <div className="battle-log">
          {snapshot.log.slice(0, 12).map((line) => (
            <div key={line} className="battle-log__line">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
