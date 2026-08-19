// ============================================================
// ローカル難易度計測・バランス確認機能(TEST12)の型定義。
//
// ここに定義する型はすべて「ブラウザのlocalStorageにのみ保存する記録」の形を表す。
// 外部サーバーへは一切送信しない(要件: 計測は常にブラウザ内で完結させる)。
// ============================================================

import type { BattleSlotType } from '../engine/run';

export type RunEndReason = 'victory' | 'defeat' | 'reset' | 'abandoned';
export type RunStatus = 'in_progress' | 'completed';

export type PartChoiceAction = 'equip' | 'store' | 'skip';

export interface PartChoiceRecord {
  action: PartChoiceAction;
  defId: string | null; // skipの場合はnull
}

export interface CommandUsageRecord {
  count: number;
  damage: number;
  heal: number;
}

export interface BattleDamageBreakdown {
  auto: number;
  command: number;
  status: number;
}

// 1戦闘ぶんの計測記録。敵候補提示〜(勝敗確定後の)部位ドロップ選択までを1件にまとめる。
export interface BattleMetricRecord {
  battleIndex: number;
  slotType: BattleSlotType;
  enemyCandidateIds: string[]; // 提示された敵候補(ボス戦は1体のみ)
  chosenEnemyId: string | null; // 未選択のままラン中断された場合はnull
  outcome: 'win' | 'lose' | 'abandoned'; // abandoned = 勝敗が決まる前にランが中断・リセットされた
  battleTimeSeconds: number | null;
  playerHpRemaining: number | null;
  playerMaxHp: number | null;
  deathCause: string | null; // 敗北時のみ。最後にプレイヤーへダメージを与えた要因のラベル
  damage: BattleDamageBreakdown;
  healed: number;
  commandUsage: Record<string, CommandUsageRecord>; // key: commandId
  equippedCommandIds: (string | null)[]; // 戦闘開始時点でコマンド枠に装備されていた具体的なcommandId(familyIdではない)
  partCandidateIds: string[] | null; // この戦闘の勝利後に提示されたドロップ候補(未勝利/最終戦勝利時はnull)
  partChoice: PartChoiceRecord | null;
}

export interface FinalBuildRecord {
  equippedPartIds: string[];
  activeSynergies: string[]; // 例: "partType:arm:6" "species:insect:4"
}

export interface SurveyResponse {
  fun: 1 | 2 | 3 | 4 | 5 | null;
  confusingPoint: string;
  wantsReplay: 'yes' | 'no' | 'unsure' | null;
  answeredAt: number;
}

// 1ラン(開始〜終了/中断)ぶんの計測記録。
export interface RunMetricsRecord {
  runId: string;
  gameVersion: string;
  balanceVersion: string;
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
  endReason: RunEndReason | null;
  battleReached: number; // 到達した戦闘番号
  clearedBattles: number; // 勝利した戦闘数
  playtimeMs: number; // startedAt〜endedAt(進行中は最終更新時点までの概算)
  resetCount: number; // このランが中断リセットで終わった場合は1、それ以外は0(集計はaggregate側で行う)
  battles: BattleMetricRecord[];
  finalBuild: FinalBuildRecord | null;
  survey: SurveyResponse | null;
}

// localStorageへ保存する実体。運用中のランIDと配列本体を1つのオブジェクトにまとめて保存する。
export interface MetricsStoreV1 {
  schemaVersion: 1;
  activeRunId: string | null;
  runs: RunMetricsRecord[];
}

export interface MetricsExportPayload {
  schemaVersion: 1;
  exportedAt: number;
  gameVersion: string;
  balanceVersion: string;
  runs: RunMetricsRecord[];
}
