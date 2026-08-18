import { useEffect, useMemo, useRef, useState } from 'react';
import './turnTest.css';
import { getPartDef } from '../../data/parts';
import type { PartDef } from '../../data/types';
import { PART_TYPE_LABELS } from '../../data/types';
import { POISON_SPIDER, ROCK_GOLEM, TURN_ENEMIES, type TurnEnemyDef } from '../../data/turnEnemies';
import { resolveActiveSkills, TURN_SKILLS, TURN_COMMAND_SLOTS, TURN_COMMAND_SLOT_LABELS, type TurnCommandSlot, type TurnSkillDef } from '../../data/turnSkills';
import { createTurnBattleState, currentEnemyMove, debugResetCooldowns, debugSetHp, executeTurn, type TurnBattleState } from '../../engine/turnBattle';
import { describeSkillCondition, describeSkillPower, TURN_SLOT_ICONS } from './turnFormat';

// このコマンドバトルTESTで扱う部位（38部位すべてには対応しない、試作用の抜粋）。
// 本線の装着状態(GameContext/RunState)には一切触れない、独立したスクラッチビルド。
const PROTOTYPE_PART_IDS = [
  'weak_arm',
  'insect_sickle_arm',
  'insect_poison_needle_arm',
  'insect_poison_gland',
  'dragon_flame_head',
  'insect_carapace',
  'golem_rock_shell',
  'golem_reflect_armor',
];

const DEFAULT_EQUIPPED_IDS = ['weak_arm'];

type ActiveSkills = Record<TurnCommandSlot, TurnSkillDef | null>;

interface EvolutionToast {
  key: number;
  slot: TurnCommandSlot;
  fromName: string | null;
  toName: string;
  direction: 'up' | 'down' | 'side';
}

