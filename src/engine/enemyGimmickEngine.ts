import type { EnemyGimmickEffectDef, GimmickKind } from '../data/types';

// ============================================================
// 敵固有ギミックの実行時ロジック（TEST7）
// battle.ts から敵IDごとのif文を排除するため、EnemyDef.gimmicks(kind+params)
// を解釈する処理だけをこの独立モジュールに閉じ込める。
// battle.ts 側は毎tickこのモジュールへ現在の状態を渡し、返ってきた
// 「今フレームの絶対値」をそのまま敵のステータスへ反映するだけでよい
// (差分の積み上げ・巻き戻しをbattle.ts側で管理しなくて済むようにするため)。
// ============================================================

export interface GimmickTickContext {
  dt: number;
  time: number; // 戦闘開始からの経過秒
  enemyHpPct: number; // 0..1
  playerHasBurn: boolean;
}

export interface GimmickTickResult {
  logs: string[];
  // 以下はすべて「今フレームの絶対値」。base値に対してbattle.ts側が加算/乗算して適用する。
  defenseDelta: number;
  damageReductionDeltaPct: number;
  evasionDeltaPct: number;
  attackSpeedMultiplier: number; // 1 = 通常速度。複数ギミックがあれば乗算で合成する
  reflectPct: number; // 0 = 反射なし。複数あれば最大値を採用
  vulnerabilityDeltaPct: number; // 敵が受けるダメージへの追加増加率
  statusAmountBonus: number; // 毒・炎上などの状態異常付与量への加算(既存のmods.statusAmountBonusと同じ意味)
  directDamageToPlayer: number; // このtickでプレイヤーへ追加発生させる直接ダメージ(防御計算はbattle.ts側で通す)
}

function emptyResult(): GimmickTickResult {
  return {
    logs: [],
    defenseDelta: 0,
    damageReductionDeltaPct: 0,
    evasionDeltaPct: 0,
    attackSpeedMultiplier: 1,
    reflectPct: 0,
    vulnerabilityDeltaPct: 0,
    statusAmountBonus: 0,
    directDamageToPlayer: 0,
  };
}

// ギミックごとの内部進行状態(戦闘中のみ有効)。kindごとに使うキーが異なる。
interface GimmickInstanceState {
  def: EnemyGimmickEffectDef;
  // evade_charge: 'idle' | 'evading' | 'exposed'
  // stance_cycle: 'guard' | 'attack'
  phase: string;
  phaseTimer: number;
  burnExplodeTimer: number;
  reflectCycleIndex: number;
  triggeredOnce: boolean;
}

export class EnemyGimmickRuntime {
  private instances: GimmickInstanceState[];

  constructor(gimmicks: EnemyGimmickEffectDef[]) {
    this.instances = gimmicks.map((def) => ({
      def,
      phase: def.kind === 'evade_charge' ? 'idle' : def.kind === 'stance_cycle' ? 'guard' : '',
      phaseTimer: 0,
      burnExplodeTimer: 0,
      reflectCycleIndex: -1,
      triggeredOnce: false,
    }));
  }

  hasGimmicks(): boolean {
    return this.instances.length > 0;
  }

  tick(ctx: GimmickTickContext): GimmickTickResult {
    const result = emptyResult();
    for (const inst of this.instances) {
      this.tickOne(inst, ctx, result);
    }
    return result;
  }

