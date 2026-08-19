// ============================================================
// 計測の記録係(副作用担当の薄い層)。
//
// 実際のレコード組み立ては runMetricsOps.ts の純粋関数が行い、ここでは
// - 現在進行中のラン(draft)をメモリ上に保持する
// - localStorageへの読み書き(metricsStorage.ts)
// - 例外が起きた場合に計測だけを無効化し、二度と例外を投げないようにする
// (要件: 「計測処理がゲーム進行を壊さないよう、失敗時は計測だけを無効化してください」)
// だけを行う。UI側はこのモジュールの関数を呼ぶだけでよく、失敗を気にする必要はない。
// ============================================================

import type { BattleSlotType } from '../engine/run';
import type { ActiveSynergies } from '../engine/synergyEngine';
import { GAME_VERSION, BALANCE_VERSION } from './gameVersion';
import { loadMetricsStore, saveMetricsStore, upsertRun } from './metricsStorage';
import {
  addSurvey,
  buildActiveSynergyLabels,
  completeRun,
  createNewRun,
  finalizeAsAbandoned,
  finalizeAsReset,
  recordBattleEnd as opRecordBattleEnd,
  recordBattleStart as opRecordBattleStart,
  recordEnemyCandidates as opRecordEnemyCandidates,
  recordEnemyChosen as opRecordEnemyChosen,
  recordFinalBuild as opRecordFinalBuild,
  recordPartCandidates as opRecordPartCandidates,
  recordPartChoice as opRecordPartChoice,
  type BattleEndInput,
} from './runMetricsOps';
import type { PartChoiceAction, RunMetricsRecord, SurveyResponse } from './types';

let disabled = false;

function safely(fn: () => void): void {
  if (disabled) return;
  try {
    fn();
  } catch (err) {
    disabled = true;
    // eslint-disable-next-line no-console
    console.warn('[metrics] 計測処理で予期しないエラーが発生したため、以後の計測を無効化します', err);
  }
}

function createRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // フォールバックへ
  }
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let draft: RunMetricsRecord | null = null;

function persist(): void {
  if (!draft) return;
  const store = loadMetricsStore();
  const withRun = upsertRun(store, draft);
  const activeRunId = draft.status === 'in_progress' ? draft.runId : withRun.activeRunId === draft.runId ? null : withRun.activeRunId;
  saveMetricsStore({ ...withRun, activeRunId });
}

function update(mutator: (run: RunMetricsRecord, now: number) => RunMetricsRecord): void {
  if (!draft) return;
  draft = mutator(draft, Date.now());
  persist();
}

// GameProvider起動時に1度だけ呼ぶ。ラン途中保存(runPersistence)の再開判定と対応させ、
// 「続きから」を選んだ場合はorigin='resume'、「新しいラン」または保存自体が無い場合は'new'を渡す。
export function ensureRunStarted(origin: 'resume' | 'new'): void {
  safely(() => {
    if (draft) return;
    const store = loadMetricsStore();
    if (origin === 'resume' && store.activeRunId) {
      const existing = store.runs.find((r) => r.runId === store.activeRunId && r.status === 'in_progress');
      if (existing) {
        draft = existing;
        return;
      }
    }
    // 前回セッションで終了処理されなかった中断ランが残っていれば、まず確定させておく
    // (ブラウザを閉じた・クラッシュした等で正常終了しなかったランを「中断」として計測に残す)。
    if (store.activeRunId) {
      const stale = store.runs.find((r) => r.runId === store.activeRunId && r.status === 'in_progress');
      if (stale) {
        const finalizedStore = upsertRun(store, finalizeAsAbandoned(stale, Date.now()));
        saveMetricsStore({ ...finalizedStore, activeRunId: null });
      }
    }
    draft = createNewRun(createRunId(), Date.now(), GAME_VERSION, BALANCE_VERSION);
    persist();
  });
}

export function recordEnemyCandidates(battleIndex: number, slotType: BattleSlotType, candidateIds: string[]): void {
  safely(() => update((run, now) => opRecordEnemyCandidates(run, now, battleIndex, slotType, candidateIds)));
}

export function recordEnemyChosen(battleIndex: number, slotType: BattleSlotType, enemyId: string): void {
  safely(() => update((run, now) => opRecordEnemyChosen(run, now, battleIndex, slotType, enemyId)));
}

export function recordBattleStart(battleIndex: number, slotType: BattleSlotType, commandIds: (string | null)[]): void {
  safely(() => update((run, now) => opRecordBattleStart(run, now, battleIndex, slotType, commandIds)));
}

export function recordBattleEnd(battleIndex: number, slotType: BattleSlotType, input: BattleEndInput): void {
  safely(() => update((run, now) => opRecordBattleEnd(run, now, battleIndex, slotType, input)));
}

export function recordPartCandidates(battleIndex: number, slotType: BattleSlotType, candidateIds: string[]): void {
  safely(() => update((run, now) => opRecordPartCandidates(run, now, battleIndex, slotType, candidateIds)));
}

export function recordPartChoice(battleIndex: number, slotType: BattleSlotType, action: PartChoiceAction, defId: string | null): void {
  safely(() => update((run, now) => opRecordPartChoice(run, now, battleIndex, slotType, action, defId)));
}

export function recordRunEnd(outcome: 'victory' | 'defeat', battleReached: number, equippedPartIds: string[], synergies: ActiveSynergies): void {
  safely(() =>
    update((run, now) => {
      const withBuild = opRecordFinalBuild(run, now, { equippedPartIds, activeSynergies: buildActiveSynergyLabels(synergies) });
      return completeRun(withBuild, now, outcome, battleReached);
    })
  );
  // このランの追跡は終了。次のensureRunStarted()呼び出しで新しいdraftを作る。
  draft = null;
}

// 「ランをリセット」がラン完了前(まだresult画面に到達していない)に押された場合のみ呼ぶ。
export function recordReset(): void {
  safely(() => {
    if (!draft) return;
    update((run, now) => finalizeAsReset(run, now));
    draft = null;
  });
}

export function recordSurvey(survey: SurveyResponse): void {
  safely(() => {
    if (draft) {
      update((run) => addSurvey(run, survey));
      return;
    }
    // result画面表示後にdraftが既にnull化されているケース(recordRunEndの後)向けに、
    // 直近で完了させたランを探して回答を追記する。
    const store = loadMetricsStore();
    const latest = [...store.runs].sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!latest) return;
    const updated = addSurvey(latest, survey);
    saveMetricsStore(upsertRun(store, updated));
  });
}

// テスト・デバッグ用: モジュール内のin-memory状態をリセットする。
export function __resetMetricsRecorderForTests(): void {
  draft = null;
  disabled = false;
}

export function isMetricsDisabled(): boolean {
  return disabled;
}
