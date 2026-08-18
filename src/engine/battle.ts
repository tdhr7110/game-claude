import type { EnemyDef, EnemyGimmick, EnemyMove, PartDef, PartType } from '../data/types';
import { computeActiveSynergies, type ActiveSynergies } from './synergyEngine';
import {
  computeBonusHp,
  computeModifiers,
  computePerInstanceAttackMultiplier,
  effectiveInterval,
  emptyModifiers,
  type CombatantModifiers,
  type OnHitEffect,
} from './modifiers';
import { COMMAND_DEFS, type CommandDef } from '../data/commands';

export type SpeedSetting = 0 | 1 | 2 | 4;
export type BattleStatus = 'ongoing' | 'won' | 'lost';

const STATUS_TICK_INTERVAL = 1.0; // 毒・炎上の判定間隔（秒）
const MIN_EFFECTIVE_INTERVAL = 0.15; // 高速化しすぎた場合の下限（無限ループ防止）
const ABSOLUTE_MAX_CHAIN = 10; // 暴走遺伝子等の連鎖発動が管理画面から異常な値に設定されても止まるようにする絶対上限

// --- TEST2フェーズ2: コマンド関連の定数 ---
const RAMPAGE_BUFF_SECONDS = 5;
const RAMPAGE_BUFF_MULT = 2;
const RAMPAGE_DEBUFF_SECONDS = 4; // TEST2再調整: 一斉発動偏重を緩和するため反動を5→4秒に短縮し暴走の実用性を上げる
const RAMPAGE_DEBUFF_MULT = 0.75;
const GUARD_BASE_SECONDS = 4;
const GUARD_DAMAGE_REDUCTION_PCT = 60; // TEST2再調整: 50→60%。単発コマンドとしての存在感を強化
const GUARD_SKIN_SYNERGY_THRESHOLD = 5; // 外殻(skin)5個以上で防御コマンドの持続時間+50%
const ALPHA_STRIKE_ARM_BONUS_THRESHOLD = 6; // 腕6以上で追加の一斉攻撃
const ALPHA_STRIKE_ARM_CHAIN_THRESHOLD = 10; // 腕10以上で確率でさらにもう一度
const ALPHA_STRIKE_ARM_CHAIN_CHANCE = 0.3;
const ALPHA_STRIKE_CD_REDUCTION_ARM10_PCT = 30; // 腕10以上でクールダウン-30%
const FLAME_BREATH_ATTACK = 14;
const FLAME_BREATH_BURN_DPS = 6;
const FLAME_BREATH_BURN_DURATION = 4;

interface RuntimePart {
  instanceId: string;
  name: string;
  type: PartType;
  attack: number;
  isPassive: boolean;
  effects: PartDef['effects'];
  icon: string;
  cooldown: number; // 実効発動間隔（秒）
  timer: number; // 蓄積時間
  activations: number; // このパーツが発動した回数（UI用）
}

interface PoisonState {
  value: number;
  noDecayChance: number;
}

interface BurnState {
  dps: number;
  timeLeft: number;
}

// TEST2フェーズ2: コマンドによる時限バフ（暴走の加速/反動、防御の被ダメージ軽減）
interface TempAttackSpeedState {
  mult: number; // 1 = 通常。暴走中は倍率、反動中は減衰
  phase: 'none' | 'buff' | 'debuff';
  timeLeft: number;
  pendingDebuffMult?: number; // buff終了後に自動でdebuffへ移行する場合の倍率（暴走コマンド用）
  pendingDebuffSeconds?: number;
}
interface TempDamageReductionState {
  pct: number;
  timeLeft: number;
}

// TEST2フェーズ2: 敵ギミックの実行時状態（予告つき特殊行動）
interface GimmickState {
  def: EnemyGimmick;
  phase: 'idle' | 'telegraph' | 'active';
  timer: number; // 現フェーズの経過時間
}

interface Combatant {
  side: 'player' | 'enemy';
  name: string;
  hp: number;
  maxHp: number;
  defense: number;
  damageReductionPct: number;
  evasionPct: number;
  mods: CombatantModifiers;
  parts: RuntimePart[];
  poison: PoisonState;
  burn: BurnState | null;
  attackCountByType: Partial<Record<PartType, number>>;
  reviveUsed: boolean;
  isDead: boolean;
  stats: { damageDealt: number; healed: number; critCount: number };
  fixedDamageBonus: number; // 穿孔心臓等により戦闘中に成長する固定ダメージ加算値
  tempAttackSpeed: TempAttackSpeedState;
  tempDamageReduction: TempDamageReductionState;
  gimmick: GimmickState | null;
}

export interface PartSnapshot {
  instanceId: string;
  name: string;
  icon: string;
  type: PartType;
  attack: number;
  isPassive: boolean;
  cooldown: number;
  progress: number; // 0..1 次の発動までの進捗
  activations: number;
}

export interface GimmickSnapshot {
  kind: EnemyGimmick['kind'];
  phase: 'idle' | 'telegraph' | 'active';
  label: string; // 「防御態勢準備」「大技チャージ」「狂乱」等の表示用ラベル
  timeLeft: number; // 現フェーズの残り秒数（idleは周期までの残り）
  phaseDurationSeconds: number; // 現フェーズの合計秒数（進捗バー計算用）
}

