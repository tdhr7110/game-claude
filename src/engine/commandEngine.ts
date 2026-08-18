// ============================================================
// コマンドシステムの純粋ロジック（React・battle.tsのCombatant型に依存しない）。
// - 代謝ゲージ・クールダウンの進行
// - 時間制バフ・デバフ(ActiveCommandEffect)の進行・集計
// engine/battle.ts はこのモジュールの関数を呼び出すだけで、
// 実際の戦闘状態(HP・部位など)には一切触れない。
// ============================================================

// バフ・デバフの種別。同じ key (通常はfamilyId相当)を持つ効果は
// 「加算で重複」ではなく「残り時間を上書き更新」する。
export type ActiveEffectKind =
  | 'attack_speed'
  | 'crit'
  | 'damage_reduction'
  | 'reflect'
  | 'vulnerability'
  | 'poison_on_hit'
  | 'stun'
  | 'heal_over_time';

export interface ActiveCommandEffect {
  key: string; // 重複防止用のキー(同じkeyは上書き更新)
  kind: ActiveEffectKind;
  sourceCommandId: string;
  sourceName: string;
  remaining: number; // 秒
  values: Record<string, number>;
}

export function tickActiveEffects(effects: ActiveCommandEffect[], dt: number): ActiveCommandEffect[] {
  const next: ActiveCommandEffect[] = [];
  for (const e of effects) {
    const remaining = e.remaining - dt;
    if (remaining > 0) next.push({ ...e, remaining });
  }
  return next;
}

// 同じkeyの効果は上書き更新(残り時間だけ更新、スタックしない)。
export function upsertEffect(effects: ActiveCommandEffect[], next: ActiveCommandEffect): ActiveCommandEffect[] {
  return [...effects.filter((e) => e.key !== next.key), next];
}

export function sumEffectValue(effects: ActiveCommandEffect[], kind: ActiveEffectKind, field: string): number {
  return effects.filter((e) => e.kind === kind).reduce((sum, e) => sum + (e.values[field] ?? 0), 0);
}

export function maxEffectValue(effects: ActiveCommandEffect[], kind: ActiveEffectKind, field: string): number {
  return effects.filter((e) => e.kind === kind).reduce((max, e) => Math.max(max, e.values[field] ?? 0), 0);
}

export function hasEffectKind(effects: ActiveCommandEffect[], kind: ActiveEffectKind): boolean {
  return effects.some((e) => e.kind === kind);
}

// --- 代謝ゲージ ---

export function regenMetabolism(current: number, max: number, amount: number): number {
  if (amount <= 0) return current;
  return Math.min(max, current + amount);
}

export function canAffordMetabolism(current: number, cost: number): boolean {
  return current >= cost;
}

// --- クールダウン ---

export function tickCooldowns(cooldowns: Record<string, number>, dt: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, remaining] of Object.entries(cooldowns)) {
    const v = remaining - dt;
    if (v > 0) next[id] = v;
  }
  return next;
}
