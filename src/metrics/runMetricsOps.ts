// ============================================================
// 計測レコード(RunMetricsRecord/BattleMetricRecord)を組み立てる純粋関数群。
//
// localStorageの読み書き・乱数によるID生成などの副作用は一切持たない。
// metricsRecorder.ts (副作用担当の薄い層)がここの関数を呼び出して
// draft状態を更新し、その結果を保存する。テストはこのファイルの関数を中心に行う。
// ============================================================

import type { ActiveSynergies } from '../engine/synergyEngine';
import type { BattleSlotType } from '../engine/run';
import type {
  BattleDamageBreakdown,
  BattleMetricRecord,
  CommandUsageRecord,
  FinalBuildRecord,
  PartChoiceAction,
  RunMetricsRecord,
} from './types';

export function createEmptyBattleRecord(battleIndex: number, slotType: BattleSlotType): BattleMetricRecord {
  return {
    battleIndex,
    slotType,
    enemyCandidateIds: [],
    chosenEnemyId: null,
    outcome: 'abandoned',
    battleTimeSeconds: null,
    playerHpRemaining: null,
    playerMaxHp: null,
    deathCause: null,
    damage: { auto: 0, command: 0, status: 0 },
    healed: 0,
    commandUsage: {},
    equippedCommandIds: [],
    partCandidateIds: null,
    partChoice: null,
  };
}

export function createNewRun(runId: string, now: number, gameVersion: string, balanceVersion: string): RunMetricsRecord {
  return {
    runId,
    gameVersion,
    balanceVersion,
    startedAt: now,
    endedAt: null,
    status: 'in_progress',
    endReason: null,
    battleReached: 1,
    clearedBattles: 0,
    playtimeMs: 0,
    resetCount: 0,
    battles: [],
    finalBuild: null,
    survey: null,
  };
}

// 指定battleIndexのレコードを更新する(存在しなければ新規作成する)。mutatorは既存レコード
// (未作成ならslotType付きの空レコード)を受け取り、更新後のレコードを返す。
export function upsertBattle(
  battles: BattleMetricRecord[],
  battleIndex: number,
  slotType: BattleSlotType,
  mutator: (existing: BattleMetricRecord) => BattleMetricRecord
): BattleMetricRecord[] {
  const idx = battles.findIndex((b) => b.battleIndex === battleIndex);
  const base = idx >= 0 ? battles[idx] : createEmptyBattleRecord(battleIndex, slotType);
  const next = mutator(base);
  if (idx >= 0) return battles.map((b, i) => (i === idx ? next : b));
  return [...battles, next];
}

function touchPlaytime(run: RunMetricsRecord, now: number): RunMetricsRecord {
  return { ...run, playtimeMs: Math.max(0, now - run.startedAt) };
}

export function recordEnemyCandidates(
  run: RunMetricsRecord,
  now: number,
  battleIndex: number,
  slotType: BattleSlotType,
  candidateIds: string[]
): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({ ...b, slotType, enemyCandidateIds: candidateIds }));
  return touchPlaytime({ ...run, battleReached: Math.max(run.battleReached, battleIndex), battles }, now);
}

export function recordEnemyChosen(run: RunMetricsRecord, now: number, battleIndex: number, slotType: BattleSlotType, enemyId: string): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({ ...b, chosenEnemyId: enemyId }));
  return touchPlaytime({ ...run, battles }, now);
}

export function recordBattleStart(
  run: RunMetricsRecord,
  now: number,
  battleIndex: number,
  slotType: BattleSlotType,
  commandIds: (string | null)[]
): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({ ...b, equippedCommandIds: [...commandIds] }));
  return touchPlaytime({ ...run, battles }, now);
}

export interface BattleEndInput {
  outcome: 'win' | 'lose';
  battleTimeSeconds: number;
  playerHpRemaining: number;
  playerMaxHp: number;
  deathCause: string | null;
  damage: BattleDamageBreakdown;
  healed: number;
  commandUsage: Record<string, CommandUsageRecord>;
}