export interface CombatantSnapshot {
  side: 'player' | 'enemy';
  name: string;
  hp: number;
  maxHp: number;
  defense: number;
  damageReductionPct: number;
  evasionPct: number;
  critPct: number;
  poison: number;
  burn: BurnState | null;
  parts: PartSnapshot[];
  stats: { damageDealt: number; healed: number; critCount: number };
  isDead: boolean;
  tempAttackSpeedMult: number;
  tempDamageReductionPct: number;
  gimmick: GimmickSnapshot | null;
}

export interface CommandSnapshot {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseCooldown: number;
  cooldownRemaining: number; // 0ならREADY
  available: boolean; // 部位由来コマンドで未装着の場合はfalse
}

export interface BattleSnapshot {
  battleIndex: number;
  time: number;
  status: BattleStatus;
  speed: SpeedSetting;
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  log: string[];
  synergies: ActiveSynergies;
  commands: CommandSnapshot[];
}

// TEST3フェーズ3: 演出用の構造化イベント。既存の戦闘ロジック(ダメージ計算等)には一切影響しない、
// 表示専用の副産物として発行する。UI側は drainEvents() で毎フレーム取り出し、アニメーション・SE・
// ダメージ数字などのトリガーとして利用する（要件17: ロジックと描画を分離する）。
export type AttackTag = 'alpha_strike' | 'dragon_burst' | 'flame_breath' | undefined;
export type BattleEvent =
  | { type: 'attack'; side: 'player' | 'enemy'; targetSide: 'player' | 'enemy'; partInstanceId: string; damage: number; isCrit: boolean; isFixed: boolean; tag: AttackTag }
  | { type: 'evade'; side: 'player' | 'enemy'; targetSide: 'player' | 'enemy' }
  | { type: 'heal'; side: 'player' | 'enemy'; amount: number }
  | { type: 'command'; id: string }
  | { type: 'synergy'; side: 'player' | 'enemy'; label: string }
  | { type: 'victory' }
  | { type: 'defeat' };

export interface PlayerBattleSetup {
  equipped: { instanceId: string; def: PartDef }[];
  coreHpBase: number;
  currentHp: number; // 前戦闘からの持ち越しHP
  baseDefense: number;
  freeCapacity: number; // 空洞核（未使用接続容量ボーナス）用。戦闘準備画面時点の空き容量
}

let logSeq = 0;

export class BattleEngine {
  private player!: Combatant;
  private enemy!: Combatant;
  private time = 0;
  private status: BattleStatus = 'ongoing';
  private speed: SpeedSetting = 1;
  private log: string[] = [];
  private statusTimer = 0;
  private battleIndex: number;
  private synergies: ActiveSynergies;
  private verbose: boolean;
  private listeners = new Set<() => void>();
  // --- TEST2フェーズ2: コマンド関連の状態 ---
  private equippedDefs: PartDef[] = [];
  private availableCommands: CommandDef[] = [];
  private commandCooldowns = new Map<string, number>();
  // --- TEST3フェーズ3: 演出用イベントバッファ ---
  private events: BattleEvent[] = [];
  private currentAttackTag: AttackTag = undefined;

