import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import type { RunState } from '../engine/run';
import {
  acceptDrop,
  advanceToNextBattle,
  chooseEnemy,
  createInitialRunState,
  debugAddCapacity,
  debugForceFusionPhase,
  debugFullHeal,
  debugGrantAndEquipPart,
  debugGrantPart,
  enterEnemySelect,
  equipPart,
  equippedDefs,
  finishBattle,
  markCommandsSeen,
  performFusion,
  recordCommandDiscoveries,
  resetRun,
  resolveFusionStep,
  setCommandSlot,
  skipDrop,
  tierOfCurrentBattle,
  toggleVerboseLog,
  unequipPart,
} from '../engine/run';
import type { BattleEngine } from '../engine/battle';
import type { RewardCard } from '../data/rewardPresentation';
import type { CodexState } from '../engine/codex';
import { markPartsDiscovered, recordEnemyDefeat, recordEnemyEncounter } from '../engine/codex';
import { loadCodexState, saveCodexState } from '../persistence/codexPersistence';
import { clearRunSave, loadRunState, saveRunState } from '../persistence/runPersistence';
import { computeActiveSynergies } from '../engine/synergyEngine';
import { ensureRunStarted, recordEnemyCandidates, recordEnemyChosen, recordPartCandidates, recordReset, recordRunEnd } from '../metrics/metricsRecorder';

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

// 融合図鑑（TEST16）: どの融合レシピを何回成立させたかを記録する。
// キメラ図鑑と同様、ラン進行状況とは別にブラウザへ永続化する。
export interface FusionCodexEntry {
  id: string; // = recipeId（重複登録判定・図鑑上のキー）
  recipeId: string;
  resultDefId: string;
  timesCreated: number;
  firstCreatedAt: number;
  lastCreatedAt: number;
}

// キメラ図鑑だけをブラウザに保存する（ラン進行状況はセーブ対象外）。
// 形式が壊れている・将来スキーマが変わった場合は空配列にフォールバックする。
// 注: このキーはtest9より前から使われている既存キーのため、あえて
// persistence/storageKeys.ts のtest9 namespaceへは移行しない(既存データを失わないため)。
const GALLERY_STORAGE_KEY = 'chimera-battle:gallery:v1';
const FUSION_CODEX_STORAGE_KEY = 'chimera-battle:fusion-codex:v1';

function loadFusionCodexFromStorage(): FusionCodexEntry[] {
  try {
    const raw = localStorage.getItem(FUSION_CODEX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is FusionCodexEntry =>
          !!e && typeof e.id === 'string' && typeof e.recipeId === 'string' && typeof e.resultDefId === 'string' && typeof e.firstCreatedAt === 'number'
      )
      .map((e) => ({
        ...e,
        timesCreated: typeof e.timesCreated === 'number' && e.timesCreated > 0 ? e.timesCreated : 1,
        lastCreatedAt: typeof e.lastCreatedAt === 'number' ? e.lastCreatedAt : e.firstCreatedAt,
      }));
  } catch {
    return [];
  }
}

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
  | { type: 'ENTER_ENEMY_SELECT' }
  | { type: 'CHOOSE_ENEMY'; enemyId: string }
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
  | { type: 'CONFIRM_FUSION'; recipeId: string }
  | { type: 'RESOLVE_FUSION_STEP' }
  | { type: 'DEBUG_FORCE_FUSION_PHASE' }
  // ラン途中保存(優先6)からの復元専用アクション。保存されたRunStateをそのまま採用する。
  | { type: 'LOAD_RUN'; state: RunState };

