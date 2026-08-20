import { useEffect, useState } from 'react';
import { useGame } from '../GameContext';
import { ALL_PARTS } from '../../data/parts';
import type { SpeedSetting } from '../../engine/battle';
import { equippedDefs, fusionEligiblePairs } from '../../engine/run';
import { ALL_COMMANDS, COMMAND_BALANCE, getCommandDef, resolveAllFamilies } from '../../data/commandDefs';
import { FUSION_RECIPES } from '../../data/fusion';
import type { Rarity } from '../../data/types';
import { buildCommandRewardCard, buildPartAcquiredCard } from '../rewardCardBuilders';
import type { CommandChangeEvent } from '../../engine/commandRewards';

const PROTOTYPE_COMMAND_TEST_PART_IDS = [
  'insect_sickle_arm',
  'insect_poison_needle_arm',
  'insect_poison_gland',
  'insect_compound_eye',
  'insect_web_mouth',
  'insect_carapace',
  'golem_giant_fist',
  'golem_crystal_eye',
  'golem_mana_furnace',
  'golem_reflect_armor',
  'dragon_flame_head',
  'dragon_heat_gland',
  'dragon_heart',
  'special_multi_arm_core',
  'special_thousand_bones',
  'special_total_predation',
  'special_plague_core',
  'special_colossal_heart',
];