export function TurnBattleTestScreen({ onExit }: { onExit: () => void }) {
  const [equippedIds, setEquippedIds] = useState<string[]>(DEFAULT_EQUIPPED_IDS);
  const [battle, setBattle] = useState<TurnBattleState | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [showSkillTable, setShowSkillTable] = useState(false);
  const [glowSlot, setGlowSlot] = useState<TurnCommandSlot | null>(null);
  const [toast, setToast] = useState<EvolutionToast | null>(null);
  const [hpDraft, setHpDraft] = useState<{ player: string; enemy: string }>({ player: '', enemy: '' });

  const processingRef = useRef(false);
  const prevSkillsRef = useRef<ActiveSkills | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const equippedDefs: PartDef[] = useMemo(() => equippedIds.map((id) => getPartDef(id)), [equippedIds]);
  const activeSkills: ActiveSkills = useMemo(() => resolveActiveSkills(equippedDefs), [equippedDefs]);

  // 装着変更のたびに、各コマンド枠の技が変わっていないか比較し、変わっていれば進化演出を出す。
  useEffect(() => {
    const prev = prevSkillsRef.current;
    prevSkillsRef.current = activeSkills;
    if (!prev) return; // 初回マウント時は演出を出さない
    for (const slot of TURN_COMMAND_SLOTS) {
      const before = prev[slot];
      const after = activeSkills[slot];
      if (before?.skillId === after?.skillId) continue;
      const beforePriority = before?.priority ?? -Infinity;
      const afterPriority = after?.priority ?? -Infinity;
      const direction: EvolutionToast['direction'] = afterPriority > beforePriority ? 'up' : afterPriority < beforePriority ? 'down' : 'side';
      setToast({ key: Date.now(), slot, fromName: before?.name ?? null, toName: after?.name ?? '（使用不可）', direction });
      const timer = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSkills]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [battle?.log.length]);

  function startBattle(enemy: TurnEnemyDef) {
    processingRef.current = false;
    setBattle(createTurnBattleState(enemy));
  }

  function resetBattle() {
    if (!battle) return;
    processingRef.current = false;
    setBattle(createTurnBattleState(battle.enemyDef));
  }

  function useCommand(slot: TurnCommandSlot) {
    if (!battle || battle.status !== 'ongoing') return;
    if (processingRef.current) return; // 二重実行防止
    if ((battle.cooldowns[slot] ?? 0) > 0) return;
    processingRef.current = true;
    setBattle((s) => (s ? executeTurn(s, equippedDefs, slot) : s));
    setGlowSlot(slot);
    setTimeout(() => setGlowSlot(null), 600);
    // 状態更新は同期的に完了するため、次のイベントループで解放すれば十分
    setTimeout(() => {
      processingRef.current = false;
    }, 0);
  }

  function addPart(id: string) {
    setEquippedIds((prev) => [...prev, id]);
  }
  function removePart(id: string) {
    setEquippedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  function applyDebugHp() {
    if (!battle) return;
    setBattle((s) => {
      if (!s) return s;
      let next = s;
      if (hpDraft.player !== '') next = debugSetHp(next, 'player', Number(hpDraft.player));
      if (hpDraft.enemy !== '') next = debugSetHp(next, 'enemy', Number(hpDraft.enemy));
      return next;
    });
  }

  return (
    <div className="turn-test">
      <header className="turn-test__header">
        <h1>
          ⚔️ コマンドバトルTEST
          <span className="turn-test__badge">試作・独立モード</span>
        </h1>
        <button className="turn-test-btn turn-test-btn--small" onClick={onExit}>
          ✕ 閉じる
        </button>
      </header>

      {toast && (
        <div className="turn-evolution-toast">
          {toast.direction === 'up' ? '技が進化した！' : toast.direction === 'down' ? '技が元の段階に戻った' : '技が変化した！'}
          <br />
          {toast.fromName ?? '（なし）'} <span className="turn-evolution-toast__arrow">→</span> {toast.toName}
        </div>
      )}

      <div className="turn-test__body">
        {!battle && (
          <div className="turn-test__section">
            <h2>戦闘開始</h2>
            <div className="turn-test__enemy-picks">
              {TURN_ENEMIES.map((e) => (
                <button key={e.id} className="turn-test-btn" onClick={() => startBattle(e)}>
                  {e.icon} {e.name}と戦う
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.72rem', marginTop: 8 }}>
              下の「TESTツール」で部位を装着してから戦闘を開始すると、技の進化を試せます。
            </p>
          </div>
        )}

        {battle && (
          <BattleArea
            battle={battle}
            activeSkills={activeSkills}
            glowSlot={glowSlot}
            onUseCommand={useCommand}
            onRetry={resetBattle}
            onBackToSelect={() => setBattle(null)}
            logEndRef={logEndRef}
          />
        )}

        <div className="turn-test__section">
          <button className="turn-test-btn turn-test-btn--small" onClick={() => setShowTools((v) => !v)}>
            🧪 TESTツール{showTools ? '（閉じる）' : ''}
          </button>
          {showTools && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <h2>試作用部位の装着（本線の装備とは無関係）</h2>
                <div className="turn-parts-grid">
                  {PROTOTYPE_PART_IDS.map((id) => {
                    const def = getPartDef(id);
                    const count = equippedIds.filter((eid) => eid === id).length;
                    return (
                      <div key={id} className="turn-part-chip">
                        <span>
                          {def.icon} {def.name}（{PART_TYPE_LABELS[def.type]}）
                        </span>
                        <button className="turn-test-btn turn-test-btn--small" onClick={() => removePart(id)} disabled={count === 0}>
                          -
                        </button>
                        <span className="turn-part-chip__count">{count}</span>
                        <button className="turn-test-btn turn-test-btn--small" onClick={() => addPart(id)}>
                          +
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h2>戦闘系ツール</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="turn-test-btn turn-test-btn--small" onClick={() => startBattle(POISON_SPIDER)}>
                    毒蜘蛛と戦闘開始
                  </button>
                  <button className="turn-test-btn turn-test-btn--small" onClick={() => startBattle(ROCK_GOLEM)}>
                    岩石ゴーレムと戦闘開始
                  </button>
                  <button className="turn-test-btn turn-test-btn--small" onClick={resetBattle} disabled={!battle}>
                    戦闘リセット
                  </button>
                  <button
                    className="turn-test-btn turn-test-btn--small"
                    onClick={() => setBattle((s) => (s ? debugResetCooldowns(s) : s))}
                    disabled={!battle}
                  >
                    クールダウンをリセット
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <label style={{ fontSize: '0.72rem' }}>
                    プレイヤーHP:
                    <input
                      type="number"
                      style={{ width: 60, marginLeft: 4 }}
                      value={hpDraft.player}
                      placeholder={battle ? String(battle.player.hp) : '-'}
                      onChange={(e) => setHpDraft((d) => ({ ...d, player: e.target.value }))}
                    />
                  </label>
                  <label style={{ fontSize: '0.72rem' }}>
                    敵HP:
                    <input
                      type="number"
                      style={{ width: 60, marginLeft: 4 }}
                      value={hpDraft.enemy}
                      placeholder={battle ? String(battle.enemy.hp) : '-'}
                      onChange={(e) => setHpDraft((d) => ({ ...d, enemy: e.target.value }))}
                    />
                  </label>
                  <button className="turn-test-btn turn-test-btn--small" onClick={applyDebugHp} disabled={!battle}>
                    HPを適用
                  </button>
                </div>
              </div>

              <div>
                <button className="turn-test-btn turn-test-btn--small" onClick={() => setShowSkillTable((v) => !v)}>
                  📖 技の進化条件を確認{showSkillTable ? '（閉じる）' : ''}
                </button>
                {showSkillTable && <SkillTable activeSkills={activeSkills} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BattleArea({
  battle,
  activeSkills,
  glowSlot,
  onUseCommand,
  onRetry,
  onBackToSelect,
  logEndRef,
}: {
  battle: TurnBattleState;
  activeSkills: ActiveSkills;
  glowSlot: TurnCommandSlot | null;
  onUseCommand: (slot: TurnCommandSlot) => void;
  onRetry: () => void;
  onBackToSelect: () => void;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const move = battle.status === 'ongoing' ? currentEnemyMove(battle) : null;
  const result = battle.lastResult;

  return (
    <div className="turn-test__section" style={{ position: 'relative' }}>
      {battle.status !== 'ongoing' && (
        <div className="turn-overlay">
          <div className="turn-overlay__card">
            <div className="turn-overlay__title">{battle.status === 'won' ? '🎉 勝利！' : '💀 敗北…'}</div>
            <div className="muted" style={{ fontSize: '0.75rem' }}>
              {battle.turn - 1}ターンで決着
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="turn-test-btn" onClick={onRetry}>
                もう一度
              </button>
              <button className="turn-test-btn" onClick={onBackToSelect}>
                敵選択に戻る
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="turn-battle__combatants">
        <div className="turn-combatant">
          <div className="turn-combatant__name">🧬 キメラ（TEST）</div>
          <div className="turn-hp-bar">
            <div className="turn-hp-bar__fill turn-hp-bar__fill--player" style={{ width: `${(battle.player.hp / battle.player.maxHp) * 100}%` }} />
            <div className="turn-hp-bar__label">
              {battle.player.hp} / {battle.player.maxHp}
            </div>
          </div>
          {battle.player.poison > 0 && <span className="turn-poison-badge">☠️毒{battle.player.poison}</span>}
        </div>
        <div className="turn-combatant">
          <div className="turn-combatant__name">
            {battle.enemyDef.icon} {battle.enemyDef.name}
          </div>
          <div className="turn-hp-bar">
            <div className="turn-hp-bar__fill turn-hp-bar__fill--enemy" style={{ width: `${(battle.enemy.hp / battle.enemy.maxHp) * 100}%` }} />
            <div className="turn-hp-bar__label">
              {battle.enemy.hp} / {battle.enemy.maxHp}
            </div>
          </div>
          {battle.enemy.poison > 0 && <span className="turn-poison-badge">☠️毒{battle.enemy.poison}</span>}
        </div>
      </div>

      {move && (
        <div className="turn-telegraph">
          {battle.enemyDef.name}：次の行動 {move.icon} {move.telegraph}
        </div>
      )}

      <div className="turn-stage">
        {result ? (
          <div className="turn-stage__result" key={result.turn}>
            <div className="turn-stage__skill-name">{result.playerSkillName}</div>
            {result.playerHits.length > 0 && (
              <div className="turn-stage__hits">
                {result.playerHits.map((h, i) => (
                  <span key={i} className={h.isBig ? 'turn-hit turn-hit--big' : 'turn-hit'}>
                    {h.amount}
                  </span>
                ))}
              </div>
            )}
            {result.playerHits.length > 1 && <div className="turn-stage__enemy-line">合計 {result.playerTotalDamage} ダメージ</div>}
            {result.enemyMoveName && (
              <div className="turn-stage__enemy-line">
                {result.enemyMoveName}：{result.enemyDamageToPlayer}ダメージ{result.enemyDamageReducedPct > 0 ? `（-${result.enemyDamageReducedPct}%軽減）` : ''}
                {result.reflectedDamage > 0 ? ` ／ 反射${result.reflectedDamage}` : ''}
              </div>
            )}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            コマンドを選んで戦闘を開始してください。
          </div>
        )}
      </div>

      <div className="turn-commands">
        {TURN_COMMAND_SLOTS.map((slot) => (
          <CommandButton
            key={slot}
            slot={slot}
            skill={activeSkills[slot]}
            cooldown={battle.cooldowns[slot]}
            disabledByStatus={battle.status !== 'ongoing'}
            glow={glowSlot === slot}
            onClick={() => onUseCommand(slot)}
          />
        ))}
      </div>

      <div className="turn-log">
        {battle.log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function CommandButton({
  slot,
  skill,
  cooldown,
  disabledByStatus,
  glow,
  onClick,
}: {
  slot: TurnCommandSlot;
  skill: TurnSkillDef | null;
  cooldown: number;
  disabledByStatus: boolean;
  glow: boolean;
  onClick: () => void;
}) {
  const onCooldown = cooldown > 0;
  const disabled = disabledByStatus || !skill || onCooldown;
  let reason = '';
  if (disabledByStatus) reason = '戦闘は終了しています';
  else if (!skill) reason = '使用できる技がありません';
  else if (onCooldown) reason = `クールダウン中（残り${cooldown}ターン）`;

  return (
    <button className={`turn-command${glow ? ' turn-command--glow' : ''}`} disabled={disabled} onClick={onClick} title={skill?.description}>
      <span className="turn-command__slot">
        {TURN_SLOT_ICONS[slot]} {TURN_COMMAND_SLOT_LABELS[slot]}
      </span>
      <span className="turn-command__name">{skill ? skill.name : '—'}</span>
      {skill && <span className="turn-command__desc">{skill.description}</span>}
      {skill && <span className="turn-command__power">{describeSkillPower(skill)}</span>}
      {skill && skill.cooldown > 0 && <span className="turn-command__cd">CD {onCooldown ? `残り${cooldown}` : `${skill.cooldown}ターン`}</span>}
      {reason && <span className="turn-command__reason">{reason}</span>}
    </button>
  );
}

function SkillTable({ activeSkills }: { activeSkills: ActiveSkills }) {
  return (
    <table className="turn-skill-table">
      <thead>
        <tr>
          <th>枠</th>
          <th>技名</th>
          <th>条件</th>
          <th>優先度</th>
          <th>CD</th>
        </tr>
      </thead>
      <tbody>
        {TURN_SKILLS.map((s) => {
          const isActive = activeSkills[s.commandSlot]?.skillId === s.skillId;
          return (
            <tr key={s.skillId} className={isActive ? 'turn-skill-table__active' : ''}>
              <td>{TURN_COMMAND_SLOT_LABELS[s.commandSlot]}</td>
              <td>
                {s.name}
                {isActive ? ' ✅' : ''}
              </td>
              <td>{describeSkillCondition(s)}</td>
              <td>{s.priority}</td>
              <td>{s.cooldown === 0 ? 'なし' : `${s.cooldown}T`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
