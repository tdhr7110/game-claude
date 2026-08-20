import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../GameContext';
import { BattleEngine, type BattleEvent, type BattleSnapshot, type CombatantSnapshot, type CommandSlotSnapshot, type SpeedSetting } from '../../engine/battle';
import { getPartDef } from '../../data/parts';
import { getCommandDef } from '../../data/commandDefs';
import { commandEffectSummaryShort } from '../commandFormat';
import { CORE_HP_BASE, BASE_DEFENSE, getCapacityInfo, TOTAL_BATTLES, tierOfCurrentBattle } from '../../engine/run';
import { recordBattleEnd, recordBattleStart } from '../../metrics/metricsRecorder';
import { dominantSpeciesColor, groupCountByType } from './BattleFigure';
// TEST11: 戦闘中のキャラクター表示を自由合体レイヤーの画像合成方式に置き換える(見た目のみの差し替え)。
import { BattleChimeraFigure } from '../freeLayer/BattleChimeraFigure';
import { groupPartTypeCounts } from '../freeLayer/freeLayerFromParts';
import { FloatingNumbers, HitCounter, ToastList, OverkillBanner, type Floater, type Toast } from './BattleEffects';
import { playSE, getSESettings, setSEMuted, setSEVolume, subscribeSESettings, initAudioUnlock } from '../../engine/soundManager';
import { STORAGE_NAMESPACE } from '../../persistence/storageKeys';
import '../commandSystem.css';

// TEST18: 速度は通常(1x)/倍速(2x)の2種類のみ(4xは削除)。
const SPEED_OPTIONS: SpeedSetting[] = [1, 2];

// TEST6由来: 選択した再生速度(倍速)を次の戦闘でも覚えておく。一時停止(0)は「今だけ止めた」操作
// なので記憶対象に含めず、1x/2xのみ保存する。
const SPEED_STORAGE_KEY = `${STORAGE_NAMESPACE}:battle-speed:v1`;

function loadPreferredSpeed(): SpeedSetting {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    const n = raw !== null ? Number(raw) : NaN;
    return SPEED_OPTIONS.includes(n as SpeedSetting) && n !== 0 ? (n as SpeedSetting) : 1;
  } catch {
    return 1;
  }
}

function savePreferredSpeed(speed: SpeedSetting) {
  if (speed === 0) return;
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // 保存容量オーバーなどは無視(速度記憶は補助機能のため、ゲーム進行自体には影響させない)
  }
}

// --- 戦闘演出のチューニング値 ---
const FLOATER_TTL_MS = 1100;
const TOAST_TTL_MS = 1500;
const FLOATER_CAP_PER_FRAME = 14; // 1フレームで新規生成する数字の上限(多段攻撃対策)
const FLOATER_MAX_ONSCREEN = 40; // 同時表示数の上限
const TOAST_MAX_ONSCREEN = 6;
const BIG_DAMAGE_THRESHOLD = 20;
const HIT_RESET_GAME_SECONDS = 1.2; // この秒数だけ無被弾が続くとHITカウンターをリセット
const SHAKE_MS = 260;
const FLASH_MS = 260;
const OVERKILL_MS = 900;
// TEST18: 攻撃時の軽い移動・被弾時の揺れ(最低限の戦闘演出)の表示時間。
const ATTACK_FX_MS = 160;
const HIT_FX_MS = 200;

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

