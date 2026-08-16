import type { EnemyDef, EnemyMove, PartDef, PartType } from '../data/types';
import { computeActiveSynergies, type ActiveSynergies } from './synergyEngine';
import { computeModifiers, effectiveInterval, emptyModifiers, type CombatantModifiers, type OnHitEffect } from './modifiers';

export type SpeedSetting = 0 | 1 | 2 | 4;
export type BattleStatus = 'ongoing' | 'won' | 'lost';

const STATUS_TICK_INTERVAL = 1.0; // 毒・炎上の判定間隔（秒）
const MIN_EFFECTIVE_INTERVAL = 0.15; // 高速化しすぎた場合の下限（無限ループ防止）

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
}

export interface PlayerBattleSetup {
  equipped: { instanceId: string; def: PartDef }[];
  coreHpBase: number;
  currentHp: number; // 前戦闘からの持ち越しHP
  baseDefense: number;
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

  constructor(setup: PlayerBattleSetup, enemyDef: EnemyDef, battleIndex: number, options: { verbose?: boolean } = {}) {
    this.battleIndex = battleIndex;
    this.verbose = options.verbose ?? false;

    const equippedDefs = setup.equipped.map((e) => e.def);
    this.synergies = computeActiveSynergies(equippedDefs);
    const playerMods = computeModifiers(equippedDefs, this.synergies);

    const hpBonusTotal = equippedDefs.reduce((sum, d) => sum + d.hpBonus, 0);
    const maxHp = Math.max(1, setup.coreHpBase + hpBonusTotal);

    const playerParts: RuntimePart[] = setup.equipped
      .filter((e) => e.def.interval > 0)
      .map((e) => this.makeRuntimePart(e.instanceId, e.def.name, e.def.type, e.def.attack, e.def.interval, e.def.effects, e.def.icon, playerMods));

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
    d = d * (1 - defender.damageReductionPct / 100);
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
    const finalDamage = this.applyDefenseAndReduction(rawDamage, defender);
    const applied = this.dealDamage(defender, finalDamage);
    attacker.stats.damageDealt += applied;
    if (isCrit) attacker.stats.critCount += 1;
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

  private activatePart(attacker: Combatant, defender: Combatant, part: RuntimePart) {
    part.activations += 1;

    if (part.attack > 0) {
      this.resolveAttack(attacker, defender, part, true);
      // 頭・口・目5個シナジー: 20%で2回発動
      const doubleChance = attacker.mods.typeDoubleActivationChance[part.type];
      if (doubleChance && !attacker.isDead && !defender.isDead && Math.random() < doubleChance) {
        this.pushLog(`🔄 ${attacker.name}の${part.name}が連続発動！`);
        this.resolveAttack(attacker, defender, part, false);
      }
    } else {
      // パッシブ発動（回復など）
      for (const e of part.effects) {
        if (e.kind === 'heal_tick') {
          const base = e.isPercent ? attacker.maxHp * (e.amount / 100) : e.amount;
          const amount = Math.round(base * attacker.mods.healMultiplier);
          const before = attacker.hp;
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + amount);
          const healed = attacker.hp - before;
          attacker.stats.healed += healed;
          if (healed > 0) this.pushLog(`💚 ${attacker.name}の${part.icon}${part.name}がHP${healed}回復`);
        }
      }
      const doubleChance = attacker.mods.typeDoubleActivationChance[part.type];
      if (doubleChance && Math.random() < doubleChance) {
        for (const e of part.effects) {
          if (e.kind === 'heal_tick') {
            const base = e.isPercent ? attacker.maxHp * (e.amount / 100) : e.amount;
            const amount = Math.round(base * attacker.mods.healMultiplier);
            const before = attacker.hp;
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + amount);
            attacker.stats.healed += attacker.hp - before;
          }
        }
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

    for (const [attacker, defender] of [
      [this.player, this.enemy],
      [this.enemy, this.player],
    ] as [Combatant, Combatant][]) {
      if (attacker.isDead) continue;
      for (const part of attacker.parts) {
        part.timer += dt;
        let guard = 0;
        while (part.timer >= part.cooldown && guard < 20) {
          part.timer -= part.cooldown;
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
      return true;
    }
    if (this.enemy.isDead || this.enemy.hp <= 0) {
      this.enemy.hp = 0;
      this.status = 'won';
      this.pushLog(`🎉 ${this.enemy.name}を撃破した！`);
      return true;
    }
    return false;
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
        cooldown: p.cooldown,
        progress: Math.min(1, p.timer / p.cooldown),
        activations: p.activations,
      })),
      stats: { ...c.stats },
      isDead: c.isDead,
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
    };
  }
}