  private tickOne(inst: GimmickInstanceState, ctx: GimmickTickContext, result: GimmickTickResult) {
    const p = inst.def.params;
    switch (inst.def.kind) {
      case 'poison_ramp': {
        const perSecond = p.perSecond ?? 0.1;
        const cap = p.cap ?? 5;
        result.statusAmountBonus += Math.min(cap, ctx.time * perSecond);
        break;
      }
      case 'enrage_below_hp': {
        const thresholdPct = p.hpThresholdPct ?? 50;
        const mult = p.attackSpeedMultiplier ?? 1.4;
        if (ctx.enemyHpPct * 100 <= thresholdPct) {
          if (inst.phaseTimer === 0) {
            result.logs.push('💢 HPが減り、攻撃速度が上昇した！');
          }
          inst.phaseTimer = 1;
          result.attackSpeedMultiplier *= mult;
        }
        break;
      }
      case 'periodic_reflect': {
        const cycleSec = Math.max(0.5, p.cycleSec ?? 8);
        const activeSec = Math.max(0.1, p.activeSec ?? 2.5);
        const reflectPct = p.reflectPct ?? 30;
        const posInCycle = ctx.time % cycleSec;
        const cycleIndex = Math.floor(ctx.time / cycleSec);
        const active = posInCycle < activeSec;
        if (active) {
          if (inst.reflectCycleIndex !== cycleIndex) {
            inst.reflectCycleIndex = cycleIndex;
            result.logs.push('🔮 水晶が輝き、反射状態になった！');
          }
          result.reflectPct = Math.max(result.reflectPct, reflectPct);
        }
        break;
      }
      case 'burn_stack_explode': {
        const intervalSec = Math.max(0.5, p.intervalSec ?? 3.5);
        const damage = p.damage ?? 6;
        if (!ctx.playerHasBurn) {
          inst.burnExplodeTimer = 0;
          break;
        }
        inst.burnExplodeTimer += ctx.dt;
        if (inst.burnExplodeTimer >= intervalSec) {
          inst.burnExplodeTimer -= intervalSec;
          result.directDamageToPlayer += damage;
          result.logs.push(`🔥💥 炎上スタックが爆発！追加で${damage}ダメージ`);
        }
        break;
      }
      case 'evade_charge': {
        const cycleSec = Math.max(1, p.cycleSec ?? 6);
        const evadeDurationSec = Math.max(0.2, p.evadeDurationSec ?? 1.2);
        const evasionBonusPct = p.evasionBonusPct ?? 35;
        const chargeDamage = p.chargeDamage ?? 7;
        const exposedDefenseDelta = p.exposedDefenseDelta ?? -3;
        const exposedDurationSec = Math.max(0.2, p.exposedDurationSec ?? 3);

        inst.phaseTimer += ctx.dt;
        if (inst.phase === 'idle' && inst.phaseTimer >= cycleSec) {
          inst.phase = 'evading';
          inst.phaseTimer = 0;
          result.logs.push('💨 回避の構えを見せた！');
        } else if (inst.phase === 'evading') {
          result.evasionDeltaPct += evasionBonusPct;
          if (inst.phaseTimer >= evadeDurationSec) {
            inst.phase = 'exposed';
            inst.phaseTimer = 0;
            result.directDamageToPlayer += chargeDamage;
            result.logs.push(`💢 突撃！${chargeDamage}ダメージ。直後で防御が下がっている`);
          }
        } else if (inst.phase === 'exposed') {
          result.defenseDelta += exposedDefenseDelta;
          if (inst.phaseTimer >= exposedDurationSec) {
            inst.phase = 'idle';
            inst.phaseTimer = 0;
          }
        }
        break;
      }
      case 'stance_cycle': {
        const cycleSec = Math.max(1, p.cycleSec ?? 10);
        const guardSec = Math.max(0.5, Math.min(cycleSec - 0.5, p.guardSec ?? cycleSec / 2));
        const guardDamageReductionPct = p.guardDamageReductionPct ?? 20;
        const guardDefenseDelta = p.guardDefenseDelta ?? 4;
        const attackVulnerabilityPct = p.attackVulnerabilityPct ?? 22;
        const posInCycle = ctx.time % cycleSec;
        const wantPhase = posInCycle < guardSec ? 'guard' : 'attack';
        if (wantPhase !== inst.phase) {
          inst.phase = wantPhase;
          result.logs.push(wantPhase === 'guard' ? '🛡️ 防御姿勢に入った' : '👊 攻撃姿勢に移行した！隙が生まれている');
        }
        if (inst.phase === 'guard') {
          result.damageReductionDeltaPct += guardDamageReductionPct;
          result.defenseDelta += guardDefenseDelta;
        } else {
          result.vulnerabilityDeltaPct += attackVulnerabilityPct;
        }
        break;
      }
      case 'phase_shift_below_hp': {
        const thresholdPct = p.hpThresholdPct ?? 50;
        if (!inst.triggeredOnce && ctx.enemyHpPct * 100 <= thresholdPct) {
          inst.triggeredOnce = true;
          result.logs.push('🌀 敵が覚醒した！攻撃が激化している');
        }
        if (inst.triggeredOnce) {
          result.attackSpeedMultiplier *= p.attackSpeedMultiplier ?? 1.2;
          result.reflectPct = Math.max(result.reflectPct, p.reflectPct ?? 0);
          result.damageReductionDeltaPct += p.damageReductionDeltaPct ?? 0;
        }
        break;
      }
      default:
        break;
    }
  }
}

export function createGimmickRuntime(gimmicks: EnemyGimmickEffectDef[] | undefined): EnemyGimmickRuntime | null {
  if (!gimmicks || gimmicks.length === 0) return null;
  return new EnemyGimmickRuntime(gimmicks);
}

// UI(敵選択画面)でギミック種類ごとの短いアイコンを出すための補助(任意)。
export const GIMMICK_KIND_ICONS: Record<GimmickKind, string> = {
  poison_ramp: '☠️',
  enrage_below_hp: '💢',
  periodic_reflect: '🔮',
  burn_stack_explode: '🔥',
  evade_charge: '💨',
  stance_cycle: '🛡️',
  phase_shift_below_hp: '🌀',
};
