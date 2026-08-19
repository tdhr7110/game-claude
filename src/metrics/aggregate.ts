// ============================================================
// バランス画面向けの集計。すべて純粋関数(RunMetricsRecord[]を受け取り、
// 集計結果を返すだけ)。localStorageやReactには一切触れない。
// ============================================================

import type { RunMetricsRecord } from './types';

export const MIN_SAMPLE_SIZE = 5;

export interface BattleNumberStat {
  battleIndex: number;
  challengeCount: number;
  winCount: number;
  loseCount: number;
  abandonCount: number;
  winRate: number | null;
  dropoffRate: number | null;
}

export interface EnemyStat {
  enemyId: string;
  candidateCount: number;
  chosenCount: number;
  selectionRate: number | null;
  wins: number;
  losses: number;
  winRate: number | null;
  avgBattleTimeSeconds: number | null;
}

export interface PartStat {
  partId: string;
  candidateCount: number;
  chosenCount: number;
  selectionRate: number | null;
  equippedCount: number;
  equipRate: number | null;
  finalBuildCount: number;
  finalBuildWinCount: number;
  finalBuildWinRate: number | null;
}

export interface CommandStat {
  commandId: string;
  battlesEquipped: number;
  battlesUsed: number;
  usageRate: number | null;
  totalUses: number;
  totalDamage: number;
  avgDamagePerUse: number | null;
  totalHeal: number;
}

export interface SynergyStat {
  label: string;
  adoptionCount: number;
  winCount: number;
  winRate: number | null;
}

export interface DeathCauseStat {
  cause: string;
  count: number;
  share: number | null;
}

export interface BalanceVersionSummary {
  balanceVersion: string;
  runCount: number;
  completedRunCount: number;
  victoryCount: number;
  defeatCount: number;
  resetCount: number;
  victoryRate: number | null;
  avgBattleReached: number | null;
}

export interface SampleWarning {
  category: 'battle' | 'enemy' | 'part' | 'command' | 'synergy';
  key: string;
  sampleSize: number;
}

