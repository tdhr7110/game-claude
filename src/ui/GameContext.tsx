import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { RunState } from '../engine/run';
import {
  acceptDrop,
  advanceToNextBattle,
  createInitialRunState,
  debugAddCapacity,
  debugFullHeal,
  debugGrantAndEquipPart,
  debugGrantPart,
  enterBattle,
  equipPart,
  finishBattle,
  markCommandsSeen,
  recordCommandDiscoveries,
  resetRun,
  setCommandSlot,
  skipDrop,
  toggleVerboseLog,
  unequipPart,
} from '../engine/run';
import type { BattleEngine } from '../engine/battle';
import type { RewardCard } from '../data/rewardPresentation';
import type { CodexState } from '../engine/codex';
import { markPartsDiscovered, recordEnemyDefeat, recordEnemyEncounter } from '../engine/codex';
import { loadCodexState, saveCodexState } from '../persistence/codexPersistence';
import { clearRunSave, loadRunState, saveRunState } from '../persistence/runPersistence';

export interface NamedChimera {
  id: string;
  name: string;
  outcome: 'victory' | 'defeat';
  battleReached: number;
  icons: string[]; // 命名時点で装着していた部位アイコンのスナップショット（表示用）
  partIds: string[]; // 命名時点で装着していた部位のID（図鑑の詳細表示で参照する）
  permanentCapacityBonus: number; // 命名時点の永続接続容量ボーナス（図鑑のビルド全体表示で接続容量を正しく計算するため）
  createdAt: number;
}

// キメラ図鑑だけをブラウザに保存する（ラン進行状況はセーブ対象外）。
// 形式が壊れている・将来スキーマが変わった場合は空配列にフォールバックする。
// 注: このキーはtest9より前から使われている既存キーのため、あえて
// persistence/storageKeys.ts のtest9 namespaceへは移行しない(既存データを失わないため)。
const GALLERY_STORAGE_KEY = 'chimera-battle:gallery:v1';

function loadGalleryFromStorage(): NamedChimera[] {
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Omit<NamedChimera, 'partIds' | 'permanentCapacityBonus'> & { partIds?: unknown; permanentCapacityBonus?: unknown } =>
          c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.icons) && typeof c.createdAt === 'number'
      )
      .map((c) => ({
        ...c,
        partIds: Array.isArray(c.partIds) ? (c.partIds as string[]) : [],
        permanentCapacityBonus: typeof c.permanentCapacityBonus === 'number' ? c.permanentCapacityBonus : 0,
      }));
  } catch {
    return [];
  }
}

type Action =
  | { type: 'EQUIP'; instanceId: string }
  | { type: 'UNEQUIP'; instanceId: string }
  | { type: 'ENTER_BATTLE' }
  | { type: 'FINISH_BATTLE'; result: 'won' | 'lost'; finalHp: number }
  | { type: 'ACCEPT_DROP'; defId: string; wantEquip: boolean }
  | { type: 'SKIP_DROP' }
  | { type: 'NEXT_BATTLE' }
  | { type: 'RESET' }
  | { type: 'DEBUG_ADD_CAPACITY'; delta: number }
  | { type: 'DEBUG_FULL_HEAL' }
  | { type: 'DEBUG_GRANT_PART'; defId: string }
  | { type: 'DEBUG_GRANT_AND_EQUIP_PART'; defId: string }
  | { type: 'TOGGLE_VERBOSE' }
  | { type: 'SET_COMMAND_SLOT'; slotIndex: number; familyId: string | null }
  | { type: 'RECORD_COMMAND_DISCOVERIES'; commandIds: string[] }
  | { type: 'MARK_COMMANDS_SEEN'; commandIds?: string[] }
  // ラン途中保存(優先6)からの復元専用アクション。保存されたRunStateをそのまま採用する。
  | { type: 'LOAD_RUN'; state: RunState };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'EQUIP':
      return equipPart(state, action.instanceId).state;
    case 'UNEQUIP':
      return unequipPart(state, action.instanceId);
    case 'ENTER_BATTLE':
      return enterBattle(state);
    case 'FINISH_BATTLE':
      return finishBattle(state, action.result, action.finalHp);
    case 'ACCEPT_DROP':
      return acceptDrop(state, action.defId, action.wantEquip).state;
    case 'SKIP_DROP':
      return skipDrop(state);
    case 'NEXT_BATTLE':
      return advanceToNextBattle(state);
    case 'RESET':
      return resetRun();
    case 'DEBUG_ADD_CAPACITY':
      return debugAddCapacity(state, action.delta);
    case 'DEBUG_FULL_HEAL':
      return debugFullHeal(state);
    case 'DEBUG_GRANT_PART':
      return debugGrantPart(state, action.defId);
    case 'DEBUG_GRANT_AND_EQUIP_PART':
      return debugGrantAndEquipPart(state, action.defId);
    case 'TOGGLE_VERBOSE':
      return toggleVerboseLog(state);
    case 'SET_COMMAND_SLOT':
      return setCommandSlot(state, action.slotIndex, action.familyId).state;
    case 'RECORD_COMMAND_DISCOVERIES':
      return recordCommandDiscoveries(state, action.commandIds);
    case 'MARK_COMMANDS_SEEN':
      return markCommandsSeen(state, action.commandIds);
    case 'LOAD_RUN':
      return action.state;
    default:
      return state;
  }
}

