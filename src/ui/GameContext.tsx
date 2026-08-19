import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import {
  addNamedChimeraToStore,
  loadCollectionStore,
  markEnemiesSeen,
  markPartsSeen,
  registerEnemyDiscovery,
  registerPartDiscovery,
  saveCollectionStore,
  type CollectionStoreV2,
  type NamedChimera,
} from '../engine/collectionStore';
import { baseEnemyIdForCollection } from '../data/enemyCatalog';
import { WEAK_ARM } from '../data/parts';

export type { NamedChimera } from '../engine/collectionStore';

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
  | { type: 'MARK_COMMANDS_SEEN'; commandIds?: string[] };

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
  // 図鑑(部位・敵・キメラ)の統合永続ストア。saveVersion付きでブラウザへ保存される。
  collection: CollectionStoreV2;
  addNamedChimera: (entry: Omit<NamedChimera, 'id' | 'createdAt'>) => void;
  markPartsSeen: (ids?: string[]) => void;
  markEnemiesSeen: (ids?: string[]) => void;
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
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialRunState);
  const battleEngineRef = useRef<BattleEngine | null>(null);
  const [equipError, setEquipErrorState] = React.useState<string | null>(null);
  const setEquipError = useCallback((msg: string | null) => setEquipErrorState(msg), []);
  const [showIntro, setShowIntro] = React.useState(true);
  const [collection, setCollection] = useState<CollectionStoreV2>(loadCollectionStore);
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
    setCollection((prev) => addNamedChimeraToStore(prev, entry));
  }, []);
  const markPartsSeenCb = useCallback((ids?: string[]) => setCollection((prev) => markPartsSeen(prev, ids)), []);
  const markEnemiesSeenCb = useCallback((ids?: string[]) => setCollection((prev) => markEnemiesSeen(prev, ids)), []);

  // 部位図鑑の自動登録: 装着中・インベントリ中のdefIdを見て、まだ記録が無いものを登録する。
  // 取得経路(ドロップ・デバッグ付与・初期装備)によらず1箇所に集約することで、
  // 呼び出し側ごとの登録漏れ・分岐の増加を防ぐ。
  useEffect(() => {
    const heldDefIds = new Set([...state.equipped.map((i) => i.defId), ...state.inventory.map((i) => i.defId), WEAK_ARM.id]);
    setCollection((prev) => {
      let next = prev;
      for (const defId of heldDefIds) {
        const result = registerPartDiscovery(next, defId, state.runId);
        next = result.store;
      }
      return next;
    });
  }, [state.equipped, state.inventory, state.runId]);

  // 敵図鑑の自動登録: 戦闘に登場した敵(中ボスは元の強敵個体へ正規化)を発見済みにする。
  useEffect(() => {
    if (!state.currentEnemy) return;
    const baseId = baseEnemyIdForCollection(state.currentEnemy.id);
    setCollection((prev) => registerEnemyDiscovery(prev, baseId, state.runId).store);
  }, [state.currentEnemy, state.runId]);

  // 図鑑が変化するたびにブラウザへ保存する（ラン進行状況は対象外）
  useEffect(() => {
    saveCollectionStore(collection);
  }, [collection]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      battleEngineRef,
      equipError,
      setEquipError,
      showIntro,
      setShowIntro,
      collection,
      addNamedChimera,
      markPartsSeen: markPartsSeenCb,
      markEnemiesSeen: markEnemiesSeenCb,
      battleResetSignal,
      triggerBattleReset,
      rewardQueue,
      pushRewardCards,
      advanceRewardQueue,
      clearRewardQueue,
    }),
    [
      state,
      equipError,
      setEquipError,
      showIntro,
      collection,
      addNamedChimera,
      markPartsSeenCb,
      markEnemiesSeenCb,
      battleResetSignal,
      triggerBattleReset,
      rewardQueue,
      pushRewardCards,
      advanceRewardQueue,
      clearRewardQueue,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