export function DebugPanel({
  onOpenTurnTest,
  onOpenFreeLayerTest,
  ctbMode,
  onToggleCtbMode,
}: {
  onOpenTurnTest?: () => void;
  onOpenFreeLayerTest?: () => void;
  ctbMode?: boolean;
  onToggleCtbMode?: () => void;
}) {
  const { state, dispatch, battleEngineRef, triggerBattleReset } = useGame();
  const [open, setOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState(ALL_PARTS[0]?.id ?? '');
  const [showCommandTest, setShowCommandTest] = useState(false);
  const [showRewardTest, setShowRewardTest] = useState(false);
  const [selectedFusionRecipeId, setSelectedFusionRecipeId] = useState(FUSION_RECIPES[0]?.id ?? '');

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
      dispatch({ type: 'ENTER_ENEMY_SELECT' });
    } else if (state.phase === 'enemySelect') {
      const first = state.enemyCandidates[0];
      if (first) dispatch({ type: 'CHOOSE_ENEMY', enemyId: first.id });
    } else if (state.phase === 'battle') {
      const engine = battleEngineRef.current;
      if (!engine) return;
      engine.debugKillEnemy();
      const result = engine.getStatus();
      if (result !== 'ongoing') {
        dispatch({ type: 'FINISH_BATTLE', result, finalHp: engine.getFinalPlayerHp() });
      }
    } else if (state.phase === 'fusion') {
      dispatch({ type: 'RESOLVE_FUSION_STEP' });
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
        <label>融合(TEST16) 動作確認用</label>
        <div className="debug-panel__row">
          <select value={selectedFusionRecipeId} onChange={(e) => setSelectedFusionRecipeId(e.target.value)}>
            {FUSION_RECIPES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn--small"
            onClick={() => {
              const recipe = FUSION_RECIPES.find((r) => r.id === selectedFusionRecipeId);
              if (!recipe) return;
              dispatch({ type: 'DEBUG_GRANT_PART', defId: recipe.sourceDefIds[0] });
              dispatch({ type: 'DEBUG_GRANT_PART', defId: recipe.sourceDefIds[1] });
            }}
          >
            材料2部位を付与
          </button>
        </div>
        <div className="debug-panel__row">
          <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_FORCE_FUSION_PHASE' })}>
            融合オファー画面を開く
          </button>
          <span className="muted">現在の融合可能組み合わせ: {fusionEligiblePairs(state).length}件</span>
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
          {[0, 1, 2].map((v) => (
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

      {(onOpenTurnTest || onOpenFreeLayerTest) && (
        <div className="debug-panel__group">
          <label>検証中の別モード</label>
          <div className="debug-panel__row">
            {onOpenTurnTest && (
              <button className="btn btn--small" onClick={onOpenTurnTest}>
                ⚔️ コマンドバトルTESTを開く
              </button>
            )}
            {onOpenFreeLayerTest && (
              <button className="btn btn--small" onClick={onOpenFreeLayerTest}>
                🧪 自由合体レイヤーTESTを開く
              </button>
            )}
          </div>
        </div>
      )}

      {onToggleCtbMode && (
        <div className="debug-panel__group">
          <label>
            <input type="checkbox" checked={!!ctbMode} onChange={onToggleCtbMode} /> ⏱ CTB戦闘モード(TEST19プロトタイプ)を使う
          </label>
          <span className="muted" style={{ fontSize: '0.68rem' }}>
            OFFにすると通常戦闘画面(TEST18)に戻ります。次に戦闘フェーズへ入るときから反映されます。
          </span>
        </div>
      )}

      <div className="debug-panel__group">
        <button className="btn btn--small" onClick={() => setShowCommandTest((v) => !v)}>
          ⚡ コマンドシステムTEST{showCommandTest ? '（閉じる）' : ''}
        </button>
      </div>

      {showCommandTest && <CommandSystemTestSection state={state} dispatch={dispatch} battleEngineRef={battleEngineRef} triggerBattleReset={triggerBattleReset} />}

      <div className="debug-panel__group">
        <button className="btn btn--small" onClick={() => setShowRewardTest((v) => !v)}>
          🎁 報酬演出TEST{showRewardTest ? '（閉じる）' : ''}
        </button>
      </div>

      {showRewardTest && <RewardFlowTestSection />}
    </div>
  );
}

const RARITY_OPTIONS: Rarity[] = ['common', 'uncommon', 'rare'];
// 進化演出のプレビュー用に、2段階以上あるfamilyを1つ使う(実データをそのまま利用し、
// プレビュー専用の別データは作らない)。
const DEMO_EVOLUTION_FAMILY = 'poisonburst';

function RewardFlowTestSection() {
  const { state, dispatch, rewardQueue, pushRewardCards, clearRewardQueue } = useGame();
  const [rarity, setRarity] = useState<Rarity>('rare');
  const eqDefs = equippedDefs(state);

  function previewPart() {
    const def = ALL_PARTS.find((p) => p.rarity === rarity) ?? ALL_PARTS[0];
    pushRewardCards([{ ...buildPartAcquiredCard(def), rarity }]);
  }

  function previewUnlocked() {
    const cmd = ALL_COMMANDS.find((c) => c.evolvedFrom === null && c.familyId !== 'strike' && c.familyId !== 'guard' && c.familyId !== 'recover') ?? ALL_COMMANDS[0];
    const change: CommandChangeEvent = { familyId: cmd.familyId, kind: 'unlocked', from: null, to: cmd, wasEquippedSlot: -1 };
    pushRewardCards([{ ...buildCommandRewardCard(change, eqDefs), rarity }]);
  }

  function previewEvolved() {
    const lower = getCommandDef('cmd_poison_burst')!;
    const upper = getCommandDef('cmd_plague_burst')!;
    const change: CommandChangeEvent = { familyId: DEMO_EVOLUTION_FAMILY, kind: 'evolved', from: lower, to: upper, wasEquippedSlot: -1 };
    pushRewardCards([{ ...buildCommandRewardCard(change, eqDefs), rarity }]);
  }

  function previewMultiple() {
    const partDef = ALL_PARTS.find((p) => p.rarity === 'common') ?? ALL_PARTS[0];
    const unlockCmd = ALL_COMMANDS.find((c) => c.familyId === 'eyefocus') ?? ALL_COMMANDS[0];
    const lower = getCommandDef('cmd_harden')!;
    const upper = getCommandDef('cmd_reflect_shell')!;
    pushRewardCards([
      { ...buildPartAcquiredCard(partDef), rarity: 'common' },
      { ...buildCommandRewardCard({ familyId: unlockCmd.familyId, kind: 'unlocked', from: null, to: unlockCmd, wasEquippedSlot: -1 }, eqDefs), rarity: 'uncommon' },
      { ...buildCommandRewardCard({ familyId: 'harden', kind: 'evolved', from: lower, to: upper, wasEquippedSlot: -1 }, eqDefs), rarity: 'rare' },
    ]);
  }

  function makeEmptySlot() {
    dispatch({ type: 'SET_COMMAND_SLOT', slotIndex: 3, familyId: null });
  }

  function fillAllSlots() {
    const families = resolveAllFamilies(eqDefs)
      .filter((f) => f.command)
      .slice(0, 4);
    families.forEach((f, i) => dispatch({ type: 'SET_COMMAND_SLOT', slotIndex: i, familyId: f.familyId }));
  }

  return (
    <div className="debug-panel__group cmd-debug-section">
      <label>プレビューするレアリティ</label>
      <div className="debug-panel__row">
        {RARITY_OPTIONS.map((r) => (
          <button key={r} className={`btn btn--small${rarity === r ? ' btn--primary' : ''}`} onClick={() => setRarity(r)}>
            {r}
          </button>
        ))}
      </div>

      <label>演出プレビュー(戦闘準備画面などフェーズに関わらず表示されます)</label>
      <div className="debug-panel__row" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn--small" onClick={previewPart}>
          🎁 部位獲得演出
        </button>
        <button className="btn btn--small" onClick={previewUnlocked}>
          ⚡ コマンド獲得演出
        </button>
        <button className="btn btn--small" onClick={previewEvolved}>
          🧬 コマンド進化演出
        </button>
        <button className="btn btn--small" onClick={previewMultiple}>
          📚 複数報酬を連続表示(3件)
        </button>
      </div>

      <label>コマンド枠の状態</label>
      <div className="debug-panel__row">
        <button className="btn btn--small" onClick={makeEmptySlot}>
          枠4を空ける
        </button>
        <button className="btn btn--small" onClick={fillAllSlots}>
          可能な範囲で4枠を埋める
        </button>
      </div>

      <label>NEWバッジ</label>
      <div className="debug-panel__row">
        <button className="btn btn--small" onClick={() => dispatch({ type: 'RECORD_COMMAND_DISCOVERIES', commandIds: ['cmd_plague_burst'] })}>
          バッジを付与(テスト用)
        </button>
        <button className="btn btn--small" onClick={() => dispatch({ type: 'MARK_COMMANDS_SEEN' })}>
          バッジを解除
        </button>
        <span className="muted">未確認: {state.unseenCommandIds.length}件</span>
      </div>

      <label>報酬演出キュー</label>
      <div className="debug-panel__row">
        <button className="btn btn--small btn--danger" onClick={clearRewardQueue}>
          キューをリセット
        </button>
        <span className="muted">キュー残り: {rewardQueue.length}件</span>
      </div>
    </div>
  );
}

function CommandSystemTestSection({
  state,
  dispatch,
  battleEngineRef,
  triggerBattleReset,
}: Pick<ReturnType<typeof useGame>, 'state' | 'dispatch' | 'battleEngineRef' | 'triggerBattleReset'>) {
  const [regenDraft, setRegenDraft] = useState('');
  const [forceSlot, setForceSlot] = useState('0');
  const [forceCommandId, setForceCommandId] = useState(ALL_COMMANDS[0]?.commandId ?? '');
  const [enemyHpDraft, setEnemyHpDraft] = useState('');
  const [playerHpDraft, setPlayerHpDraft] = useState('');
  const [enemyAtkMultDraft, setEnemyAtkMultDraft] = useState('1');
  const [prototypePartId, setPrototypePartId] = useState(PROTOTYPE_COMMAND_TEST_PART_IDS[0]);

  const inBattle = state.phase === 'battle';
  const engine = battleEngineRef.current;
  const eqDefs = equippedDefs(state);
  const families = resolveAllFamilies(eqDefs);
  const snapshot = inBattle && engine ? engine.getSnapshot() : null;

  return (
    <div className="debug-panel__group cmd-debug-section">
      <label>代謝ゲージ</label>
      <div className="debug-panel__row">
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugSetMetabolism(COMMAND_BALANCE.metabolismMax)}>
          ゲージを最大にする
        </button>
        <input
          type="number"
          placeholder="回復速度/秒"
          style={{ width: 90 }}
          value={regenDraft}
          onChange={(e) => setRegenDraft(e.target.value)}
        />
        <button
          className="btn btn--small"
          disabled={!inBattle || regenDraft === ''}
          onClick={() => engine?.debugSetMetabolismRegenPerSecond(Number(regenDraft))}
        >
          適用
        </button>
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugSetMetabolismRegenPerSecond(null)}>
          既定に戻す
        </button>
      </div>

      <label>クールダウン・戦闘</label>
      <div className="debug-panel__row">
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugResetCommandCooldowns()}>
          全クールダウンをリセット
        </button>
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugResetResultStats()}>
          戦闘結果の数値をリセット
        </button>
        <button className="btn btn--small" disabled={!inBattle} onClick={triggerBattleReset}>
          🔁 この戦闘をリセット
        </button>
      </div>

      <label>コマンドを強制解放（条件を無視して枠へ装備）</label>
      <div className="debug-panel__row">
        <select value={forceSlot} onChange={(e) => setForceSlot(e.target.value)}>
          {[0, 1, 2, 3].map((i) => (
            <option key={i} value={i}>
              枠{i + 1}
            </option>
          ))}
        </select>
        <select value={forceCommandId} onChange={(e) => setForceCommandId(e.target.value)}>
          {ALL_COMMANDS.map((c) => (
            <option key={c.commandId} value={c.commandId}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugForceUnlockCommand(Number(forceSlot), forceCommandId)}>
          強制解放
        </button>
      </div>

      <label>装備中コマンド（部位条件を満たすものだけ選択可）</label>
      <div className="debug-panel__row" style={{ flexWrap: 'wrap' }}>
        {[0, 1, 2, 3].map((slotIndex) => (
          <select
            key={slotIndex}
            value={state.commandLoadout[slotIndex] ?? ''}
            onChange={(e) => dispatch({ type: 'SET_COMMAND_SLOT', slotIndex, familyId: e.target.value || null })}
          >
            <option value="">枠{slotIndex + 1}: 空き</option>
            {families
              .filter((f) => f.command)
              .map((f) => (
                <option key={f.familyId} value={f.familyId}>
                  {f.command!.icon} {f.command!.name}
                </option>
              ))}
          </select>
        ))}
      </div>

      <label>試作用部位を追加（容量が足りればその場で装着）</label>
      <div className="debug-panel__row">
        <select value={prototypePartId} onChange={(e) => setPrototypePartId(e.target.value)}>
          {PROTOTYPE_COMMAND_TEST_PART_IDS.map((id) => {
            const def = ALL_PARTS.find((p) => p.id === id);
            return (
              <option key={id} value={id}>
                {def ? `${def.icon} ${def.name}` : id}
              </option>
            );
          })}
        </select>
        <button className="btn btn--small" onClick={() => dispatch({ type: 'DEBUG_GRANT_AND_EQUIP_PART', defId: prototypePartId })}>
          追加して装着
        </button>
      </div>
      <label>装着中の部位を外す</label>
      <div className="debug-panel__row" style={{ flexWrap: 'wrap' }}>
        {state.equipped.map((item) => {
          const def = ALL_PARTS.find((p) => p.id === item.defId);
          return (
            <button key={item.instanceId} className="btn btn--small" onClick={() => dispatch({ type: 'UNEQUIP', instanceId: item.instanceId })}>
              {def?.icon} {def?.name} ✕
            </button>
          );
        })}
        {state.equipped.length === 0 && <span className="muted">装着中の部位はありません</span>}
      </div>

      <label>HP / 敵の攻撃力</label>
      <div className="debug-panel__row">
        <input type="number" placeholder="プレイヤーHP" style={{ width: 100 }} value={playerHpDraft} onChange={(e) => setPlayerHpDraft(e.target.value)} />
        <button className="btn btn--small" disabled={!inBattle || playerHpDraft === ''} onClick={() => engine?.debugSetHp('player', Number(playerHpDraft))}>
          適用
        </button>
        <input type="number" placeholder="敵HP" style={{ width: 90 }} value={enemyHpDraft} onChange={(e) => setEnemyHpDraft(e.target.value)} />
        <button className="btn btn--small" disabled={!inBattle || enemyHpDraft === ''} onClick={() => engine?.debugSetHp('enemy', Number(enemyHpDraft))}>
          適用
        </button>
      </div>
      <div className="debug-panel__row">
        <input type="number" step="0.1" placeholder="敵攻撃力倍率" style={{ width: 110 }} value={enemyAtkMultDraft} onChange={(e) => setEnemyAtkMultDraft(e.target.value)} />
        <button className="btn btn--small" disabled={!inBattle} onClick={() => engine?.debugSetEnemyAttackMult(Number(enemyAtkMultDraft) || 1)}>
          適用（累積倍率）
        </button>
      </div>

      {snapshot && (
        <div className="muted cmd-debug-effects">
          <div>
            プレイヤーのバフ・デバフ: {snapshot.player.activeEffects.map((e) => `${e.sourceName}(残${e.remaining}s)`).join('、') || 'なし'}
          </div>
          <div>敵のバフ・デバフ: {snapshot.enemy.activeEffects.map((e) => `${e.sourceName}(残${e.remaining}s)`).join('、') || 'なし'}</div>
        </div>
      )}
    </div>
  );
}