interface GameContextValue {
  state: RunState;
  dispatch: React.Dispatch<Action>;
  battleEngineRef: React.MutableRefObject<BattleEngine | null>;
  equipError: string | null;
  setEquipError: (msg: string | null) => void;
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
  chimeraGallery: NamedChimera[];
  addNamedChimera: (entry: Omit<NamedChimera, 'id' | 'createdAt'>) => void;
  // コマンドシステムTEST用: 同じ敵と同じビルドのまま、現在の戦闘だけをやり直すためのシグナル。
  // BattleScreenのuseEffectがこの値の変化を検知して戦闘を再構築する(ラン進行自体は変更しない)。
  battleResetSignal: number;
  triggerBattleReset: () => void;
  // 報酬演出キュー(TEST6): 部位獲得・コマンド獲得・コマンド進化のカードを1件ずつ順番に表示する。
  // ランの進行状態(RunState)とは別の一時的なUI状態のため、こちらで保持する。
  rewardQueue: RewardCard[];
  pushRewardCards: (cards: RewardCard[]) => void;
  advanceRewardQueue: () => void;
  clearRewardQueue: () => void;
  // ラン途中保存(優先6): 起動時に有効な保存が見つかった場合のみnon-null。
  // 「続きから」「新しいラン」の選択待ちであることを表す。
  pendingResume: RunState | null;
  resumeRun: () => void;
  discardResumeAndStartNew: () => void;
  // 収集図鑑(優先7): 部位図鑑・敵図鑑の発見状況。命名キメラ図鑑(chimeraGallery)は別管理。
  codex: CodexState;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialRunState);
  const battleEngineRef = useRef<BattleEngine | null>(null);
  const [equipError, setEquipErrorState] = React.useState<string | null>(null);
  const setEquipError = useCallback((msg: string | null) => setEquipErrorState(msg), []);
  const [showIntro, setShowIntro] = React.useState(true);
  const [chimeraGallery, setChimeraGallery] = React.useState<NamedChimera[]>(loadGalleryFromStorage);
  const [battleResetSignal, setBattleResetSignal] = React.useState(0);
  const triggerBattleReset = useCallback(() => setBattleResetSignal((v) => v + 1), []);
  const [rewardQueue, setRewardQueue] = React.useState<RewardCard[]>([]);
  const pushRewardCards = useCallback((cards: RewardCard[]) => {
    if (cards.length === 0) return;
    setRewardQueue((prev) => [...prev, ...cards]);
  }, []);
  const advanceRewardQueue = useCallback(() => setRewardQueue((prev) => prev.slice(1)), []);
  const clearRewardQueue = useCallback(() => setRewardQueue([]), []);
  const addNamedChimera = useCallback((entry: Omit<NamedChimera, 'id' | 'createdAt'>) => {
    const chimera: NamedChimera = { ...entry, id: `chimera_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
    setChimeraGallery((prev) => [chimera, ...prev]);
  }, []);

  // 図鑑が変化するたびにブラウザへ保存する（ラン進行状況は対象外）
  useEffect(() => {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(chimeraGallery));
    } catch {
      // 保存容量オーバーなどは無視（図鑑保存は補助機能のため、ゲーム進行自体には影響させない）
    }
  }, [chimeraGallery]);

  // --- ラン途中保存(優先6) ---
  // 起動時に有効な保存が見つかった場合、ユーザーが「続きから/新しいラン」を選ぶまでは
  // stateへ反映しない(pendingResumeで保持するだけ)。選択が決まるまでオートセーブも止める
  // (でないと選択待ち中の初期状態でオートセーブが発火し、保存済みデータを上書きしてしまう)。
  const [pendingResume, setPendingResume] = React.useState<RunState | null>(() => loadRunState());
  // 敵遭遇・撃破の二重カウントを防ぐための直前フェーズ記録。
  // 通常のuseState/useRef初期化はコンポーネント初回マウント時の値を採用するため、
  // 「続きから」で復元した瞬間のズレはresumeRun内で明示的に補正する。
  const prevPhaseRef = useRef<RunState['phase']>(state.phase);

  const resumeRun = useCallback(() => {
    setPendingResume((current) => {
      if (!current) return current;
      prevPhaseRef.current = current.phase;
      dispatch({ type: 'LOAD_RUN', state: current });
      return null;
    });
  }, []);

  const discardResumeAndStartNew = useCallback(() => {
    clearRunSave();
    setPendingResume(null);
  }, []);

  useEffect(() => {
    if (pendingResume !== null) return; // 選択待ち中は保存済みデータを上書きしない
    if (state.phase === 'result') {
      // ラン終了(勝利・敗北)後は途中保存だけを削除する。命名キメラ図鑑は対象外(別ストレージ)。
      clearRunSave();
    } else {
      // 戦闘中の毎フレーム保存はしない。stateはフェーズ単位(戦闘準備・敵選択・戦闘開始直前・
      // 戦闘勝利後・ドロップ選択・次戦移動)でしか変化しないため、このuseEffectは
      // 結果的にチェックポイント保存として機能する。
      saveRunState(state);
    }
  }, [state, pendingResume]);

  // --- 収集図鑑(優先7): 部位図鑑・敵図鑑 ---
  const [codex, setCodex] = React.useState<CodexState>(() => loadCodexState());

  useEffect(() => {
    saveCodexState(codex);
  }, [codex]);

  // 部位図鑑: 装着中またはインベントリ中の部位idを「発見済み」として記録する。
  // 初期支給の弱い腕や、デバッグ付与を含めすべての入手経路をこの1箇所で拾える。
  useEffect(() => {
    const ownedDefIds = [...state.equipped, ...state.inventory].map((i) => i.defId);
    if (ownedDefIds.length === 0) return;
    setCodex((prev) => markPartsDiscovered(prev, ownedDefIds));
  }, [state.equipped, state.inventory]);

  // 敵図鑑: フェーズの実遷移(prep/drop/result → battle は遭遇、battle → drop/勝利result は撃破)を
  // 検知して記録する。pendingResume解決待ち中は判定しない(未確定の初期状態を見てしまうため)。
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (pendingResume !== null) return;
    if (prevPhase === state.phase) return;
    const enemy = state.currentEnemy;
    if (!enemy) return;
    if (state.phase === 'battle') {
      setCodex((prev) => recordEnemyEncounter(prev, enemy.id));
    } else if (prevPhase === 'battle' && (state.phase === 'drop' || (state.phase === 'result' && state.resultOutcome === 'victory'))) {
      setCodex((prev) => recordEnemyDefeat(prev, enemy.id));
    }
  }, [state.phase, state.currentEnemy, state.resultOutcome, pendingResume]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      battleEngineRef,
      equipError,
      setEquipError,
      showIntro,
      setShowIntro,
      chimeraGallery,
      addNamedChimera,
      battleResetSignal,
      triggerBattleReset,
      rewardQueue,
      pushRewardCards,
      advanceRewardQueue,
      clearRewardQueue,
      pendingResume,
      resumeRun,
      discardResumeAndStartNew,
      codex,
    }),
    [
      state,
      equipError,
      setEquipError,
      showIntro,
      chimeraGallery,
      addNamedChimera,
      battleResetSignal,
      triggerBattleReset,
      rewardQueue,
      pushRewardCards,
      advanceRewardQueue,
      clearRewardQueue,
      pendingResume,
      resumeRun,
      discardResumeAndStartNew,
      codex,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