export function recordBattleEnd(run: RunMetricsRecord, now: number, battleIndex: number, slotType: BattleSlotType, input: BattleEndInput): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({
    ...b,
    outcome: input.outcome,
    battleTimeSeconds: input.battleTimeSeconds,
    playerHpRemaining: input.playerHpRemaining,
    playerMaxHp: input.playerMaxHp,
    deathCause: input.outcome === 'lose' ? input.deathCause : null,
    damage: input.damage,
    healed: input.healed,
    commandUsage: input.commandUsage,
  }));
  const clearedBattles = input.outcome === 'win' ? run.clearedBattles + 1 : run.clearedBattles;
  return touchPlaytime({ ...run, battles, clearedBattles }, now);
}

export function recordPartCandidates(run: RunMetricsRecord, now: number, battleIndex: number, slotType: BattleSlotType, candidateIds: string[]): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({ ...b, partCandidateIds: candidateIds }));
  return touchPlaytime({ ...run, battles }, now);
}

export function recordPartChoice(
  run: RunMetricsRecord,
  now: number,
  battleIndex: number,
  slotType: BattleSlotType,
  action: PartChoiceAction,
  defId: string | null
): RunMetricsRecord {
  const battles = upsertBattle(run.battles, battleIndex, slotType, (b) => ({ ...b, partChoice: { action, defId } }));
  return touchPlaytime({ ...run, battles }, now);
}

// 装着中の部位から発動しているシナジーを、簡潔なラベル文字列(集計キー)へ変換する。
// 例: "partType:arm:6" (腕・触手6個シナジーが有効) "species:insect:4" (昆虫4体分シナジーが有効)
// 各グループは最も高い(最後に達成した)有効ティアのcountだけを1件記録する。
export function buildActiveSynergyLabels(synergies: ActiveSynergies): string[] {
  const labels: string[] = [];
  for (const [key, group] of Object.entries(synergies.partType)) {
    if (group.activeTiers.length === 0) continue;
    const top = group.activeTiers[group.activeTiers.length - 1];
    labels.push(`partType:${key}:${top.count}`);
  }
  for (const [key, group] of Object.entries(synergies.species)) {
    if (group.activeTiers.length === 0) continue;
    const top = group.activeTiers[group.activeTiers.length - 1];
    labels.push(`species:${key}:${top.count}`);
  }
  return labels;
}

export function recordFinalBuild(run: RunMetricsRecord, now: number, finalBuild: FinalBuildRecord): RunMetricsRecord {
  return touchPlaytime({ ...run, finalBuild }, now);
}

export function completeRun(run: RunMetricsRecord, now: number, outcome: 'victory' | 'defeat', battleReached: number): RunMetricsRecord {
  return {
    ...run,
    status: 'completed',
    endReason: outcome,
    endedAt: now,
    battleReached: Math.max(run.battleReached, battleReached),
    playtimeMs: Math.max(0, now - run.startedAt),
  };
}

// 「ランをリセット」が押されたことによる中断終了。プレイヤーが自発的にやめた回数として
// 集計側で数えられるよう、resetCountを1にする(通常終了時は0のまま)。
export function finalizeAsReset(run: RunMetricsRecord, now: number): RunMetricsRecord {
  return {
    ...run,
    status: 'completed',
    endReason: 'reset',
    endedAt: now,
    resetCount: 1,
    playtimeMs: Math.max(0, now - run.startedAt),
  };
}

// 前回セッションで正常終了しなかった(タブを閉じた等)ランを、次回起動時に確定させるための処理。
export function finalizeAsAbandoned(run: RunMetricsRecord, now: number): RunMetricsRecord {
  return {
    ...run,
    status: 'completed',
    endReason: 'abandoned',
    endedAt: now,
    playtimeMs: Math.max(0, now - run.startedAt),
  };
}

export function addSurvey(run: RunMetricsRecord, survey: RunMetricsRecord['survey']): RunMetricsRecord {
  return { ...run, survey };
}