function reducer(state: RunState, action: Action): RunState {
  switch (action.type) {
    case 'EQUIP':
      return equipPart(state, action.instanceId).state;
    case 'UNEQUIP':
      return unequipPart(state, action.instanceId);
    case 'ENTER_ENEMY_SELECT':
      return enterEnemySelect(state);
    case 'CHOOSE_ENEMY':
      return chooseEnemy(state, action.enemyId).state;
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
    case 'CONFIRM_FUSION':
      return performFusion(state, action.recipeId).state;
    case 'RESOLVE_FUSION_STEP':
      return resolveFusionStep(state);
    case 'DEBUG_FORCE_FUSION_PHASE':
      return debugForceFusionPhase(state);
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
  // 融合図鑑(TEST16): 融合を確定するたびにFusionScreen側から呼び出して記録する。
  fusionCodex: FusionCodexEntry[];
  registerFusionCodexEntry: (recipeId: string, resultDefId: string) => void;
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

  const [fusionCodex, setFusionCodex] = React.useState<FusionCodexEntry[]>(loadFusionCodexFromStorage);
  // 同じレシピを再び融合した場合は新規行を増やさず、既存エントリの回数を加算する
  // （図鑑は「レシピ単位で1行」を保つ。無制限に行が増え続けることもない）。
  const registerFusionCodexEntry = useCallback((recipeId: string, resultDefId: string) => {
    setFusionCodex((prev) => {
      const now = Date.now();
      const existing = prev.find((e) => e.recipeId === recipeId);
      if (existing) {
        return prev.map((e) => (e.recipeId === recipeId ? { ...e, timesCreated: e.timesCreated + 1, lastCreatedAt: now } : e));
      }
      const entry: FusionCodexEntry = { id: recipeId, recipeId, resultDefId, timesCreated: 1, firstCreatedAt: now, lastCreatedAt: now };
      return [entry, ...prev];
    });
  }, []);

  // 図鑑が変化するたびにブラウザへ保存する（ラン進行状況は対象外）
  useEffect(() => {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(chimeraGallery));
    } catch {
      // 保存容量オーバーなどは無視（図鑑保存は補助機能のため、ゲーム進行自体には影響させない）
    }
  }, [chimeraGallery]);

  // 融合図鑑も同様にブラウザへ保存する。
  useEffect(() => {
    try {
      localStorage.setItem(FUSION_CODEX_STORAGE_KEY, JSON.stringify(fusionCodex));
    } catch {
      // 保存容量オーバーなどは無視
    }
  }, [fusionCodex]);

  // --- ラン途中保存(優先6) ---
  // 起動時に有効な保存が見つかった場合、ユーザーが「続きから/新しいラン」を選ぶまでは
  // stateへ反映しない(pendingResumeで保持するだけ)。選択が決まるまでオートセーブも止める
  // (でないと選択待ち中の初期状態でオートセーブが発火し、保存済みデータを上書きしてしまう)。
  const [pendingResume, setPendingResume] = React.useState<RunState | null>(() => loadRunState());
  // 敵遭遇・撃破の二重カウントを防ぐための直前フェーズ記録。
  // 通常のuseState/useRef初期化はコンポーネント初回マウント時の値を採用するため、
  // 「続きから」で復元した瞬間のズレはresumeRun内で明示的に補正する。
  const prevPhaseRef = useRef<RunState['phase']>(state.phase);
  // バランス計測(TEST12)専用の直前フェーズ記録。上のprevPhaseRef(図鑑用)とは
  // 目的が異なるため独立させ、既存の図鑑ロジックには一切手を入れない。
  const metricsPrevPhaseRef = useRef<RunState['phase']>(state.phase);
  // このセッションで追跡するランが「続きから」なのか「新しいラン」なのかを、
  // 計測(ensureRunStarted)へ伝えるためのフラグ。起動時に有効な保存があれば
  // ひとまず'resume'とし、discardResumeAndStartNew/RESETで'new'に確定させる。
  const runOriginRef = useRef<'resume' | 'new'>(pendingResume === null ? 'new' : 'resume');

  const resumeRun = useCallback(() => {
    setPendingResume((current) => {
      if (!current) return current;
      prevPhaseRef.current = current.phase;
      metricsPrevPhaseRef.current = current.phase;
      runOriginRef.current = 'resume';
      dispatch({ type: 'LOAD_RUN', state: current });
      return null;
    });
  }, []);

  const discardResumeAndStartNew = useCallback(() => {
    clearRunSave();
    runOriginRef.current = 'new';
    setPendingResume(null);
  }, []);

  useEffect(() => {
    if (pendingResume !== null) return; // 選択待ち中は保存済みデータを上書きしない
    // バランス計測(TEST12): このランの追跡が始まっていなければ開始する(2回目以降は内部で無視される)。
    ensureRunStarted(runOriginRef.current);
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

  // --- バランス計測(TEST12): フェーズ遷移に応じたイベント記録 ---
  // 敵候補提示・敵選択・部位ドロップ候補提示・ラン終了(最終ビルド確定)を、
  // 図鑑用の効果とは独立に検知する。戦闘結果そのもの(勝敗・戦闘時間・コマンド内訳)と
  // 戦闘開始時点の装備コマンド(BattleEngineが解決した具体的なcommandId)は
  // BattleEngineが必要なため、BattleScreen側でrecordBattleStart/recordBattleEndを呼ぶ。
  useEffect(() => {
    const prevPhase = metricsPrevPhaseRef.current;
    metricsPrevPhaseRef.current = state.phase;
    if (pendingResume !== null) return;
    if (prevPhase === state.phase) return;
    const tier = tierOfCurrentBattle(state);

    if (state.phase === 'enemySelect') {
      recordEnemyCandidates(state.battleIndex, tier, state.enemyCandidates.map((e) => e.id));
    } else if (prevPhase === 'enemySelect' && state.phase === 'battle' && state.currentEnemy) {
      recordEnemyChosen(state.battleIndex, tier, state.currentEnemy.id);
    } else if (prevPhase === 'battle' && state.phase === 'drop') {
      recordPartCandidates(state.battleIndex, tier, state.dropCandidates.map((d) => d.id));
    } else if (state.phase === 'result' && state.resultOutcome) {
      const eqDefs = equippedDefs(state);
      recordRunEnd(state.resultOutcome, state.battleIndex, eqDefs.map((d) => d.id), computeActiveSynergies(eqDefs));
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

  // バランス計測(TEST12): ラン完了前(result画面到達前)の自発的なリセットだけを
  // 「リセット回数」として計測する。result画面からの「新しいランを開始する」は
  // 既にrecordRunEndで完了扱いになっているため、リセット扱いにはしない。
  const dispatchWithMetrics = useCallback<React.Dispatch<Action>>(
    (action) => {
      if (action.type === 'RESET') {
        runOriginRef.current = 'new';
        if (state.phase !== 'result') recordReset();
      }
      dispatch(action);
    },
    [state.phase]
  );

  const value = useMemo(
    () => ({
      state,
      dispatch: dispatchWithMetrics,
      battleEngineRef,
      equipError,
      setEquipError,
      showIntro,
      setShowIntro,
      chimeraGallery,
      addNamedChimera,
      fusionCodex,
      registerFusionCodexEntry,
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
      dispatchWithMetrics,
      equipError,
      setEquipError,
      showIntro,
      chimeraGallery,
      addNamedChimera,
      fusionCodex,
      registerFusionCodexEntry,
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
