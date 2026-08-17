import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { RunState } from '../engine/run';
import {
  acceptDrop,
  advanceToNextBattle,
  createInitialRunState,
  debugAddCapacity,
  debugFullHeal,
  debugGrantPart,
  enterBattle,
  equipPart,
  finishBattle,
  resetRun,
  skipDrop,
  toggleVerboseLog,
  unequipPart,
} from '../engine/run';
import type { BattleEngine } from '../engine/battle';

export interface NamedChimera {
  id: string;
  name: string;
  outcome: 'victory' | 'defeat';
  battleReached: number;
  icons: string[]; // 命名時点で装着していた部位アイコンのスナップショット（表示用）
  partIds: string[]; // 命名時点で装着していた部位のID（図鑑の詳細表示で参照する）
  createdAt: number;
}

// キメラ図鑑だけをブラウザに保存する（ラン進行状況はセーブ対象外）。
// 形式が壊れている・将来スキーマが変わった場合は空配列にフォールバックする。
const GALLERY_STORAGE_KEY = 'chimera-battle:gallery:v1';

function loadGalleryFromStorage(): NamedChimera[] {
  try {
    const raw = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Omit<NamedChimera, 'partIds'> & { partIds?: unknown } =>
          c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.icons) && typeof c.createdAt === 'number'
      )
      .map((c) => ({ ...c, partIds: Array.isArray(c.partIds) ? (c.partIds as string[]) : [] }));
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
  | { type: 'TOGGLE_VERBOSE' };

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
    case 'TOGGLE_VERBOSE':
      return toggleVerboseLog(state);
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
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialRunState);
  const battleEngineRef = useRef<BattleEngine | null>(null);
  const [equipError, setEquipErrorState] = React.useState<string | null>(null);
  const setEquipError = useCallback((msg: string | null) => setEquipErrorState(msg), []);
  const [showIntro, setShowIntro] = React.useState(true);
  const [chimeraGallery, setChimeraGallery] = React.useState<NamedChimera[]>(loadGalleryFromStorage);
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
    }),
    [state, equipError, setEquipError, showIntro, chimeraGallery, addNamedChimera]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