// 毒・炎上・バフデバフの表示。名前/HP行の下に積み上げると出たり消えたりするたびに
// レイアウトが上下してコマンドボタンの位置がズレるため、フィギュア(アイコン)の
// 横へ絶対配置のバッジとして重ねる。行の高さには影響しない。
function FigureStatusBadges({ c }: { c: CombatantSnapshot }) {
  if (c.poison === 0 && !c.burn && c.activeEffects.length === 0) return null;
  return (
    <div className="figure-status-badges">
      {c.poison > 0 && (
        <span className="status-badge status-badge--poison" title={`毒 ${c.poison}`}>
          ☠️{c.poison}
        </span>
      )}
      {c.burn && (
        <span className="status-badge status-badge--burn" title={`炎上 ${Math.round(c.burn.dps * 10) / 10}/秒・残り${Math.round(c.burn.timeLeft * 10) / 10}秒`}>
          🔥{Math.ceil(c.burn.timeLeft)}s
        </span>
      )}
      {c.activeEffects.map((e) => (
        <span key={e.key} className="status-badge status-badge--buff" title={`${e.sourceName}・残り${e.remaining}秒`}>
          {EFFECT_KIND_ICONS[e.kind] ?? '✨'}
          {e.remaining}s
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
  // TEST18: 戦闘中でも「このコマンドが何をするか」が一目で分かるよう、簡略化した効果文を
  // ボタン内に常時表示する(以前はhoverでしか見えないtitle属性のみで、スマホでは確認できなかった)。
  const cmdDef = getCommandDef(slot.commandId);
  const shortDesc = cmdDef ? commandEffectSummaryShort(cmdDef) : slot.description;
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
      <span className="cmd-button__desc">{shortDesc}</span>
      <span className="cmd-button__cost">
        💧{slot.metabolismCost}
        {slot.cooldownSeconds > 0 ? ` ・ ⏱${slot.cooldownSeconds}s` : ''}
      </span>
      {cdActive && <div className="cmd-button__cd-overlay">{Math.ceil(slot.cooldownRemaining)}</div>}
    </button>
  );
}

function SoundSettings() {
  const [settings, setSettingsState] = useState(getSESettings());
  useEffect(() => subscribeSESettings(() => setSettingsState(getSESettings())), []);
  return (
    <div className="sound-settings">
      <button className={`btn btn--small${!settings.muted ? ' btn--active' : ''}`} onClick={() => setSEMuted(!settings.muted)} title="効果音のミュート切り替え">
        {settings.muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={settings.volume}
        onChange={(e) => setSEVolume(parseFloat(e.target.value))}
        disabled={settings.muted}
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
  const [shakeOn, setShakeOn] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [overkillOn, setOverkillOn] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const avatarDefs = useMemo(() => state.equipped.map((i) => getPartDef(i.defId)), [state.equipped]);
  const playerCounts = useMemo(() => groupCountByType(avatarDefs), [avatarDefs]);
  const playerColor = useMemo(() => dominantSpeciesColor(avatarDefs), [avatarDefs]);

  // 演出は頻度が高く、React stateにすると再レンダーが際限なく増えるため、
  // ref配列 + 低頻度なeffectsTick更新でDOM反映する(TEST4のフローティング数字処理を踏襲)。
  const floatersRef = useRef<Floater[]>([]);
  const toastsRef = useRef<(Toast & { createdAt: number })[]>([]);
  const playerPulsesRef = useRef<Record<string, number>>({});
  const enemyPulsesRef = useRef<Record<string, number>>({});
  // TEST18: 最低限の戦闘演出(攻撃時の軽い移動・被弾時の揺れ)用。attackイベントのたびに
  // 攻撃側/被弾側それぞれの直近発生時刻を記録し、レンダー時に経過時間で判定してCSSクラスを
  // 付け外しする(floatersRef等と同じく、頻度が高いためRef+毎フレームのsetSnapshot再描画に乗せる)。
  const lastAttackAtRef = useRef<{ player: number; enemy: number }>({ player: 0, enemy: 0 });
  const lastHitAtRef = useRef<{ player: number; enemy: number }>({ player: 0, enemy: 0 });
  const floaterIdRef = useRef(0);
  const toastIdRef = useRef(0);
  const hitCountRef = useRef(0);
  const lastHitGameTimeRef = useRef(0);
  const prevPlayerGuardRef = useRef(false);
  const prevEnemyGuardRef = useRef(false);

  useEffect(() => {
    initAudioUnlock();
  }, []);

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
    engine.setSpeed(loadPreferredSpeed());
    battleEngineRef.current = engine;
    // バランス計測(TEST12): 戦闘開始時点で実際に解決されたコマンド構成を記録する。
    recordBattleStart(state.battleIndex, tierOfCurrentBattle(state), engine.getEquippedCommandIds());
    setSnapshot(engine.getSnapshot());
    lastTimeRef.current = performance.now();
    floatersRef.current = [];
    toastsRef.current = [];
    playerPulsesRef.current = {};
    enemyPulsesRef.current = {};
    lastAttackAtRef.current = { player: 0, enemy: 0 };
    lastHitAtRef.current = { player: 0, enemy: 0 };
    hitCountRef.current = 0;
    lastHitGameTimeRef.current = 0;
    prevPlayerGuardRef.current = false;
    prevEnemyGuardRef.current = false;

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

      for (const e of attackEvents) {
        const pulses = e.side === 'player' ? playerPulsesRef.current : enemyPulsesRef.current;
        pulses[e.partInstanceId] = (pulses[e.partInstanceId] ?? 0) + 1;
        lastAttackAtRef.current[e.side] = now;
        lastHitAtRef.current[e.targetSide] = now;
        if (e.isCrit) playSE('crit');
        else playSE('hit');
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
        } else if (e.type === 'poison_apply' || e.type === 'poison_tick') {
          const amount = e.type === 'poison_apply' ? e.amount : e.damage;
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `☠️${amount}`, kind: 'poison', createdAt: now, xPct: 25 + Math.random() * 50 });
          playSE('poison');
        } else if (e.type === 'burn_apply') {
          playSE('burn');
        } else if (e.type === 'burn_tick') {
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `🔥${e.damage}`, kind: 'burn', createdAt: now, xPct: 25 + Math.random() * 50 });
          playSE('burn');
        } else if (e.type === 'reflect') {
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side === 'player' ? 'enemy' : 'player', text: `🪞${e.damage}`, kind: 'fixed', createdAt: now, xPct: 50 });
          playSE('reflect');
        } else if (e.type === 'command') {
          playSE('command');
        } else if (e.type === 'synergy') {
          toastsRef.current.push({ id: ++toastIdRef.current, label: e.label, icon: '✨', side: e.side, kind: 'synergy', createdAt: now });
        } else if (e.type === 'special') {
          toastsRef.current.push({ id: ++toastIdRef.current, label: e.label, icon: e.icon, side: e.side, kind: 'special', createdAt: now });
        } else if (e.type === 'telegraph') {
          // メッセージ本文は "⚠️ 説明文" の形式(data/enemies.ts参照)。先頭の絵文字をアイコン欄へ、
          // 残りを短いラベルとして扱う(他のトーストと表示形式を揃えるため)。
          const spaceIdx = e.message.indexOf(' ');
          const icon = spaceIdx > 0 ? e.message.slice(0, spaceIdx) : '⚠️';
          const label = spaceIdx > 0 ? e.message.slice(spaceIdx + 1) : e.message;
          toastsRef.current.push({ id: ++toastIdRef.current, label, icon, side: e.side, kind: 'telegraph', createdAt: now });
          playSE('telegraph');
        } else if (e.type === 'gimmick_damage') {
          const kind = e.damage >= BIG_DAMAGE_THRESHOLD ? 'big' : 'normal';
          floatersRef.current.push({ id: ++floaterIdRef.current, side: e.side, text: `🌀${e.damage}`, kind, createdAt: now, xPct: 25 + Math.random() * 50 });
          playSE('hit');
        } else if (e.type === 'overkill') {
          setOverkillOn(true);
          setTimeout(() => setOverkillOn(false), OVERKILL_MS);
          setShakeOn(true);
          setTimeout(() => setShakeOn(false), SHAKE_MS);
          setFlashOn(true);
          setTimeout(() => setFlashOn(false), FLASH_MS);
        } else if (e.type === 'victory') {
          playSE('victory');
        } else if (e.type === 'defeat') {
          playSE('defeat');
        }
      }

      floatersRef.current = floatersRef.current.filter((f) => now - f.createdAt < FLOATER_TTL_MS).slice(-FLOATER_MAX_ONSCREEN);
      toastsRef.current = toastsRef.current.filter((t) => now - t.createdAt < TOAST_TTL_MS).slice(-TOAST_MAX_ONSCREEN);
    }

    function loop(now: number) {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      engine.tick(dt);
      const snap = engine.getSnapshot();
      const events = engine.drainEvents();
      processEvents(events, snap.time);

      if (snap.time - lastHitGameTimeRef.current > HIT_RESET_GAME_SECONDS) hitCountRef.current = 0;

      const playerGuardNow = snap.player.activeEffects.some((e) => e.kind === 'damage_reduction' || e.kind === 'reflect');
      if (playerGuardNow && !prevPlayerGuardRef.current) playSE('guard');
      prevPlayerGuardRef.current = playerGuardNow;
      const enemyGuardNow = snap.enemy.activeEffects.some((e) => e.kind === 'damage_reduction' || e.kind === 'reflect');
      if (enemyGuardNow && !prevEnemyGuardRef.current) playSE('guard');
      prevEnemyGuardRef.current = enemyGuardNow;

      // 演出の寿命切れをここでも掃除する(tickでイベントが無いフレームが続いても
      // 表示が残り続けないようにするため。DOM要素数の上限を保証する)。
      // setSnapshot()が毎フレーム再レンダーを起こすため、専用の再描画トリガーは不要。
      const wallNow = performance.now();
      if (floatersRef.current.some((f) => wallNow - f.createdAt >= FLOATER_TTL_MS)) {
        floatersRef.current = floatersRef.current.filter((f) => wallNow - f.createdAt < FLOATER_TTL_MS);
      }
      if (toastsRef.current.some((t) => wallNow - t.createdAt >= TOAST_TTL_MS)) {
        toastsRef.current = toastsRef.current.filter((t) => wallNow - t.createdAt < TOAST_TTL_MS);
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
  }, [state.battleIndex, state.currentEnemy, battleResetSignal]);

  if (!snapshot) return <div className="screen">戦闘を準備中...</div>;

  function setSpeed(v: SpeedSetting) {
    battleEngineRef.current?.setSpeed(v);
    setSnapshot(battleEngineRef.current?.getSnapshot() ?? snapshot);
    savePreferredSpeed(v);
  }

  function handleContinue() {
    const engine = battleEngineRef.current;
    if (!engine) return;
    const result = engine.getStatus();
    if (result === 'ongoing') return;

    // バランス計測(TEST12): 戦闘結果の内訳(ResultBreakdownで表示している値と同じ集計)を記録する。
    // ゲーム進行自体(FINISH_BATTLEのdispatch)には影響させない。
    const finalSnapshot = engine.getSnapshot();
    recordBattleEnd(state.battleIndex, tierOfCurrentBattle(state), {
      outcome: result === 'won' ? 'win' : 'lose',
      battleTimeSeconds: finalSnapshot.resultStats.timeSeconds,
      playerHpRemaining: finalSnapshot.player.hp,
      playerMaxHp: finalSnapshot.player.maxHp,
      deathCause: engine.getDeathCause(),
      damage: { auto: finalSnapshot.resultStats.autoDamage, command: finalSnapshot.resultStats.commandDamage, status: finalSnapshot.resultStats.statusDamage },
      healed: finalSnapshot.resultStats.healed,
      commandUsage: engine.getCommandBreakdown(),
    });

    dispatch({ type: 'FINISH_BATTLE', result, finalHp: engine.getFinalPlayerHp() });
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
  const enemyCounts = groupPartTypeCounts(snapshot.enemy.parts);
  const glow = synergyGlowFor(snapshot);
  const playerGuardActive = snapshot.player.activeEffects.some((e) => e.kind === 'damage_reduction');
  const playerReflectActive = snapshot.player.activeEffects.some((e) => e.kind === 'reflect');
  const playerRampageActive = snapshot.player.activeEffects.some((e) => e.kind === 'attack_speed');
  const enemyGuardActive = snapshot.enemy.activeEffects.some((e) => e.kind === 'damage_reduction');
  const enemyReflectActive = snapshot.enemy.activeEffects.some((e) => e.kind === 'reflect');

  // TEST18: 最低限の戦闘演出(攻撃時の軽い移動・被弾時の揺れ)。直近の攻撃/被弾からの経過時間で判定する。
  const fxNow = performance.now();
  const playerAttackFx = fxNow - lastAttackAtRef.current.player < ATTACK_FX_MS;
  const enemyAttackFx = fxNow - lastAttackAtRef.current.enemy < ATTACK_FX_MS;
  const playerHitFx = fxNow - lastHitAtRef.current.player < HIT_FX_MS;
  const enemyHitFx = fxNow - lastHitAtRef.current.enemy < HIT_FX_MS;

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
          <div className="battle-stage__name">
            {enemyDef?.icon} {snapshot.enemy.name} {snapshot.enemy.isDead && <span className="danger-text">（撃破）</span>}
          </div>
          <HpBar hp={snapshot.enemy.hp} maxHp={snapshot.enemy.maxHp} color="#f87171" shield={snapshot.enemy.shieldValue} />
        </div>

        <div className="battle-stage__arena">
          <div className="battle-stage__enemy-figure">
            <div className={`figure-anchor${enemyAttackFx ? ' figure-anchor--attack' : ''}${enemyHitFx ? ' figure-anchor--hit' : ''}`}>
              <BattleChimeraFigure
                side="enemy"
                bodyColor={enemyDef?.color ?? '#7c3aed'}
                bodyIcon={enemyDef?.icon ?? '👹'}
                partTypeCounts={enemyCounts}
                isDead={snapshot.enemy.isDead}
                rampageActive={false}
                guardActive={enemyGuardActive}
                reflectActive={enemyReflectActive}
                synergyGlow={null}
              />
              <FigureStatusBadges c={snapshot.enemy} />
            </div>
          </div>

          <div className="battle-stage__effects-layer">
            <FloatingNumbers floaters={floatersRef.current} />
            <ToastList toasts={toastsRef.current} />
            <HitCounter count={hitCountRef.current} />
            <OverkillBanner show={overkillOn} />
            {flashOn && <div className="battle-stage__flash" />}
          </div>

          {snapshot.commandsEnabled && snapshot.lastCommandEvent && (
            <div key={snapshot.lastCommandEvent.time} className={`cmd-stage-banner cmd-stage-banner--${snapshot.lastCommandEvent.category}`}>
              <span className="cmd-stage-banner__icon" style={{ color: snapshot.lastCommandEvent.color }}>
                {snapshot.lastCommandEvent.icon}
              </span>
              {snapshot.lastCommandEvent.name}
            </div>
          )}

          <div className="battle-stage__player-figure">
            <div className={`figure-anchor${playerAttackFx ? ' figure-anchor--attack' : ''}${playerHitFx ? ' figure-anchor--hit' : ''}`}>
              <BattleChimeraFigure
                side="player"
                bodyColor={playerColor}
                bodyIcon="🧬"
                partTypeCounts={playerCounts}
                isDead={snapshot.player.isDead}
                rampageActive={playerRampageActive}
                guardActive={playerGuardActive}
                reflectActive={playerReflectActive}
                synergyGlow={glow}
              />
              <FigureStatusBadges c={snapshot.player} />
            </div>
          </div>

          {/* TEST18: 勝利/敗北を画面中央へ大きく表示し、内訳と「続ける」ボタンは廃止。
              タップで次へ進む(下から出てくるカード形式はやめる)。 */}
          {snapshot.status !== 'ongoing' && (
            <button
              type="button"
              className={`battle-end-overlay battle-end-overlay--${snapshot.status}`}
              onClick={handleContinue}
            >
              <div className="battle-end-overlay__text">{snapshot.status === 'won' ? '勝利！' : '敗北…'}</div>
              <div className="battle-end-overlay__hint">タップして次へ</div>
            </button>
          )}
        </div>

        <div className="battle-stage__player-row">
          <div className="battle-stage__name">
            🧬 {snapshot.player.name} {snapshot.player.isDead && <span className="danger-text">（機能停止）</span>}
          </div>
          <HpBar hp={snapshot.player.hp} maxHp={snapshot.player.maxHp} color="#4ade80" shield={snapshot.player.shieldValue} />
        </div>
      </div>

      <div className="battle-bottom">
        {/* TEST18: 戦闘中の接続容量表示は情報過多のため非表示にする(戦闘準備画面で確認できる)。 */}
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
          {/* TEST18: 4倍速を廃止し、通常(1x)/倍速(2x)をワンタップで切り替えるだけのシンプルな
              トグルボタンにする(「倍速ON/OFF」相当)。 */}
          <button
            className={`btn btn--small speed-toggle${snapshot.speed === 2 ? ' btn--active' : ''}`}
            onClick={() => setSpeed(snapshot.speed === 2 ? 1 : 2)}
          >
            ⏩ 倍速{snapshot.speed === 2 ? ' ON' : ''}
          </button>
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