export interface BalanceReport {
  totalRuns: number;
  completedRuns: number;
  battleStats: BattleNumberStat[];
  enemyStats: EnemyStat[];
  partStats: PartStat[];
  commandStats: CommandStat[];
  synergyStats: SynergyStat[];
  deathCauseStats: DeathCauseStat[];
  balanceVersionSummaries: BalanceVersionSummary[];
  sampleWarnings: SampleWarning[];
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function computeBattleStats(runs: RunMetricsRecord[]): BattleNumberStat[] {
  const map = new Map<number, { win: number; lose: number; abandon: number }>();
  for (const run of runs) {
    for (const b of run.battles) {
      const entry = map.get(b.battleIndex) ?? { win: 0, lose: 0, abandon: 0 };
      if (b.outcome === 'win') entry.win++;
      else if (b.outcome === 'lose') entry.lose++;
      else entry.abandon++;
      map.set(b.battleIndex, entry);
    }
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([battleIndex, e]) => {
      const challengeCount = e.win + e.lose + e.abandon;
      return {
        battleIndex,
        challengeCount,
        winCount: e.win,
        loseCount: e.lose,
        abandonCount: e.abandon,
        winRate: ratio(e.win, e.win + e.lose),
        dropoffRate: ratio(e.abandon, challengeCount),
      };
    });
}

export function computeEnemyStats(runs: RunMetricsRecord[]): EnemyStat[] {
  interface Acc {
    candidateCount: number;
    chosenCount: number;
    wins: number;
    losses: number;
    timeSum: number;
    timeCount: number;
  }
  const map = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let e = map.get(id);
    if (!e) {
      e = { candidateCount: 0, chosenCount: 0, wins: 0, losses: 0, timeSum: 0, timeCount: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const run of runs) {
    for (const b of run.battles) {
      for (const id of b.enemyCandidateIds) ensure(id).candidateCount++;
      if (b.chosenEnemyId) {
        const e = ensure(b.chosenEnemyId);
        e.chosenCount++;
        if (b.outcome === 'win') e.wins++;
        else if (b.outcome === 'lose') e.losses++;
        if (b.battleTimeSeconds !== null) {
          e.timeSum += b.battleTimeSeconds;
          e.timeCount++;
        }
      }
    }
  }
  return [...map.entries()]
    .map(([enemyId, e]) => ({
      enemyId,
      candidateCount: e.candidateCount,
      chosenCount: e.chosenCount,
      selectionRate: ratio(e.chosenCount, e.candidateCount),
      wins: e.wins,
      losses: e.losses,
      winRate: ratio(e.wins, e.wins + e.losses),
      avgBattleTimeSeconds: e.timeCount > 0 ? e.timeSum / e.timeCount : null,
    }))
    .sort((a, b) => b.candidateCount - a.candidateCount);
}

export function computePartStats(runs: RunMetricsRecord[]): PartStat[] {
  interface Acc {
    candidateCount: number;
    chosenCount: number;
    equippedCount: number;
    finalBuildCount: number;
    finalBuildWinCount: number;
  }
  const map = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let e = map.get(id);
    if (!e) {
      e = { candidateCount: 0, chosenCount: 0, equippedCount: 0, finalBuildCount: 0, finalBuildWinCount: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const run of runs) {
    for (const b of run.battles) {
      for (const id of b.partCandidateIds ?? []) ensure(id).candidateCount++;
      if (b.partChoice && b.partChoice.action !== 'skip' && b.partChoice.defId) {
        const e = ensure(b.partChoice.defId);
        e.chosenCount++;
        if (b.partChoice.action === 'equip') e.equippedCount++;
      }
    }
    if (run.finalBuild) {
      for (const id of run.finalBuild.equippedPartIds) {
        const e = ensure(id);
        e.finalBuildCount++;
        if (run.endReason === 'victory') e.finalBuildWinCount++;
      }
    }
  }
  return [...map.entries()]
    .map(([partId, e]) => ({
      partId,
      candidateCount: e.candidateCount,
      chosenCount: e.chosenCount,
      selectionRate: ratio(e.chosenCount, e.candidateCount),
      equippedCount: e.equippedCount,
      equipRate: ratio(e.equippedCount, e.chosenCount),
      finalBuildCount: e.finalBuildCount,
      finalBuildWinCount: e.finalBuildWinCount,
      finalBuildWinRate: ratio(e.finalBuildWinCount, e.finalBuildCount),
    }))
    .sort((a, b) => b.candidateCount - a.candidateCount);
}

export function computeCommandStats(runs: RunMetricsRecord[]): CommandStat[] {
  interface Acc {
    battlesEquipped: number;
    battlesUsed: number;
    totalUses: number;
    totalDamage: number;
    totalHeal: number;
  }
  const map = new Map<string, Acc>();
  const ensure = (id: string): Acc => {
    let e = map.get(id);
    if (!e) {
      e = { battlesEquipped: 0, battlesUsed: 0, totalUses: 0, totalDamage: 0, totalHeal: 0 };
      map.set(id, e);
    }
    return e;
  };
  for (const run of runs) {
    for (const b of run.battles) {
      const equippedIds = new Set(b.equippedCommandIds.filter((id): id is string => !!id));
      for (const id of equippedIds) {
        const e = ensure(id);
        e.battlesEquipped++;
        if ((b.commandUsage[id]?.count ?? 0) > 0) e.battlesUsed++;
      }
      for (const [id, usage] of Object.entries(b.commandUsage)) {
        const e = ensure(id);
        e.totalUses += usage.count;
        e.totalDamage += usage.damage;
        e.totalHeal += usage.heal;
      }
    }
  }
  return [...map.entries()]
    .map(([commandId, e]) => ({
      commandId,
      battlesEquipped: e.battlesEquipped,
      battlesUsed: e.battlesUsed,
      usageRate: ratio(e.battlesUsed, e.battlesEquipped),
      totalUses: e.totalUses,
      totalDamage: e.totalDamage,
      avgDamagePerUse: e.totalUses > 0 ? e.totalDamage / e.totalUses : null,
      totalHeal: e.totalHeal,
    }))
    .sort((a, b) => b.battlesEquipped - a.battlesEquipped);
}

export function computeSynergyStats(runs: RunMetricsRecord[]): SynergyStat[] {
  const map = new Map<string, { adoption: number; win: number }>();
  for (const run of runs) {
    if (run.status !== 'completed' || !run.finalBuild) continue;
    if (run.endReason !== 'victory' && run.endReason !== 'defeat') continue;
    for (const label of run.finalBuild.activeSynergies) {
      const e = map.get(label) ?? { adoption: 0, win: 0 };
      e.adoption++;
      if (run.endReason === 'victory') e.win++;
      map.set(label, e);
    }
  }
  return [...map.entries()]
    .map(([label, e]) => ({ label, adoptionCount: e.adoption, winCount: e.win, winRate: ratio(e.win, e.adoption) }))
    .sort((a, b) => b.adoptionCount - a.adoptionCount);
}

export function computeDeathCauseStats(runs: RunMetricsRecord[]): DeathCauseStat[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const run of runs) {
    for (const b of run.battles) {
      if (b.outcome === 'lose' && b.deathCause) {
        counts.set(b.deathCause, (counts.get(b.deathCause) ?? 0) + 1);
        total++;
      }
    }
  }
  return [...counts.entries()]
    .map(([cause, count]) => ({ cause, count, share: ratio(count, total) }))
    .sort((a, b) => b.count - a.count);
}

export function computeBalanceVersionSummaries(runs: RunMetricsRecord[]): BalanceVersionSummary[] {
  interface Acc {
    runCount: number;
    completed: number;
    victory: number;
    defeat: number;
    reset: number;
    battleReachedSum: number;
  }
  const map = new Map<string, Acc>();
  for (const run of runs) {
    const e = map.get(run.balanceVersion) ?? { runCount: 0, completed: 0, victory: 0, defeat: 0, reset: 0, battleReachedSum: 0 };
    e.runCount++;
    if (run.status === 'completed') {
      e.completed++;
      if (run.endReason === 'victory') e.victory++;
      else if (run.endReason === 'defeat') e.defeat++;
      else if (run.endReason === 'reset') e.reset++;
      e.battleReachedSum += run.battleReached;
    }
    map.set(run.balanceVersion, e);
  }
  return [...map.entries()]
    .map(([balanceVersion, e]) => ({
      balanceVersion,
      runCount: e.runCount,
      completedRunCount: e.completed,
      victoryCount: e.victory,
      defeatCount: e.defeat,
      resetCount: e.reset,
      victoryRate: ratio(e.victory, e.victory + e.defeat),
      avgBattleReached: e.completed > 0 ? e.battleReachedSum / e.completed : null,
    }))
    .sort((a, b) => a.balanceVersion.localeCompare(b.balanceVersion));
}

export function computeSampleWarnings(
  report: Pick<BalanceReport, 'battleStats' | 'enemyStats' | 'partStats' | 'commandStats' | 'synergyStats'>,
  minSample = MIN_SAMPLE_SIZE
): SampleWarning[] {
  const warnings: SampleWarning[] = [];
  for (const s of report.battleStats) {
    if (s.challengeCount > 0 && s.challengeCount < minSample) warnings.push({ category: 'battle', key: `第${s.battleIndex}戦`, sampleSize: s.challengeCount });
  }
  for (const s of report.enemyStats) {
    if (s.chosenCount > 0 && s.chosenCount < minSample) warnings.push({ category: 'enemy', key: s.enemyId, sampleSize: s.chosenCount });
  }
  for (const s of report.partStats) {
    if (s.chosenCount > 0 && s.chosenCount < minSample) warnings.push({ category: 'part', key: s.partId, sampleSize: s.chosenCount });
  }
  for (const s of report.commandStats) {
    if (s.battlesEquipped > 0 && s.battlesEquipped < minSample) warnings.push({ category: 'command', key: s.commandId, sampleSize: s.battlesEquipped });
  }
  for (const s of report.synergyStats) {
    if (s.adoptionCount > 0 && s.adoptionCount < minSample) warnings.push({ category: 'synergy', key: s.label, sampleSize: s.adoptionCount });
  }
  return warnings;
}

export function buildBalanceReport(runs: RunMetricsRecord[], minSample = MIN_SAMPLE_SIZE): BalanceReport {
  const battleStats = computeBattleStats(runs);
  const enemyStats = computeEnemyStats(runs);
  const partStats = computePartStats(runs);
  const commandStats = computeCommandStats(runs);
  const synergyStats = computeSynergyStats(runs);
  const deathCauseStats = computeDeathCauseStats(runs);
  const balanceVersionSummaries = computeBalanceVersionSummaries(runs);
  const sampleWarnings = computeSampleWarnings({ battleStats, enemyStats, partStats, commandStats, synergyStats }, minSample);
  return {
    totalRuns: runs.length,
    completedRuns: runs.filter((r) => r.status === 'completed').length,
    battleStats,
    enemyStats,
    partStats,
    commandStats,
    synergyStats,
    deathCauseStats,
    balanceVersionSummaries,
    sampleWarnings,
  };
}