  private pushEvent(e: BattleEvent) {
    this.events.push(e);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  // UI側が毎フレーム呼び出し、蓄積されたイベントを取り出して空にする。
  drainEvents(): BattleEvent[] {
    if (this.events.length === 0) return [];
    const drained = this.events;
    this.events = [];
    return drained;
  }

  constructor(setup: PlayerBattleSetup, enemyDef: EnemyDef, battleIndex: number, options: { verbose?: boolean } = {}) {
    this.battleIndex = battleIndex;
    this.verbose = options.verbose ?? false;

    const equippedDefs = setup.equipped.map((e) => e.def);
    this.equippedDefs = equippedDefs;
    this.availableCommands = COMMAND_DEFS.filter((c) => !c.requiresPartId || equippedDefs.some((d) => d.id === c.requiresPartId));
    for (const c of this.availableCommands) this.commandCooldowns.set(c.id, 0);
    this.synergies = computeActiveSynergies(equippedDefs);
    const playerMods = computeModifiers(equippedDefs, this.synergies);
    if (playerMods.emptyCapacityDamageBonusPct > 0) {
      playerMods.finalDamageMult *= 1 + (playerMods.emptyCapacityDamageBonusPct / 100) * Math.max(0, setup.freeCapacity);
    }

    const hpBonusTotal = computeBonusHp(equippedDefs);
    const maxHp = Math.max(1, setup.coreHpBase + hpBonusTotal);

    const playerParts: RuntimePart[] = setup.equipped
      .filter((e) => e.def.interval > 0)
      .map((e) => {
        const attackMult = computePerInstanceAttackMultiplier(e.def, equippedDefs, playerMods);
        const attack = attackMult !== 1 ? Math.round(e.def.attack * attackMult * 10) / 10 : e.def.attack;
        return this.makeRuntimePart(e.instanceId, e.def.name, e.def.type, attack, e.def.interval, e.def.effects, e.def.icon, playerMods);
      });

    this.player = {
      side: 'player',
      name: 'キメラ',
      hp: Math.min(maxHp, setup.currentHp),
      maxHp,
      defense: setup.baseDefense + playerMods.battleStartDefense,
      damageReductionPct: playerMods.damageReductionPct,
      evasionPct: playerMods.evasionPct,
      mods: playerMods,
      parts: playerParts,
      poison: { value: 0, noDecayChance: 0 },
      burn: null,
      attackCountByType: {},
      reviveUsed: false,
      isDead: false,
      stats: { damageDealt: 0, healed: 0, critCount: 0 },
      fixedDamageBonus: 0,
      tempAttackSpeed: { mult: 1, phase: 'none', timeLeft: 0 },
      tempDamageReduction: { pct: 0, timeLeft: 0 },
      gimmick: null,
    };

    const enemyMods: CombatantModifiers = emptyModifiers();
    const enemyParts: RuntimePart[] = enemyDef.moves
      .filter((m) => m.interval > 0)
      .map((m: EnemyMove) => this.makeRuntimePart(m.id, m.name, 'arm', m.attack, m.interval, m.effects, m.icon, enemyMods));

    this.enemy = {
      side: 'enemy',
      name: enemyDef.name,
      hp: enemyDef.hp,
      maxHp: enemyDef.hp,
      defense: enemyDef.defense,
      damageReductionPct: enemyDef.damageReductionPct,
      evasionPct: enemyDef.evasionPct,
      mods: enemyMods,
      parts: enemyParts,
      poison: { value: 0, noDecayChance: 0 },
      burn: null,
      attackCountByType: {},
      reviveUsed: false,
      isDead: false,
      stats: { damageDealt: 0, healed: 0, critCount: 0 },
      fixedDamageBonus: 0,
      tempAttackSpeed: { mult: 1, phase: 'none', timeLeft: 0 },
      tempDamageReduction: { pct: 0, timeLeft: 0 },
      gimmick: enemyDef.gimmick ? { def: enemyDef.gimmick, phase: 'idle', timer: 0 } : null,
    };

    this.pushLog(`戦闘開始: ${enemyDef.name} が現れた！`);
    if (this.player.defense > 0) this.pushLog(`キメラの防御が${this.player.defense}になった`);
  }

  private makeRuntimePart(
    instanceId: string,
    name: string,
    type: PartType,
    attack: number,
    baseInterval: number,
    effects: PartDef['effects'],
    icon: string,
    mods: CombatantModifiers
  ): RuntimePart {
    const cooldown = Math.max(MIN_EFFECTIVE_INTERVAL, effectiveInterval(baseInterval, type, mods));
    return { instanceId, name, type, attack, isPassive: attack === 0, effects, icon, cooldown, timer: 0, activations: 0 };
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  setSpeed(speed: SpeedSetting) {
    this.speed = speed;
    this.notify();
  }

  getSpeed(): SpeedSetting {
    return this.speed;
  }

  getStatus(): BattleStatus {
    return this.status;
  }

  getFinalPlayerHp(): number {
    return this.player.hp;
  }

  private pushLog(msg: string) {
    logSeq += 1;
    this.log.unshift(`#${logSeq} ${msg}`);
    if (this.log.length > 80) this.log.length = 80;
  }

  // ダメージを与える唯一の入口。復活判定もここで行う。
  private dealDamage(target: Combatant, amount: number): number {
    if (target.isDead) return 0;
    const applied = Math.max(0, Math.round(amount));
    target.hp -= applied;
    if (target.hp <= 0) {
      if (!target.reviveUsed && target.mods.reviveHpPct) {
        target.reviveUsed = true;
        target.hp = Math.max(1, Math.round(target.maxHp * target.mods.reviveHpPct));
        this.pushLog(`💫 ${target.name}は致死ダメージから復活した！(HP${target.hp})`);
        this.pushEvent({ type: 'synergy', side: target.side, label: '心臓の奇跡' });
      } else {
        target.hp = 0;
        target.isDead = true;
        this.pushLog(`☠️ ${target.name}は倒れた`);
      }
    }
    return applied;
  }

  private applyDefenseAndReduction(raw: number, defender: Combatant): number {
    let d = raw - defender.defense;
    const totalReductionPct = Math.min(90, defender.damageReductionPct + defender.tempDamageReduction.pct);
    d = d * (1 - totalReductionPct / 100);
    return Math.max(1, d);
  }

  private resolveAttack(attacker: Combatant, defender: Combatant, part: RuntimePart, countTowardCombo: boolean) {
    if (defender.isDead || attacker.isDead) return;

    if (countTowardCombo && part.type === 'arm') {
      attacker.attackCountByType.arm = (attacker.attackCountByType.arm ?? 0) + 1;
    }

    // 回避判定
    if (Math.random() * 100 < defender.evasionPct) {
      this.pushLog(`💨 ${defender.name}は${attacker.name}の${part.name}を回避した`);
      this.pushEvent({ type: 'evade', side: attacker.side, targetSide: defender.side });
      return;
    }

    let rawDamage = part.attack;
    if (attacker.mods.defenseToDamagePct > 0) {
      rawDamage += attacker.defense * attacker.mods.defenseToDamagePct;
    }
    if (defender.burn && attacker.mods.damageVsBurningMult !== 1) {
      rawDamage *= attacker.mods.damageVsBurningMult;
    }
    const isCrit = attacker.mods.critChance > 0 && Math.random() < attacker.mods.critChance;
    if (isCrit) rawDamage *= attacker.mods.critMultiplier;
    if (attacker.mods.finalDamageMult !== 1) rawDamage *= attacker.mods.finalDamageMult;
    const finalDamage = this.applyDefenseAndReduction(rawDamage, defender);
    const applied = this.dealDamage(defender, finalDamage);
    attacker.stats.damageDealt += applied;
    if (isCrit) attacker.stats.critCount += 1;
    this.pushEvent({ type: 'attack', side: attacker.side, targetSide: defender.side, partInstanceId: part.instanceId, damage: applied, isCrit, isFixed: false, tag: this.currentAttackTag });
    if (this.verbose) {
      this.pushLog(
        `${attacker.name}の${part.icon}${part.name}: 基礎${Math.round(rawDamage)}${isCrit ? '(会心)' : ''} → 防御${defender.defense}/軽減${defender.damageReductionPct}% 適用後 ${applied}`
      );
    } else if (isCrit) {
      this.pushLog(`💥 会心の一撃！${attacker.name}の${part.icon}${part.name}が${defender.name}に${applied}ダメージ`);
    } else {
      this.pushLog(`${attacker.name}の${part.icon}${part.name}が${defender.name}に${applied}ダメージ`);
    }

    if (defender.isDead) return;

    // 命中に付随する効果（自身の効果 + オーラ効果）
    const onHit: OnHitEffect[] = [];
    for (const e of part.effects) {
      if (e.kind === 'apply_poison' || e.kind === 'apply_burn') onHit.push(e);
    }
    const aura = attacker.mods.auraOnHitByType[part.type];
    if (aura) onHit.push(...aura);
    for (const e of onHit) this.applyOnHitEffect(attacker, defender, e);

    // 被弾側の反撃
    if (defender.mods.counterDamage > 0 && !defender.isDead) {
      const cdmg = this.dealDamage(attacker, defender.mods.counterDamage);
      defender.stats.damageDealt += cdmg;
      this.pushLog(`🔁 ${defender.name}の反撃！${attacker.name}に${cdmg}ダメージ`);
    }

    if (attacker.isDead || defender.isDead) return;

    // 部位数シナジー: 腕・触手6個 → 6回攻撃毎に全腕が追加攻撃
    if (countTowardCombo && part.type === 'arm') {
      for (const proc of attacker.mods.onTypeAttackCountProcs) {
        if (proc.targetType !== 'arm') continue;
        const count = attacker.attackCountByType.arm ?? 0;
        if (count > 0 && count % proc.every === 0) {
          this.pushLog(`⚡ ${attacker.name}のコンボ発動！全ての腕・触手が追加攻撃`);
          this.pushEvent({ type: 'synergy', side: attacker.side, label: '六腕覚醒' });
          for (const armPart of attacker.parts.filter((p) => p.type === 'arm')) {
            this.resolveAttack(attacker, defender, armPart, false);
            if (defender.isDead || attacker.isDead) return;
          }
        }
      }
      // 部位数シナジー: 腕・触手10個 → 20%で別の腕が追撃
      for (const proc of attacker.mods.onTypeAttackChanceProcs) {
        if (proc.targetType !== 'arm') continue;
        if (Math.random() < proc.chance) {
          const others = attacker.parts.filter((p) => p.type === 'arm' && p.instanceId !== part.instanceId);
          if (others.length > 0) {
            const extra = others[Math.floor(Math.random() * others.length)];
            this.pushLog(`✨ ${attacker.name}の追撃！`);
            this.pushEvent({ type: 'synergy', side: attacker.side, label: '十腕乱撃' });
            this.resolveAttack(attacker, defender, extra, false);
          }
        }
      }
    }
  }

  private applyOnHitEffect(attacker: Combatant, defender: Combatant, effect: OnHitEffect) {
    if (effect.kind === 'apply_poison') {
      const amount = effect.amount + attacker.mods.statusAmountBonus;
      defender.poison.value += amount;
      defender.poison.noDecayChance = Math.max(defender.poison.noDecayChance, attacker.mods.poisonNoDecayChance);
      this.pushLog(`☠️ ${defender.name}に毒+${amount}（合計${defender.poison.value}）`);
      if (attacker.mods.onPoisonApplyGainDefense > 0) {
        attacker.defense += attacker.mods.onPoisonApplyGainDefense;
      }
    } else if (effect.kind === 'apply_burn') {
      const dps = (effect.dps + attacker.mods.statusAmountBonus) * attacker.mods.burnDamageMult;
      const duration = effect.duration;
      if (!defender.burn) {
        defender.burn = { dps, timeLeft: duration };
      } else {
        defender.burn.dps += dps;
        defender.burn.timeLeft = Math.max(defender.burn.timeLeft, duration) + duration * 0.5;
      }
      this.pushLog(`🔥 ${defender.name}が炎上（${Math.round(defender.burn.dps * 10) / 10}dmg/秒 x${Math.round(defender.burn.timeLeft * 10) / 10}秒）`);
    }
  }

  // パッシブ部位の効果を1回分適用する（heal_tick / fixed_damage_tick）。
  // 通常発動と「頭・口・目5個シナジー」等による連続発動の両方から呼ばれる共通処理。
  private applyPassiveEffectsOnce(attacker: Combatant, defender: Combatant, part: RuntimePart) {
    for (const e of part.effects) {
      if (e.kind === 'heal_tick') {
        const base = e.isPercent ? attacker.maxHp * (e.amount / 100) : e.amount;
        const amount = Math.round(base * attacker.mods.healMultiplier);
        const before = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + amount);
        const healed = attacker.hp - before;
        attacker.stats.healed += healed;
        if (healed > 0) {
          this.pushLog(`💚 ${attacker.name}の${part.icon}${part.name}がHP${healed}回復`);
          this.pushEvent({ type: 'heal', side: attacker.side, amount: healed });
        }
      } else if (e.kind === 'fixed_damage_tick') {
        if (defender.isDead) continue;
        // 固定ダメージ: 防御・被ダメージ軽減を無視する別ダメージ種
        const amount = e.amount + attacker.fixedDamageBonus;
        const applied = this.dealDamage(defender, amount);
        attacker.stats.damageDealt += applied;
        this.pushLog(`🦴 ${attacker.name}の${part.icon}${part.name}が${defender.name}に固定${applied}ダメージ`);
        this.pushEvent({ type: 'attack', side: attacker.side, targetSide: defender.side, partInstanceId: part.instanceId, damage: applied, isCrit: false, isFixed: true, tag: this.currentAttackTag });
        if (attacker.mods.fixedDamageGrowthPerProc > 0) {
          attacker.fixedDamageBonus += attacker.mods.fixedDamageGrowthPerProc;
        }
      }
    }
  }

  private activatePart(attacker: Combatant, defender: Combatant, part: RuntimePart) {
    part.activations += 1;

    if (part.attack > 0) {
      this.resolveAttack(attacker, defender, part, true);
    } else {
      // パッシブ発動（回復・固定ダメージなど）
      this.applyPassiveEffectsOnce(attacker, defender, part);
    }

    // 頭・口・目5個シナジー（20%で2回発動）や暴走遺伝子（管理画面で調整可能な確率・最大連鎖回数）による再発動。
    // maxChainは絶対上限(ABSOLUTE_MAX_CHAIN)でさらにクランプし、無限ループを防ぐ（要件29）。
    const doubleChance = attacker.mods.typeDoubleActivationChance[part.type];
    if (!doubleChance) return;
    const maxChain = Math.min(attacker.mods.typeDoubleActivationMaxChain[part.type] ?? 1, ABSOLUTE_MAX_CHAIN);
    let chain = 0;
    while (chain < maxChain && !attacker.isDead && !defender.isDead && Math.random() < doubleChance) {
      chain++;
      if (part.attack > 0) {
        this.pushLog(`🔄 ${attacker.name}の${part.name}が連続発動！（${chain}連鎖）`);
        this.resolveAttack(attacker, defender, part, false);
      } else {
        this.applyPassiveEffectsOnce(attacker, defender, part);
      }
    }
  }

  private tickStatusFor(c: Combatant) {
    if (c.poison.value > 0 && !c.isDead) {
      const dmg = c.poison.value;
      const applied = this.dealDamage(c, dmg);
      this.pushLog(`☠️ ${c.name}は毒で${applied}ダメージ`);
      const skipDecay = Math.random() < c.poison.noDecayChance;
      if (!skipDecay) {
        c.poison.value -= 1;
        if (c.poison.value <= 0) {
          c.poison.value = 0;
          c.poison.noDecayChance = 0;
        }
      }
    }
    if (c.burn && !c.isDead) {
      const applied = this.dealDamage(c, c.burn.dps);
      this.pushLog(`🔥 ${c.name}は炎上で${applied}ダメージ`);
      c.burn.timeLeft -= STATUS_TICK_INTERVAL;
      if (c.burn.timeLeft <= 0) c.burn = null;
    }
  }

  tick(rawDt: number) {
    if (this.status !== 'ongoing') return;
    if (this.speed === 0 || rawDt <= 0) return;
    const dt = Math.min(0.25, rawDt) * this.speed;
    this.time += dt;

    // TEST2フェーズ2: コマンドクールダウン・時限バフ・敵ギミックも同じdt(=ゲーム内時間)で進行させる。
    // speed=0（一時停止）のときはこのtick自体が呼ばれないため自動的に停止し、
    // speed=4のときは他の処理と同様に4倍速で進む（要件22・23）。
    for (const [id, remaining] of this.commandCooldowns) {
      if (remaining > 0) this.commandCooldowns.set(id, Math.max(0, remaining - dt));
    }
    this.tickTempEffects(this.player, dt);
    this.tickTempEffects(this.enemy, dt);
    if (this.enemy.gimmick) this.tickGimmick(dt);

    for (const [attacker, defender] of [
      [this.player, this.enemy],
      [this.enemy, this.player],
    ] as [Combatant, Combatant][]) {
      if (attacker.isDead) continue;
      for (const part of attacker.parts) {
        part.timer += dt;
        // 暴走コマンド・狂乱ギミック等の時限倍率を反映した実効クールダウン
        const effCooldown = Math.max(MIN_EFFECTIVE_INTERVAL, part.cooldown / attacker.tempAttackSpeed.mult);
        let guard = 0;
        while (part.timer >= effCooldown && guard < 20) {
          part.timer -= effCooldown;
          this.activatePart(attacker, defender, part);
          guard += 1;
          if (this.checkEnd()) return;
        }
      }
    }

    this.statusTimer += dt;
    while (this.statusTimer >= STATUS_TICK_INTERVAL) {
      this.statusTimer -= STATUS_TICK_INTERVAL;
      this.tickStatusFor(this.player);
      if (this.checkEnd()) return;
      this.tickStatusFor(this.enemy);
      if (this.checkEnd()) return;
    }

    this.checkEnd();
  }

  private checkEnd(): boolean {
    if (this.status !== 'ongoing') return true;
    if (this.player.isDead || this.player.hp <= 0) {
      this.player.hp = 0;
      this.status = 'lost';
      this.pushLog('💀 キメラのコアが機能を停止した…敗北');
      this.pushEvent({ type: 'defeat' });
      return true;
    }
    if (this.enemy.isDead || this.enemy.hp <= 0) {
      this.enemy.hp = 0;
      this.status = 'won';
      this.pushLog(`🎉 ${this.enemy.name}を撃破した！`);
      this.pushEvent({ type: 'victory' });
      return true;
    }
    return false;
  }

  // ============================================================
  // TEST2フェーズ2: コマンド・時限バフ・敵ギミック
  // ============================================================

  // 攻撃速度バフ/反動（暴走コマンド・狂乱ギミック共通）と、被ダメージ軽減バフ（防御コマンド・防御態勢ギミック共通）の時間経過処理
  private tickTempEffects(c: Combatant, dt: number) {
    if (c.tempAttackSpeed.phase !== 'none') {
      c.tempAttackSpeed.timeLeft -= dt;
      if (c.tempAttackSpeed.timeLeft <= 0) {
        if (c.tempAttackSpeed.phase === 'buff' && c.tempAttackSpeed.pendingDebuffMult !== undefined) {
          c.tempAttackSpeed = {
            mult: c.tempAttackSpeed.pendingDebuffMult,
            phase: 'debuff',
            timeLeft: c.tempAttackSpeed.pendingDebuffSeconds ?? 0,
          };
          if (c.side === 'player') this.pushLog(`💤 ${c.name}は暴走の反動で攻撃速度が低下している…`);
        } else {
          c.tempAttackSpeed = { mult: 1, phase: 'none', timeLeft: 0 };
        }
      }
    }
    if (c.tempDamageReduction.timeLeft > 0) {
      c.tempDamageReduction.timeLeft -= dt;
      if (c.tempDamageReduction.timeLeft <= 0) c.tempDamageReduction = { pct: 0, timeLeft: 0 };
    }
  }

  // 敵ギミックの状態遷移（idle→telegraph→active→idle）。予告を挟むことでプレイヤーに対応の余地を与える。
  private tickGimmick(dt: number) {
    const g = this.enemy.gimmick;
    if (!g) return;
    g.timer += dt;

    if (g.def.kind === 'golem_fortify') {
      if (g.phase === 'idle' && g.timer >= g.def.cycleSeconds) {
        g.phase = 'telegraph';
        g.timer = 0;
        this.pushLog(`🛡️ ${this.enemy.name}が防御の構えを見せた…`);
      } else if (g.phase === 'telegraph' && g.timer >= g.def.telegraphSeconds) {
        g.phase = 'active';
        g.timer = 0;
        this.enemy.tempDamageReduction = { pct: g.def.damageReductionBonusPct, timeLeft: g.def.fortifyDurationSeconds };
        this.pushLog(`🛡️ ${this.enemy.name}が防御態勢に入った！`);
      } else if (g.phase === 'active' && g.timer >= g.def.fortifyDurationSeconds) {
        g.phase = 'idle';
        g.timer = 0;
        this.pushLog(`${this.enemy.name}の防御態勢が解除された`);
      }
    } else if (g.def.kind === 'dragon_charge') {
      if (g.phase === 'idle' && g.timer >= g.def.cooldownSeconds) {
        g.phase = 'telegraph';
        g.timer = 0;
        this.pushLog(`🔥 ${this.enemy.name}が大技をチャージし始めた…`);
      } else if (g.phase === 'telegraph' && g.timer >= g.def.chargeSeconds) {
        g.phase = 'idle';
        g.timer = 0;
        this.executeDragonBurst(g.def.burstMultiplier);
      }
    } else if (g.def.kind === 'insect_frenzy') {
      if (g.phase === 'idle' && g.timer >= g.def.cycleSeconds) {
        g.phase = 'telegraph';
        g.timer = 0;
        this.pushLog(`🦟 ${this.enemy.name}の様子がおかしくなってきた…`);
      } else if (g.phase === 'telegraph' && g.timer >= g.def.telegraphSeconds) {
        g.phase = 'active';
        g.timer = 0;
        this.enemy.tempAttackSpeed = { mult: g.def.attackSpeedMult, phase: 'buff', timeLeft: g.def.frenzyDurationSeconds };
        this.pushLog(`🦟 ${this.enemy.name}が狂乱状態に陥った！攻撃速度が急上昇`);
      } else if (g.phase === 'active' && g.timer >= g.def.frenzyDurationSeconds) {
        g.phase = 'idle';
        g.timer = 0;
        this.pushLog(`${this.enemy.name}の狂乱が収まった`);
      }
    }
  }

  // ドラゴン系ギミックの大技（既存のresolveAttackをそのまま再利用し、防御コマンドで軽減できるようにする）
  private executeDragonBurst(multiplier: number) {
    if (this.enemy.isDead || this.player.isDead) return;
    const strongest = this.enemy.parts.reduce((max, p) => (p.attack > max.attack ? p : max), this.enemy.parts[0]);
    if (!strongest) return;
    const burstPart: RuntimePart = {
      ...strongest,
      attack: Math.round(strongest.attack * multiplier * 10) / 10,
      name: `${strongest.name}(渾身)`,
    };
    this.pushLog(`💥 ${this.enemy.name}の大技が炸裂！`);
    this.currentAttackTag = 'dragon_burst';
    try {
      this.resolveAttack(this.enemy, this.player, burstPart, false);
    } finally {
      this.currentAttackTag = undefined;
    }
  }

  // --- コマンド実行(公開API) ---

  getAvailableCommands(): CommandDef[] {
    return this.availableCommands;
  }

  useCommand(id: string): { ok: boolean; reason?: string } {
    if (this.status !== 'ongoing') return { ok: false, reason: '戦闘が終了しています' };
    const def = this.availableCommands.find((c) => c.id === id);
    if (!def) return { ok: false, reason: 'このコマンドは使用できません' };
    if (this.player.isDead) return { ok: false, reason: 'キメラは戦闘不能です' };
    const remaining = this.commandCooldowns.get(id) ?? 0;
    if (remaining > 0) return { ok: false, reason: `クールダウン中（残り${remaining.toFixed(1)}秒）` };

    this.pushEvent({ type: 'command', id });
    this.executeCommand(id);
    this.commandCooldowns.set(id, this.computeCommandCooldown(id));
    this.checkEnd();
    this.notify();
    return { ok: true };
  }

  private computeCommandCooldown(id: string): number {
    const def = COMMAND_DEFS.find((c) => c.id === id)!;
    if (id === 'alpha_strike') {
      const armCount = this.equippedDefs.filter((d) => d.type === 'arm').length;
      if (armCount >= ALPHA_STRIKE_ARM_CHAIN_THRESHOLD) {
        return Math.round(def.baseCooldown * (1 - ALPHA_STRIKE_CD_REDUCTION_ARM10_PCT / 100) * 10) / 10;
      }
    }
    return def.baseCooldown;
  }

  private executeCommand(id: string) {
    switch (id) {
      case 'alpha_strike':
        this.executeAlphaStrike();
        break;
      case 'rampage':
        this.executeRampage();
        break;
      case 'guard':
        this.executeGuard();
        break;
      case 'flame_breath':
        this.executeFlameBreath();
        break;
      default:
        break;
    }
  }

  // コマンド1: 一斉発動。装着中の攻撃可能な部位を全て即時発動し、通常のクールダウンをリセットする。
  // 腕・触手が6本以上ならボーナスの一斉攻撃、10本以上なら確率でさらにもう一度発動する（要件6）。
  private executeAlphaStrike() {
    this.pushLog(`⚡ ${this.player.name}が一斉発動！`);
    this.currentAttackTag = 'alpha_strike';
    try {
      const attackParts = this.player.parts.filter((p) => p.attack > 0);
      for (const p of attackParts) {
        if (this.player.isDead || this.enemy.isDead) return;
        this.resolveAttack(this.player, this.enemy, p, true);
        p.timer = 0;
      }

      const armCount = this.equippedDefs.filter((d) => d.type === 'arm').length;
      const armParts = this.player.parts.filter((p) => p.type === 'arm' && p.attack > 0);
      if (armCount >= ALPHA_STRIKE_ARM_BONUS_THRESHOLD && armParts.length > 0 && !this.player.isDead && !this.enemy.isDead) {
        this.pushLog(`⚡⚡ 腕・触手${armCount}本による追加の一斉攻撃！`);
        for (const p of armParts) {
          if (this.player.isDead || this.enemy.isDead) return;
          this.resolveAttack(this.player, this.enemy, p, false);
        }
        if (armCount >= ALPHA_STRIKE_ARM_CHAIN_THRESHOLD && Math.random() < ALPHA_STRIKE_ARM_CHAIN_CHANCE && !this.player.isDead && !this.enemy.isDead) {
          this.pushLog(`⚡⚡⚡ さらにもう一度、一斉攻撃が炸裂！`);
          for (const p of armParts) {
            if (this.player.isDead || this.enemy.isDead) return;
            this.resolveAttack(this.player, this.enemy, p, false);
          }
        }
      }
    } finally {
      this.currentAttackTag = undefined;
    }
  }

  // コマンド2: 暴走。5秒間攻撃速度2倍、その後5秒間は反動で0.75倍になる（要件7）。
  private executeRampage() {
    this.pushLog(`🔥 ${this.player.name}が暴走した！攻撃速度が急上昇`);
    this.player.tempAttackSpeed = {
      mult: RAMPAGE_BUFF_MULT,
      phase: 'buff',
      timeLeft: RAMPAGE_BUFF_SECONDS,
      pendingDebuffMult: RAMPAGE_DEBUFF_MULT,
      pendingDebuffSeconds: RAMPAGE_DEBUFF_SECONDS,
    };
  }

  // コマンド3: 防御。数秒間、受けるダメージを大幅軽減する（要件8）。外殻(skin)5個以上で持続時間+50%（要件20）。
  private executeGuard() {
    const skinCount = this.equippedDefs.filter((d) => d.type === 'skin').length;
    const duration = skinCount >= GUARD_SKIN_SYNERGY_THRESHOLD ? GUARD_BASE_SECONDS * 1.5 : GUARD_BASE_SECONDS;
    this.player.tempDamageReduction = { pct: GUARD_DAMAGE_REDUCTION_PCT, timeLeft: duration };
    this.pushLog(`🛡️ ${this.player.name}が防御態勢！${duration}秒間ダメージを大幅軽減`);
  }

  // 部位由来コマンドの試験実装（要件12）: 竜の頭部(火炎頭)装着時のみ使用可能。大ダメージ+炎上。
  private executeFlameBreath() {
    if (this.enemy.isDead) return;
    const synthetic: RuntimePart = {
      instanceId: 'cmd_flame_breath',
      name: '火炎放射',
      type: 'head',
      attack: FLAME_BREATH_ATTACK,
      isPassive: false,
      effects: [{ kind: 'apply_burn', dps: FLAME_BREATH_BURN_DPS, duration: FLAME_BREATH_BURN_DURATION }],
      icon: '🐲',
      cooldown: 999,
      timer: 0,
      activations: 0,
    };
    this.pushLog(`🐲 ${this.player.name}が火炎放射！`);
    this.currentAttackTag = 'flame_breath';
    try {
      this.resolveAttack(this.player, this.enemy, synthetic, false);
    } finally {
      this.currentAttackTag = undefined;
    }
  }

  // --- デバッグ用 ---
  debugKillEnemy() {
    this.dealDamage(this.enemy, this.enemy.hp + 9999);
    this.checkEnd();
    this.notify();
  }

  debugFullHeal() {
    this.player.hp = this.player.maxHp;
    this.enemy.hp = this.enemy.maxHp;
    this.notify();
  }

  private gimmickSnapshot(c: Combatant): GimmickSnapshot | null {
    const g = c.gimmick;
    if (!g) return null;
    let label = '通常';
    let phaseDuration = 0;
    if (g.def.kind === 'golem_fortify') {
      phaseDuration = g.phase === 'idle' ? g.def.cycleSeconds : g.phase === 'telegraph' ? g.def.telegraphSeconds : g.def.fortifyDurationSeconds;
      label = g.phase === 'telegraph' ? '防御態勢準備' : g.phase === 'active' ? '防御態勢' : '通常';
    } else if (g.def.kind === 'dragon_charge') {
      phaseDuration = g.phase === 'idle' ? g.def.cooldownSeconds : g.def.chargeSeconds;
      label = g.phase === 'telegraph' ? '大技チャージ' : '通常';
    } else if (g.def.kind === 'insect_frenzy') {
      phaseDuration = g.phase === 'idle' ? g.def.cycleSeconds : g.phase === 'telegraph' ? g.def.telegraphSeconds : g.def.frenzyDurationSeconds;
      label = g.phase === 'telegraph' ? '狂乱の予兆' : g.phase === 'active' ? '狂乱状態' : '通常';
    }
    return {
      kind: g.def.kind,
      phase: g.phase,
      label,
      timeLeft: Math.max(0, phaseDuration - g.timer),
      phaseDurationSeconds: phaseDuration,
    };
  }

  private snapshotOf(c: Combatant): CombatantSnapshot {
    return {
      side: c.side,
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      defense: c.defense,
      damageReductionPct: c.damageReductionPct,
      evasionPct: c.evasionPct,
      critPct: Math.round(c.mods.critChance * 100),
      poison: c.poison.value,
      burn: c.burn ? { ...c.burn } : null,
      parts: c.parts.map((p) => ({
        instanceId: p.instanceId,
        name: p.name,
        icon: p.icon,
        type: p.type,
        attack: p.attack,
        isPassive: p.isPassive,
        cooldown: Math.max(MIN_EFFECTIVE_INTERVAL, p.cooldown / c.tempAttackSpeed.mult),
        progress: Math.min(1, p.timer / Math.max(MIN_EFFECTIVE_INTERVAL, p.cooldown / c.tempAttackSpeed.mult)),
        activations: p.activations,
      })),
      stats: { ...c.stats },
      isDead: c.isDead,
      tempAttackSpeedMult: c.tempAttackSpeed.mult,
      tempDamageReductionPct: c.tempDamageReduction.pct,
      gimmick: this.gimmickSnapshot(c),
    };
  }

  getSnapshot(): BattleSnapshot {
    return {
      battleIndex: this.battleIndex,
      time: this.time,
      status: this.status,
      speed: this.speed,
      player: this.snapshotOf(this.player),
      enemy: this.snapshotOf(this.enemy),
      log: this.log.slice(0, 40),
      synergies: this.synergies,
      commands: this.availableCommands.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        description: c.description,
        baseCooldown: c.baseCooldown,
        cooldownRemaining: this.commandCooldowns.get(c.id) ?? 0,
        available: true,
      })),
    };
  }
}
