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
import type { HintSceneId } from '../data/hints';
import {
  clearSeenHintIds,
  hasContinuableRun,
  loadGallery,
  loadRun,
  loadSeenHintIds,
  loadSettings,
  saveGallery,
  saveRun,
  saveSeenHintIds,
  saveSettings,
  type NamedChimeraLike,
  type Settings,
} from './storage';

export type NamedChimera = NamedChimeraLike;

// アプリ全体の画面遷移。タイトル / 初期コア選択 は「ラン」とは独立したUI状態として管理する
// （RunStateのphaseはラン内部のフェーズ(prep/battle/drop/result)のみを表す）。
export type Screen = 'title' | 'coreSelect' | 'game';

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
  | { type: 'START_NEW_RUN'; coreId: string }
  | { type: 'LOAD_RUN'; run: RunState };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'START_NEW_RUN':
      return createInitialRunState(action.coreId);
    case 'LOAD_RUN':
      return action.run;
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

  // --- オンボーディング(タイトル/初期コア選択/ヒント/設定) ---
  screen: Screen;
  hasSavedRun: boolean;
  goToTitle: () => void;
  goToCoreSelect: () => void;
  confirmCore: (coreId: string) => void;
  continueRun: () => boolean; // 読み込みに失敗した場合はfalseを返す
  activeHint: HintSceneId | null;
  triggerHint: (id: HintSceneId) => void;
  dismissHint: () => void;
  resetHints: () => void;
  settings: Settings;
  setVolume: (v: number) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialRunState);
  const battleEngineRef = useRef<BattleEngine | null>(null);
  const [equipError, setEquipErrorState] = React.useState<string | null>(null);
  const setEquipError = useCallback((msg: string | null) => setEquipErrorState(msg), []);
  const [showIntro, setShowIntro] = React.useState(false);
  const [chimeraGallery, setChimeraGallery] = React.useState<NamedChimera[]>(() => loadGallery<NamedChimera>());
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

  // 図鑑が変化するたびにブラウザへ保存する（ラン進行状況とは別領域）
  useEffect(() => {
    saveGallery(chimeraGallery);
  }, [chimeraGallery]);

  // --- タイトル / 初期コア選択 ---
  const [screen, setScreen] = React.useState<Screen>('title');
  const [hasSavedRun, setHasSavedRun] = React.useState<boolean>(() => hasContinuableRun());
  const goToTitle = useCallback(() => {
    setHasSavedRun(hasContinuableRun());
    setScreen('title');
  }, []);
  const goToCoreSelect = useCallback(() => setScreen('coreSelect'), []);

  // --- ヒント ---
  // 複数の場面ヒントがほぼ同時に発生した場合（例: コア選択直後の「保存」と「最初の敵」）、
  // 後から来た方を黙って捨てず、1つずつ順番に表示できるようキューで保持する。
  const [seenHints, setSeenHints] = React.useState<Set<HintSceneId>>(() => new Set(loadSeenHintIds() as HintSceneId[]));
  const [hintQueue, setHintQueue] = React.useState<HintSceneId[]>([]);
  const activeHint = hintQueue[0] ?? null;
  const triggerHint = useCallback(
    (id: HintSceneId) => {
      if (seenHints.has(id)) return;
      setSeenHints((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        saveSeenHintIds(Array.from(next));
        return next;
      });
      setHintQueue((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [seenHints]
  );
  const dismissHint = useCallback(() => setHintQueue((prev) => prev.slice(1)), []);
  const resetHints = useCallback(() => {
    clearSeenHintIds();
    setSeenHints(new Set());
    setHintQueue([]);
  }, []);

  // --- 設定(音量) ---
  const [settings, setSettings] = React.useState<Settings>(() => loadSettings());
  const setVolume = useCallback((v: number) => {
    setSettings((prev) => {
      const next = { ...prev, volume: Math.max(0, Math.min(100, Math.round(v))) };
      saveSettings(next);
      return next;
    });
  }, []);

  const confirmCore = useCallback(
    (coreId: string) => {
      dispatch({ type: 'START_NEW_RUN', coreId });
      setScreen('game');
      triggerHint('first_save');
    },
    [triggerHint]
  );

  const continueRun = useCallback(() => {
    const run = loadRun();
    if (!run) return false;
    dispatch({ type: 'LOAD_RUN', run });
    setScreen('game');
    return true;
  }, []);

  // 実際に開始したラン(coreIdあり)のみ自動保存する。タイトル起動直後のダミー初期状態は保存しない。
  useEffect(() => {
    if (!state.coreId) return;
    saveRun(state);
    setHasSavedRun(true);
  }, [state]);

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
      screen,
      hasSavedRun,
      goToTitle,
      goToCoreSelect,
      confirmCore,
      continueRun,
      activeHint,
      triggerHint,
      dismissHint,
      resetHints,
      settings,
      setVolume,
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
      screen,
      hasSavedRun,
      goToTitle,
      goToCoreSelect,
      confirmCore,
      continueRun,
      activeHint,
      triggerHint,
      dismissHint,
      resetHints,
      settings,
      setVolume,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
