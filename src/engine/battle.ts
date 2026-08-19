import type { EnemyDef, EnemyMove, MoveTelegraph, PartDef, PartType } from '../data/types';
import { computeActiveSynergies, type ActiveSynergies } from './synergyEngine';
import { createGimmickRuntime, type EnemyGimmickRuntime, type GimmickTickResult } from './enemyGimmickEngine';
import {
  computeBonusHp,
  computeModifiers,
  computePerInstanceAttackMultiplier,
  effectiveInterval,
  emptyModifiers,
  type CombatantModifiers,
  type OnHitEffect,
} from './modifiers';
import {
  ALL_COMMANDS,
  COMMAND_BALANCE,
  resolveFamilyBestCommand,
  type CommandCategory,
  type CommandDef,
} from '../data/commandDefs';
import {
  maxEffectValue,
  regenMetabolism,
  sumEffectValue,
  tickActiveEffects,
  tickCooldowns,
  upsertEffect,
  type ActiveCommandEffect,
} from './commandEngine';

export type SpeedSetting = 0 | 1 | 2 | 4;
export type BattleStatus = 'ongoing' | 'won' | 'lost';
export type BattleSide = 'player' | 'enemy';

// ------------------------------------------------------------
// 戦闘演出用イベント(BattleEvent)
// UIは毎フレームdrainEvents()でこの配列を取り出し、演出・SEに変換する。
// エンジン側はゲームロジックのみを持ち、描画方法には一切関知しない。
// ------------------------------------------------------------
export type BattleEvent =
  | { type: 'attack'; time: number; side: BattleSide; targetSide: BattleSide; partInstanceId: string; partName: string; partIcon: string; damage: number; isCrit: boolean; isFixed: boolean; source: 'auto' | 'command' | 'status'; commandId?: string }
  | { type: 'evade'; time: number; side: BattleSide; targetSide: BattleSide }
  | { type: 'heal'; time: number; side: BattleSide; amount: number }
  | { type: 'poison_apply'; time: number; side: BattleSide; amount: number }
  | { type: 'poison_tick'; time: number; side: BattleSide; damage: number }
  | { type: 'burn_apply'; time: number; side: BattleSide }
  | { type: 'burn_tick'; time: number; side: BattleSide; damage: number }
  | { type: 'reflect'; time: number; side: BattleSide; damage: number }
  | { type: 'command'; time: number; commandId: string; name: string; icon: string; color: string; category: CommandCategory }
  | { type: 'synergy'; time: number; side: BattleSide; label: string }
  | { type: 'special'; time: number; side: BattleSide; label: string; icon: string }
  | { type: 'overkill'; time: number; side: BattleSide; damage: number }
  // TEST7×TEST8統合: 大技の予兆(テレグラフ)。敵の攻撃側で発火する。UIは警告色の演出+専用SEに使う。
  | { type: 'telegraph'; time: number; side: BattleSide; message: string }
  // TEST7×TEST8統合: 敵固有ギミックが通常攻撃を経由せず直接与える追加ダメージ
  // (炎上スタック爆発・evade_chargeの突撃など)。attackイベントとは別枠で、専用の演出+SEに使う。
  | { type: 'gimmick_damage'; time: number; side: BattleSide; damage: number }
  | { type: 'victory'; time: number }
  | { type: 'defeat'; time: number };

const MAX_BUFFERED_EVENTS = 400; // drain漏れ時の安全な上限(4倍速でも際限なく溜め込まない)

// Omit<Union, K> はそのままだとUnionの共通キーしか残らず判別共用体が壊れるため、
// 条件型でメンバーごとに分配してからOmitする(pushEvent引数の型に使用)。
type EventWithoutTime<T> = T extends BattleEvent ? Omit<T, 'time'> : never;

const STATUS_TICK_INTERVAL = 1.0; // 毒・炎上の判定間隔（秒）
const MIN_EFFECTIVE_INTERVAL = 0.15; // 高速化しすぎた場合の下限（無限ループ防止）

// ダメージの発生源。コマンドシステムが無効な戦闘では常に'auto'扱いで、
// 既存のstats.damageDealt集計や表示は一切変わらない(追加の内訳集計のみに使う)。
type DamageSource = { kind: 'auto' | 'command' | 'status'; commandId?: string };
const AUTO_SOURCE: DamageSource = { kind: 'auto' };

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
  telegraph?: MoveTelegraph; // TEST7: 発動直前に一度だけ予兆ログを出す(敵の大技用。省略時は何もしない)
  telegraphFired: boolean;
  fusionBurstUses: number; // 融合専用能力(fusion_burst_on_hit)の発動回数。1戦闘ごとにリセットされる
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
  fixedDamageBonus: number; // 穿孔心臓等により戦闘中に成長する固定ダメージ加算値
  // --- コマンドシステム(コマンド未使用の戦闘では常に空のまま。既存挙動に影響しない) ---
  activeEffects: ActiveCommandEffect[];
  shieldValue: number; // 脱皮などの一時障壁。HPより先に消費される
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

export interface ActiveEffectSnapshot {
  key: string;
  kind: string;
  sourceName: string;
  remaining: number;
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
  activeEffects: ActiveEffectSnapshot[];
  shieldValue: number;
}

export interface CommandSlotSnapshot {
  commandId: string;
  familyId: string;
  name: string;
  description: string;
  category: CommandCategory;
  icon: string;
  color: string;
  metabolismCost: number;
  cooldownSeconds: number;
  cooldownRemaining: number;
  affordable: boolean;
  usable: boolean; // ゲージ・CD・戦闘状態・毒0での毒爆発封じ等をすべて考慮した「今押せるか」
  reason?: string; // 押せない理由(押せる場合はundefined)
}

export interface BattleResultStatsSnapshot {
  timeSeconds: number;
  autoDamage: number;
  commandDamage: number;
  statusDamage: number;
  healed: number;
  maxSingleHit: number;
  mostDamagingCommandName: string | null;
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
  commandsEnabled: boolean;
  metabolism: { current: number; max: number };
  commandSlots: (CommandSlotSnapshot | null)[];
  inputLockRemaining: number;
  lastCommandEvent: { name: string; icon: string; color: string; category: CommandCategory; time: number } | null;
  resultStats: BattleResultStatsSnapshot;
}

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
  private events: BattleEvent[] = [];

  // --- コマンドシステム ---
  private commandsEnabled = false;
  private isBossTier = false;
  private equippedCommands: (CommandDef | null)[] = [null, null, null, null];
  private metabolism: number = COMMAND_BALANCE.metabolismStart;
  private metabolismRegenPerSecondOverride: number | null = null; // TEST用
  private metabolismHitRegenBudget: number = COMMAND_BALANCE.metabolismRegenPerHitCapPerSecond;
  private metabolismHitRegenTimer = 0;
  private commandCooldowns: Record<string, number> = {};
  private commandInputLock = 0;
  private inCommandExecution = false; // 再入防止(全器官解放などの自己再発動ガード)
  private lastCommandEvent: { name: string; icon: string; color: string; category: CommandCategory; time: number } | null = null;
  private basePlayerPartCooldowns = new Map<string, number>(); // 攻撃速度バフの掛け直し用ベース値

  // --- TEST7: 敵固有ギミック ---
  private gimmick: EnemyGimmickRuntime | null = null;
  private gimmickResult: GimmickTickResult = {
    logs: [],
    events: [],
    defenseDelta: 0,
    damageReductionDeltaPct: 0,
    evasionDeltaPct: 0,
    attackSpeedMultiplier: 1,
    reflectPct: 0,
    vulnerabilityDeltaPct: 0,
    statusAmountBonus: 0,
    directDamageToPlayer: 0,
  };
  private enemyBaseDefense = 0;
  private enemyBaseDamageReductionPct = 0;
  private enemyBaseEvasionPct = 0;
  private baseEnemyPartCooldowns = new Map<string, number>(); // ギミックの攻撃速度倍率の掛け直し用ベース値
  private resultStats = {
    autoDamage: 0,
    commandDamage: 0,
    statusDamage: 0,
    healed: 0,
    maxSingleHit: 0,
    commandDamageByCommand: {} as Record<string, number>,
    // --- バランス計測(TEST12)向け: コマンド単位の内訳。コマンド未使用の戦闘では常に空のまま。 ---
    commandUsageByCommand: {} as Record<string, number>,
    commandHealByCommand: {} as Record<string, number>,
  };
  // バランス計測(TEST12)向け: プレイヤーが最後に受けたダメージの発生源ラベル。
  // 敗北時の死亡原因として使う(dealDamage()が唯一の入口のため、ここで一元管理する)。
  private lastPlayerDamageCause: string | null = null;

  constructor(
    setup: PlayerBattleSetup,
    enemyDef: EnemyDef,
    battleIndex: number,
    options: { verbose?: boolean; commandFamilyIds?: (string | null)[] } = {}
  ) {
    this.battleIndex = battleIndex;
    this.verbose = options.verbose ?? false;
    this.isBossTier = enemyDef.tier === 'boss' || enemyDef.tier === 'miniboss';

    const equippedDefs = setup.equipped.map((e) => e.def);
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
      activeEffects: [],
      shieldValue: 0,
    };
    for (const p of playerParts) this.basePlayerPartCooldowns.set(p.instanceId, p.cooldown);

    const enemyMods: CombatantModifiers = emptyModifiers();
    const enemyParts: RuntimePart[] = enemyDef.moves
      .filter((m) => m.interval > 0)
      .map((m: EnemyMove) => this.makeRuntimePart(m.id, m.name, 'arm', m.attack, m.interval, m.effects, m.icon, enemyMods, m.telegraph));

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
      activeEffects: [],
      shieldValue: 0,
    };

    this.pushLog(`戦闘開始: ${enemyDef.name} が現れた！`);
    if (this.player.defense > 0) this.pushLog(`キメラの防御が${this.player.defense}になった`);

    // --- TEST7: 敵固有ギミックの初期化 ---
    this.gimmick = createGimmickRuntime(enemyDef.gimmicks);
    this.enemyBaseDefense = this.enemy.defense;
    this.enemyBaseDamageReductionPct = this.enemy.damageReductionPct;
    this.enemyBaseEvasionPct = this.enemy.evasionPct;
    for (const p of enemyParts) this.baseEnemyPartCooldowns.set(p.instanceId, p.cooldown);

    // --- コマンドシステムの初期化(loadoutが与えられた場合のみ有効化) ---
    const loadout = options.commandFamilyIds;
    if (loadout && loadout.some((f) => f)) {
      this.commandsEnabled = true;
      this.equippedCommands = Array.from({ length: COMMAND_BALANCE.maxCommandSlots }, (_, i) => {
        const familyId = loadout[i];
        if (!familyId) return null;
        return resolveFamilyBestCommand(familyId, equippedDefs);
      });
    }
  }

  private makeRuntimePart(
    instanceId: string,
    name: string,
    type: PartType,
    attack: number,
    baseInterval: number,
    effects: PartDef['effects'],
    icon: string,
    mods: CombatantModifiers,
    telegraph?: MoveTelegraph
  ): RuntimePart {
    const cooldown = Math.max(MIN_EFFECTIVE_INTERVAL, effectiveInterval(baseInterval, type, mods));
    return { instanceId, name, type, attack, isPassive: attack === 0, effects, icon, cooldown, timer: 0, activations: 0, telegraph, telegraphFired: false, fusionBurstUses: 0 };
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

  private pushEvent(e: EventWithoutTime<BattleEvent>) {
    this.events.push({ ...e, time: this.time } as BattleEvent);
    if (this.events.length > MAX_BUFFERED_EVENTS) this.events.splice(0, this.events.length - MAX_BUFFERED_EVENTS);
  }

  // UIが毎フレーム呼び出し、蓄積されたイベントを取り出して空にする。
  drainEvents(): BattleEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  // ダメージを与える唯一の入口。復活判定もここで行う。
  // sourceはコマンドシステムの内訳集計(オート/コマンド/状態異常)専用で、
  // 省略時は既存呼び出し元と同じ'auto'として扱われ、挙動は一切変わらない。
  // causeLabelはバランス計測(TEST12)向けの死亡原因ラベル(省略可・戦闘挙動には影響しない)。
  private dealDamage(target: Combatant, amount: number, source: DamageSource = AUTO_SOURCE, causeLabel?: string): number {
    if (target.isDead) return 0;
    let applied = Math.max(0, Math.round(amount));
    if (target.shieldValue > 0 && applied > 0) {
      const absorbed = Math.min(target.shieldValue, applied);
      target.shieldValue -= absorbed;
      applied -= absorbed;
      if (absorbed > 0) this.pushLog(`🛡️ ${target.name}の障壁が${absorbed}ダメージを吸収（残り${Math.round(target.shieldValue)}）`);
    }
    if (target === this.player && applied > 0 && causeLabel) this.lastPlayerDamageCause = causeLabel;
    const hpBefore = target.hp;
    target.hp -= applied;
    if (target.hp <= 0) {
      if (!target.reviveUsed && target.mods.reviveHpPct) {
        target.reviveUsed = true;
        target.hp = Math.max(1, Math.round(target.maxHp * target.mods.reviveHpPct));
        this.pushLog(`💫 ${target.name}は致死ダメージから復活した！(HP${target.hp})`);
        this.pushEvent({ type: 'special', side: target.side, label: '復活', icon: '💫' });
      } else {
        target.hp = 0;
        target.isDead = true;
        this.pushLog(`☠️ ${target.name}は倒れた`);
        // OVERKILL: とどめの一撃が「倒すのに必要だったHP」を大きく超えている場合に演出対象とする
        if (hpBefore > 0 && applied >= hpBefore * 1.5) {
          this.pushEvent({ type: 'overkill', side: target.side, damage: applied });
        }
      }
    }
    if (this.commandsEnabled && target === this.enemy && applied > 0) {
      this.bucketResultDamage(source, applied);
    }
    return applied;
  }

  private bucketResultDamage(source: DamageSource, applied: number) {
    if (source.kind === 'auto') this.resultStats.autoDamage += applied;
    else if (source.kind === 'status') this.resultStats.statusDamage += applied;
    else if (source.kind === 'command') {
      this.resultStats.commandDamage += applied;
      if (source.commandId) {
        this.resultStats.commandDamageByCommand[source.commandId] = (this.resultStats.commandDamageByCommand[source.commandId] ?? 0) + applied;
      }
    }
    this.resultStats.maxSingleHit = Math.max(this.resultStats.maxSingleHit, applied);
  }

  private applyDefenseAndReduction(raw: number, defender: Combatant): number {
    let d = raw - defender.defense;
    const buffReductionPct = this.commandsEnabled ? maxEffectValue(defender.activeEffects, 'damage_reduction', 'reductionPct') : 0;
    // 既存の軽減%とコマンドバフの軽減%は「加算」ではなく、それぞれ独立した乗算で合成する
    // （複数の軽減源が単純加算で100%を超えて破綻しないようにするため）。
    d = d * (1 - defender.damageReductionPct / 100) * (1 - buffReductionPct / 100);
    const cmdVulnerabilityPct = this.commandsEnabled ? sumEffectValue(defender.activeEffects, 'vulnerability', 'vulnerabilityPct') : 0;
    const gimmickVulnerabilityPct = defender === this.enemy ? this.gimmickResult.vulnerabilityDeltaPct : 0;
    const vulnerabilityPct = cmdVulnerabilityPct + gimmickVulnerabilityPct;
    if (vulnerabilityPct > 0) d = d * (1 + vulnerabilityPct / 100);
    return Math.max(1, d);
  }

  private resolveAttack(
    attacker: Combatant,
    defender: Combatant,
    part: RuntimePart,
    countTowardCombo: boolean,
    source: DamageSource = AUTO_SOURCE,
    chainDepth = 0
  ) {
    if (defender.isDead || attacker.isDead) return;
    if (chainDepth > COMMAND_BALANCE.maxChainDepth) return; // 連鎖深度の安全な上限

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
    const critChanceBonus = this.commandsEnabled && attacker === this.player ? sumEffectValue(attacker.activeEffects, 'crit', 'critChancePctAdd') / 100 : 0;
    const critMultBonus = this.commandsEnabled && attacker === this.player ? sumEffectValue(attacker.activeEffects, 'crit', 'critMultAdd') : 0;
    const isCrit = attacker.mods.critChance + critChanceBonus > 0 && Math.random() < attacker.mods.critChance + critChanceBonus;
    if (isCrit) rawDamage *= attacker.mods.critMultiplier + critMultBonus;
    if (attacker.mods.finalDamageMult !== 1) rawDamage *= attacker.mods.finalDamageMult;
    const finalDamage = this.applyDefenseAndReduction(rawDamage, defender);
    const applied = this.dealDamage(defender, finalDamage, source, `${attacker.name}の${part.name}`);
    attacker.stats.damageDealt += applied;
    if (isCrit) attacker.stats.critCount += 1;
    if (this.commandsEnabled && attacker === this.player && applied > 0) this.gainOnHitMetabolism();
    this.pushEvent({
      type: 'attack',
      side: attacker.side,
      targetSide: defender.side,
      partInstanceId: part.instanceId,
      partName: part.name,
      partIcon: part.icon,
      damage: applied,
      isCrit,
      isFixed: false,
      source: source.kind,
      commandId: source.commandId,
    });
    if (this.verbose) {
      this.pushLog(
        `${attacker.name}の${part.icon}${part.name}: 基礎${Math.round(rawDamage)}${isCrit ? '(会心)' : ''} → 防御${defender.defense}/軽減${defender.damageReductionPct}% 適用後 ${applied}`
      );
    } else if (isCrit) {
      this.pushLog(`💥 会心の一撃！${attacker.name}の${part.icon}${part.name}が${defender.name}に${applied}ダメージ`);
    } else {
      this.pushLog(`${attacker.name}の${part.icon}${part.name}が${defender.name}に${applied}ダメージ`);
    }

    // 反射甲殻(コマンドバフ): 被弾側(defender)が反射を持っていれば、軽減前ダメージの一部を跳ね返す。
    // dealDamageを直接呼ぶだけでresolveAttackを再帰しないため、反射から反射は発生しない。
    if (applied > 0 && !defender.isDead && !attacker.isDead) {
      const cmdReflectPct = this.commandsEnabled ? maxEffectValue(defender.activeEffects, 'reflect', 'reflectPct') : 0;
      const gimmickReflectPct = defender === this.enemy ? this.gimmickResult.reflectPct : 0;
      const reflectPct = Math.max(cmdReflectPct, gimmickReflectPct);
      if (reflectPct > 0) {
        const reflectAmount = Math.max(0, Math.round(rawDamage * (reflectPct / 100)));
        if (reflectAmount > 0) {
          const dealt = this.dealDamage(attacker, reflectAmount, { kind: 'command' }, `${defender.name}の反射`);
          this.pushLog(`🪞 ${defender.name}の反射甲殻！${attacker.name}に${dealt}ダメージ`);
          this.pushEvent({ type: 'reflect', side: defender.side, damage: dealt });
        }
      }
    }

    if (defender.isDead) return;

    // 命中に付随する効果（自身の効果 + オーラ効果 + 毒液分泌バフ）
    const onHit: OnHitEffect[] = [];
    for (const e of part.effects) {
      if (e.kind === 'apply_poison' || e.kind === 'apply_burn') onHit.push(e);
    }
    const aura = attacker.mods.auraOnHitByType[part.type];
    if (aura) onHit.push(...aura);
    if (this.commandsEnabled && attacker === this.player && part.type === 'arm') {
      const venomPerHit = sumEffectValue(attacker.activeEffects, 'poison_on_hit', 'amount');
      if (venomPerHit > 0) onHit.push({ kind: 'apply_poison', amount: venomPerHit });
    }
    for (const e of onHit) this.applyOnHitEffect(attacker, defender, e);

    // 融合専用能力: 攻撃命中時、一定確率で追加ダメージが発生する（「通常の追加攻撃」として扱う）。
    // UI説明(data/fusion.ts exclusiveDescription)は「追加ダメージ+X%」であり「固定ダメージ」
    // とは明示していないため、通常攻撃と同じ防御・軽減計算(applyDefenseAndReduction)を通す。
    // 骨槍などの真の固定ダメージ効果(「防御無視の固定」と明示)とは異なる。
    // maxActivationsPerBattleを超えて発動しないようpart.fusionBurstUsesで厳密にガードし、
    // 「能力の発動回数は1戦闘あたり有限」であることを保証する（無限ループ・無限連鎖の防止）。
    if (!defender.isDead && applied > 0) {
      for (const e of part.effects) {
        if (e.kind !== 'fusion_burst_on_hit') continue;
        if (part.fusionBurstUses >= e.maxActivationsPerBattle) continue;
        if (Math.random() >= e.chance) continue;
        part.fusionBurstUses += 1;
        const bonusRaw = Math.max(1, Math.round(rawDamage * (e.bonusDamagePct / 100)));
        const bonusFinal = this.applyDefenseAndReduction(bonusRaw, defender);
        const bonusApplied = this.dealDamage(defender, bonusFinal, source, `${attacker.name}の${part.name}(融合追撃)`);
        attacker.stats.damageDealt += bonusApplied;
        this.pushLog(
          `✨ ${attacker.name}の${part.icon}${part.name}が融合の追撃！+${bonusApplied}ダメージ（残り発動${e.maxActivationsPerBattle - part.fusionBurstUses}回）`
        );
        if (defender.isDead) break;
      }
    }

    // 被弾側の反撃
    if (defender.mods.counterDamage > 0 && !defender.isDead) {
      const cdmg = this.dealDamage(attacker, defender.mods.counterDamage, source, `${defender.name}の反撃`);
      defender.stats.damageDealt += cdmg;
      this.pushLog(`🔁 ${defender.name}の反撃！${attacker.name}に${cdmg}ダメージ`);
      this.pushEvent({ type: 'special', side: defender.side, label: '反撃', icon: '🔁' });
    }

    if (attacker.isDead || defender.isDead) return;

    // 部位数シナジー: 腕・触手6個 → 6回攻撃毎に全腕が追加攻撃
    if (countTowardCombo && part.type === 'arm') {
      for (const proc of attacker.mods.onTypeAttackCountProcs) {
        if (proc.targetType !== 'arm') continue;
        const count = attacker.attackCountByType.arm ?? 0;
        if (count > 0 && count % proc.every === 0) {
          this.pushLog(`⚡ ${attacker.name}のコンボ発動！全ての腕・触手が追加攻撃`);
          this.pushEvent({ type: 'synergy', side: attacker.side, label: 'コンボ発動' });
          for (const armPart of attacker.parts.filter((p) => p.type === 'arm')) {
            this.resolveAttack(attacker, defender, armPart, false, source, chainDepth + 1);
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
            this.pushEvent({ type: 'synergy', side: attacker.side, label: '追撃' });
            this.resolveAttack(attacker, defender, extra, false, source, chainDepth + 1);
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
      this.pushEvent({ type: 'poison_apply', side: defender.side, amount });
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
      this.pushEvent({ type: 'burn_apply', side: defender.side });
    }
  }

  // パッシブ部位の効果を1回分適用する（heal_tick / fixed_damage_tick）。
  // 通常発動と「頭・口・目5個シナジー」等による連続発動の両方から呼ばれる共通処理。
  private applyPassiveEffectsOnce(attacker: Combatant, defender: Combatant, part: RuntimePart, source: DamageSource = AUTO_SOURCE) {
    for (const e of part.effects) {
      if (e.kind === 'heal_tick') {
        const base = e.isPercent ? attacker.maxHp * (e.amount / 100) : e.amount;
        const amount = Math.round(base * attacker.mods.healMultiplier);
        const before = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + amount);
        const healed = attacker.hp - before;
        attacker.stats.healed += healed;
        if (this.commandsEnabled && attacker === this.player) this.resultStats.healed += healed;
        if (healed > 0) {
          this.pushLog(`💚 ${attacker.name}の${part.icon}${part.name}がHP${healed}回復`);
          this.pushEvent({ type: 'heal', side: attacker.side, amount: healed });
        }
      } else if (e.kind === 'fixed_damage_tick') {
        if (defender.isDead) continue;
        // 固定ダメージ: 防御・被ダメージ軽減を無視する別ダメージ種
        const amount = e.amount + attacker.fixedDamageBonus;
        const applied = this.dealDamage(defender, amount, source, `${attacker.name}の${part.name}(固定)`);
        attacker.stats.damageDealt += applied;
        this.pushLog(`🦴 ${attacker.name}の${part.icon}${part.name}が${defender.name}に固定${applied}ダメージ`);
        this.pushEvent({
          type: 'attack',
          side: attacker.side,
          targetSide: defender.side,
          partInstanceId: part.instanceId,
          partName: part.name,
          partIcon: part.icon,
          damage: applied,
          isCrit: false,
          isFixed: true,
          source: source.kind,
          commandId: source.commandId,
        });
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
      // 頭・口・目5個シナジー: 20%で2回発動
      const doubleChance = attacker.mods.typeDoubleActivationChance[part.type];
      if (doubleChance && !attacker.isDead && !defender.isDead && Math.random() < doubleChance) {
        this.pushLog(`🔄 ${attacker.name}の${part.name}が連続発動！`);
        this.resolveAttack(attacker, defender, part, false);
      }
    } else {
      // パッシブ発動（回復・固定ダメージなど）
      this.applyPassiveEffectsOnce(attacker, defender, part);
      const doubleChance = attacker.mods.typeDoubleActivationChance[part.type];
      if (doubleChance && !attacker.isDead && !defender.isDead && Math.random() < doubleChance) {
        this.applyPassiveEffectsOnce(attacker, defender, part);
      }
    }
  }

  private tickStatusFor(c: Combatant) {
    // sourceは'status'固定。dealDamage側でtarget===enemyの時だけ集計されるため、
    // プレイヤーが受けた状態異常ダメージ(c===player)は内訳集計に混ざらない。
    if (c.poison.value > 0 && !c.isDead) {
      const dmg = c.poison.value;
      const applied = this.dealDamage(c, dmg, { kind: 'status' }, '毒');
      this.pushLog(`☠️ ${c.name}は毒で${applied}ダメージ`);
      this.pushEvent({ type: 'poison_tick', side: c.side, damage: applied });
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
      const applied = this.dealDamage(c, c.burn.dps, { kind: 'status' }, '炎上');
      this.pushLog(`🔥 ${c.name}は炎上で${applied}ダメージ`);
      this.pushEvent({ type: 'burn_tick', side: c.side, damage: applied });
      c.burn.timeLeft -= STATUS_TICK_INTERVAL;
      if (c.burn.timeLeft <= 0) c.burn = null;
    }
  }

  private isStunned(c: Combatant): boolean {
    return this.commandsEnabled && c.activeEffects.some((e) => e.kind === 'stun');
  }

  tick(rawDt: number) {
    if (this.status !== 'ongoing') return;
    if (this.speed === 0 || rawDt <= 0) return;
    const dt = Math.min(0.25, rawDt) * this.speed;
    this.time += dt;

    if (this.commandsEnabled) this.tickCommandSystem(dt);

    for (const [attacker, defender] of [
      [this.player, this.enemy],
      [this.enemy, this.player],
    ] as [Combatant, Combatant][]) {
      if (attacker.isDead) continue;
      if (attacker.side === 'enemy' && this.isStunned(attacker)) continue; // 神経麻痺: 敵の自動攻撃処理を丸ごと止める
      for (const part of attacker.parts) {
        part.timer += dt;
        // TEST7: 大技の予兆表示(データ駆動。特定の敵IDに依存しない汎用処理)
        if (part.telegraph && !part.telegraphFired && part.cooldown - part.timer <= part.telegraph.warnBeforeSec) {
          this.pushLog(part.telegraph.message);
          this.pushEvent({ type: 'telegraph', side: attacker.side, message: part.telegraph.message });
          part.telegraphFired = true;
        }
        let guard = 0;
        while (part.timer >= part.cooldown && guard < 20) {
          part.timer -= part.cooldown;
          this.activatePart(attacker, defender, part);
          part.telegraphFired = false;
          guard += 1;
          if (this.checkEnd()) return;
        }
      }
    }

    this.tickGimmick(dt);
    if (this.checkEnd()) return;

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

  // --- TEST7: 敵固有ギミックの毎フレーム更新 ---
  // 神経麻痺で敵が行動不能の間は、ギミック側の状態変化も止める(通常攻撃と同じ扱いにするため)。
  private tickGimmick(dt: number) {
    if (!this.gimmick || this.enemy.isDead) return;
    if (this.isStunned(this.enemy)) return;

    const result = this.gimmick.tick({
      dt,
      time: this.time,
      enemyHpPct: this.enemy.maxHp > 0 ? this.enemy.hp / this.enemy.maxHp : 0,
      playerHasBurn: !!this.player.burn,
    });
    this.gimmickResult = result;
    for (const msg of result.logs) this.pushLog(msg);
    // TEST8統合: ギミックの状態変化を短いトースト演出として表示する(ログはそのまま維持)。
    for (const ev of result.events) this.pushEvent({ type: 'special', side: 'enemy', label: ev.label, icon: ev.icon });

    this.enemy.defense = this.enemyBaseDefense + result.defenseDelta;
    this.enemy.damageReductionPct = Math.max(0, this.enemyBaseDamageReductionPct + result.damageReductionDeltaPct);
    this.enemy.evasionPct = Math.max(0, this.enemyBaseEvasionPct + result.evasionDeltaPct);
    this.enemy.mods.statusAmountBonus = result.statusAmountBonus;
    for (const part of this.enemy.parts) {
      const base = this.baseEnemyPartCooldowns.get(part.instanceId) ?? part.cooldown;
      part.cooldown = Math.max(MIN_EFFECTIVE_INTERVAL, base / Math.max(0.2, result.attackSpeedMultiplier));
    }

    if (result.directDamageToPlayer > 0 && !this.player.isDead) {
      const finalDamage = this.applyDefenseAndReduction(result.directDamageToPlayer, this.player);
      const applied = this.dealDamage(this.player, finalDamage, AUTO_SOURCE, `${this.enemy.name}の固有ギミック`);
      this.enemy.stats.damageDealt += applied;
      // TEST8統合: 通常攻撃(resolveAttack)を経由しないギミック直接ダメージも、
      // ダメージ数値の演出+SEに反映されるよう専用イベントを発生させる。
      this.pushEvent({ type: 'gimmick_damage', side: 'player', damage: applied });
    }
  }

  // --- コマンドシステムの毎フレーム更新(代謝ゲージ・クールダウン・バフデバフ) ---
  private tickCommandSystem(dt: number) {
    const regenPerSecond = this.metabolismRegenPerSecondOverride ?? COMMAND_BALANCE.metabolismRegenPerSecond;
    this.metabolism = regenMetabolism(this.metabolism, COMMAND_BALANCE.metabolismMax, regenPerSecond * dt);

    this.metabolismHitRegenTimer += dt;
    while (this.metabolismHitRegenTimer >= 1) {
      this.metabolismHitRegenTimer -= 1;
      this.metabolismHitRegenBudget = COMMAND_BALANCE.metabolismRegenPerHitCapPerSecond;
    }

    this.commandCooldowns = tickCooldowns(this.commandCooldowns, dt);
    this.commandInputLock = Math.max(0, this.commandInputLock - dt);

    const hadPlayerSpeedBuff = sumEffectValue(this.player.activeEffects, 'attack_speed', 'pct') > 0;
    this.player.activeEffects = tickActiveEffects(this.player.activeEffects, dt);
    this.enemy.activeEffects = tickActiveEffects(this.enemy.activeEffects, dt);
    const hasPlayerSpeedBuffNow = sumEffectValue(this.player.activeEffects, 'attack_speed', 'pct') > 0;
    if (hadPlayerSpeedBuff !== hasPlayerSpeedBuffNow) this.recomputePlayerPartCooldowns();

    // 持続回復(多重鼓動・竜脈再生)
    for (const e of this.player.activeEffects) {
      if (e.kind === 'heal_over_time' && e.values.pctPerSec) {
        this.healPlayer(this.player.maxHp * (e.values.pctPerSec / 100) * dt, false, e.sourceCommandId);
      }
    }
  }

  private gainOnHitMetabolism() {
    if (this.metabolismHitRegenBudget <= 0) return;
    const grant = Math.min(COMMAND_BALANCE.metabolismRegenPerHit, this.metabolismHitRegenBudget);
    this.metabolism = regenMetabolism(this.metabolism, COMMAND_BALANCE.metabolismMax, grant);
    this.metabolismHitRegenBudget -= grant;
  }

  // 攻撃速度バフの開始/終了時に、装着部位の実効クールダウンを掛け直す。
  // ベース値(静的シナジー込み)は基準に保持しておき、バフ分だけ追加で乗算する。
  private recomputePlayerPartCooldowns() {
    const buffPct = sumEffectValue(this.player.activeEffects, 'attack_speed', 'pct');
    const mult = Math.max(0.2, 1 + buffPct / 100);
    for (const part of this.player.parts) {
      const base = this.basePlayerPartCooldowns.get(part.instanceId) ?? part.cooldown;
      part.cooldown = Math.max(MIN_EFFECTIVE_INTERVAL, base / mult);
    }
  }

  // プレイヤーのHPを回復する共通処理(ログ・statsの二重管理を避けるための唯一の入口)。
  // logをtrueにすると即時回復として1行ログを出す(継続回復は毎フレーム呼ばれるため既定でログを出さない)。
  // commandIdはバランス計測(TEST12)向けのコマンド別回復量集計用(省略可・戦闘挙動には影響しない)。
  // healPlayer()は現状すべてコマンド由来の回復(即時回復・持続回復バフ)からしか呼ばれない。
  private healPlayer(amount: number, log = true, commandId?: string) {
    if (amount <= 0) return;
    const before = this.player.hp;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    const healed = this.player.hp - before;
    this.player.stats.healed += healed;
    if (this.commandsEnabled) {
      this.resultStats.healed += healed;
      if (commandId && healed > 0) {
        this.resultStats.commandHealByCommand[commandId] = (this.resultStats.commandHealByCommand[commandId] ?? 0) + healed;
      }
    }
    if (healed > 0 && log) {
      // 継続回復(heal_over_time)の毎フレーム加算はlog=falseで呼ばれるため、
      // ここでは即時回復(応急再生・多重鼓動の初速分など)のみイベント化する。
      // 毎フレームイベントを出すと4倍速時に演出・SEが際限なく発生するため。
      this.pushLog(`💚 ${Math.round(healed)}回復`);
      this.pushEvent({ type: 'heal', side: 'player', amount: Math.round(healed) });
    }
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

  private snapshotOf(c: Combatant): CombatantSnapshot {
    return {
      side: c.side,
      name: c.name,
      hp: Math.round(c.hp),
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
      stats: { damageDealt: Math.round(c.stats.damageDealt), healed: Math.round(c.stats.healed), critCount: c.stats.critCount },
      isDead: c.isDead,
      activeEffects: c.activeEffects.map((e) => ({ key: e.key, kind: e.kind, sourceName: e.sourceName, remaining: Math.max(0, Math.round(e.remaining * 10) / 10) })),
      shieldValue: Math.round(c.shieldValue),
    };
  }

  private commandSlotSnapshot(cmd: CommandDef | null): CommandSlotSnapshot | null {
    if (!cmd) return null;
    const cooldownRemaining = this.commandCooldowns[cmd.commandId] ?? 0;
    const affordable = this.metabolism >= cmd.metabolismCost;
    let reason: string | undefined;
    if (this.status !== 'ongoing') reason = '戦闘は終了しています';
    else if (this.commandInputLock > 0) reason = '入力ロック中';
    else if (cooldownRemaining > 0) reason = `クールダウン中（残り${Math.ceil(cooldownRemaining)}秒）`;
    else if (!affordable) reason = `代謝ゲージ不足（必要${cmd.metabolismCost}）`;
    else if ((cmd.effectId === 'poison_burst' || cmd.effectId === 'plague_burst') && this.enemy.poison.value <= 0) reason = '敵に毒が付与されていません';
    return {
      commandId: cmd.commandId,
      familyId: cmd.familyId,
      name: cmd.name,
      description: cmd.description,
      category: cmd.category,
      icon: cmd.icon,
      color: cmd.color,
      metabolismCost: cmd.metabolismCost,
      cooldownSeconds: cmd.cooldownSeconds,
      cooldownRemaining: Math.max(0, Math.round(cooldownRemaining * 10) / 10),
      affordable,
      usable: !reason,
      reason,
    };
  }

  private resultStatsSnapshot(): BattleResultStatsSnapshot {
    let mostDamagingCommandName: string | null = null;
    let best = 0;
    for (const [commandId, dmg] of Object.entries(this.resultStats.commandDamageByCommand)) {
      if (dmg > best) {
        best = dmg;
        mostDamagingCommandName = ALL_COMMANDS.find((c) => c.commandId === commandId)?.name ?? commandId;
      }
    }
    return {
      timeSeconds: Math.round(this.time * 10) / 10,
      autoDamage: Math.round(this.resultStats.autoDamage),
      commandDamage: Math.round(this.resultStats.commandDamage),
      statusDamage: Math.round(this.resultStats.statusDamage),
      healed: Math.round(this.resultStats.healed),
      maxSingleHit: Math.round(this.resultStats.maxSingleHit),
      mostDamagingCommandName,
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
      commandsEnabled: this.commandsEnabled,
      metabolism: { current: Math.round(this.metabolism), max: COMMAND_BALANCE.metabolismMax },
      commandSlots: this.equippedCommands.map((c) => this.commandSlotSnapshot(c)),
      inputLockRemaining: Math.max(0, Math.round(this.commandInputLock * 100) / 100),
      lastCommandEvent: this.lastCommandEvent,
      resultStats: this.resultStatsSnapshot(),
    };
  }

  // ============================================================
  // コマンド発動
  // ============================================================
  useCommand(slotIndex: number): { ok: boolean; reason?: string } {
    if (!this.commandsEnabled) return { ok: false, reason: 'この戦闘ではコマンドは有効化されていません' };
    if (this.status !== 'ongoing') return { ok: false, reason: '戦闘は終了しています' };
    if (this.inCommandExecution) return { ok: false, reason: '処理中です' };
    if (this.commandInputLock > 0) return { ok: false, reason: '入力ロック中（二重発動防止）' };
    const cmd = this.equippedCommands[slotIndex];
    if (!cmd) return { ok: false, reason: 'この枠にはコマンドが装備されていません' };
    const cooldownLeft = this.commandCooldowns[cmd.commandId] ?? 0;
    if (cooldownLeft > 0) return { ok: false, reason: `クールダウン中（残り${Math.ceil(cooldownLeft)}秒）` };
    if (this.metabolism < cmd.metabolismCost) {
      return { ok: false, reason: `代謝ゲージが足りません（必要${cmd.metabolismCost} / 現在${Math.floor(this.metabolism)}）` };
    }
    if ((cmd.effectId === 'poison_burst' || cmd.effectId === 'plague_burst') && this.enemy.poison.value <= 0) {
      return { ok: false, reason: '敵に毒が付与されていません' };
    }

    this.metabolism -= cmd.metabolismCost;
    this.commandCooldowns[cmd.commandId] = cmd.cooldownSeconds;
    this.commandInputLock = COMMAND_BALANCE.commandInputLockSeconds;
    this.lastCommandEvent = { name: cmd.name, icon: cmd.icon, color: cmd.color, category: cmd.category, time: this.time };
    this.resultStats.commandUsageByCommand[cmd.commandId] = (this.resultStats.commandUsageByCommand[cmd.commandId] ?? 0) + 1;
    this.pushLog(`⚡[コマンド] ${cmd.name}を発動！`);
    this.pushEvent({ type: 'command', commandId: cmd.commandId, name: cmd.name, icon: cmd.icon, color: cmd.color, category: cmd.category });

    this.inCommandExecution = true;
    try {
      this.executeCommandEffect(cmd);
    } finally {
      this.inCommandExecution = false;
    }
    this.checkEnd();
    this.notify();
    return { ok: true };
  }

  private vulnerabilityMultiplier(defender: Combatant): number {
    if (!this.commandsEnabled) return 1;
    const pct = sumEffectValue(defender.activeEffects, 'vulnerability', 'vulnerabilityPct');
    return pct > 0 ? 1 + pct / 100 : 1;
  }

  private executeCommandEffect(cmd: CommandDef) {
    const v = cmd.effectValues;
    const src: DamageSource = { kind: 'command', commandId: cmd.commandId };

    switch (cmd.effectId) {
      case 'strike_best': {
        const best = this.player.parts
          .filter((p) => p.attack > 0)
          .reduce<RuntimePart | null>((a, b) => (!a || b.attack > a.attack ? b : a), null);
        if (best) {
          this.resolveAttack(this.player, this.enemy, best, false, src);
        } else {
          const dmg = v.fallbackDamage * this.vulnerabilityMultiplier(this.enemy);
          const applied = this.dealDamage(this.enemy, dmg, src);
          this.player.stats.damageDealt += applied;
          this.pushLog(`👊 強打！${applied}ダメージ`);
        }
        break;
      }
      case 'guard_reduce': {
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'guard_reduction',
          kind: 'damage_reduction',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { reductionPct: v.reductionPct },
        });
        break;
      }
      case 'emergency_regen': {
        this.healPlayer(this.player.maxHp * (v.healPctOfMax / 100), true, cmd.commandId);
        break;
      }
      case 'all_arms_volley':
      case 'hundred_arms_barrage': {
        const attackParts = [...this.player.parts.filter((p) => p.attack > 0)];
        const powerMult = v.powerPct / 100;
        for (let hit = 0; hit < v.hits; hit++) {
          for (const part of attackParts) {
            if (this.enemy.isDead || this.player.isDead) break;
            const scaled: RuntimePart = { ...part, attack: part.attack * powerMult };
            this.resolveAttack(this.player, this.enemy, scaled, false, src, 1);
          }
          if (this.enemy.isDead || this.player.isDead) break;
        }
        break;
      }
      case 'bone_spear': {
        const applied = this.dealDamage(this.enemy, v.fixedDamage, src);
        this.player.stats.damageDealt += applied;
        this.pushLog(`🦴 骨槍！防御無視の固定${applied}ダメージ`);
        break;
      }
      case 'predation_bite': {
        const dmg = v.damage * this.vulnerabilityMultiplier(this.enemy);
        const applied = this.dealDamage(this.enemy, dmg, src);
        this.player.stats.damageDealt += applied;
        this.healPlayer(applied * (v.lifestealPct / 100), true, cmd.commandId);
        this.pushLog(`🩸 捕食咬み！${applied}ダメージ`);
        break;
      }
      case 'flame_bolt':
      case 'hell_flame_bolt': {
        let dmg = v.damage;
        if (v.bonusIfBurningPct > 0 && this.enemy.burn) dmg *= 1 + v.bonusIfBurningPct / 100;
        dmg *= this.vulnerabilityMultiplier(this.enemy);
        const applied = this.dealDamage(this.enemy, dmg, src);
        this.player.stats.damageDealt += applied;
        if (!this.enemy.burn) this.enemy.burn = { dps: v.burnDps, timeLeft: v.burnDuration };
        else {
          this.enemy.burn.dps += v.burnDps;
          this.enemy.burn.timeLeft = Math.max(this.enemy.burn.timeLeft, v.burnDuration);
        }
        this.pushLog(`🔥 ${cmd.name}！${applied}ダメージ＋炎上`);
        break;
      }
      case 'poison_burst':
      case 'plague_burst': {
        const current = this.enemy.poison.value;
        const consumed = cmd.effectId === 'poison_burst' ? Math.min(current, v.maxConsume) : Math.round(current * v.consumeFraction);
        this.enemy.poison.value = Math.max(0, current - consumed);
        const dmg = consumed * v.damagePerPoison * this.vulnerabilityMultiplier(this.enemy);
        const applied = this.dealDamage(this.enemy, dmg, src);
        this.player.stats.damageDealt += applied;
        this.pushLog(`☠️💥 ${cmd.name}！毒${consumed}を消費し${applied}ダメージ`);
        break;
      }
      case 'mana_cannon': {
        const reducedDefense = this.enemy.defense * (1 - v.defenseIgnorePct / 100);
        let d = v.damage - reducedDefense;
        d = d * (1 - this.enemy.damageReductionPct / 100) * this.vulnerabilityMultiplier(this.enemy);
        d = Math.max(1, d);
        const applied = this.dealDamage(this.enemy, d, src);
        this.player.stats.damageDealt += applied;
        this.pushLog(`🔮 魔力砲！${applied}ダメージ`);
        break;
      }
      case 'frenzy_buff': {
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'attack_speed_frenzy',
          kind: 'attack_speed',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { pct: v.attackSpeedPct },
        });
        this.recomputePlayerPartCooldowns();
        break;
      }
      case 'eye_focus_buff': {
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'crit_focus',
          kind: 'crit',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { critChancePctAdd: v.critChancePctAdd, critMultAdd: v.critMultAdd },
        });
        break;
      }
      case 'venom_secretion_buff': {
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'venom_secretion',
          kind: 'poison_on_hit',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { amount: v.poisonPerArmHit },
        });
        break;
      }
      case 'harden_buff':
      case 'reflect_shell_buff': {
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'harden_reduction',
          kind: 'damage_reduction',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { reductionPct: v.reductionPct },
        });
        if (cmd.effectId === 'reflect_shell_buff') {
          this.player.activeEffects = upsertEffect(this.player.activeEffects, {
            key: 'harden_reflect',
            kind: 'reflect',
            sourceCommandId: cmd.commandId,
            sourceName: cmd.name,
            remaining: v.durationSec,
            values: { reflectPct: v.reflectPct },
          });
        }
        break;
      }
      case 'shell_break_debuff':
      case 'predator_mark_debuff': {
        this.enemy.activeEffects = upsertEffect(this.enemy.activeEffects, {
          key: 'vulnerability',
          kind: 'vulnerability',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { vulnerabilityPct: v.vulnerabilityPct },
        });
        break;
      }
      case 'paralysis_debuff': {
        const dur = this.isBossTier ? v.durationSec * (v.bossDurationMultPct / 100) : v.durationSec;
        this.enemy.activeEffects = upsertEffect(this.enemy.activeEffects, {
          key: 'stun',
          kind: 'stun',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: dur,
          values: {},
        });
        this.pushLog(`🕸️ 神経麻痺！${this.enemy.name}の行動を${Math.round(dur * 10) / 10}秒停止`);
        break;
      }
      case 'heartbeat_heal':
      case 'dragon_vein_heal': {
        this.healPlayer(this.player.maxHp * (v.instantPct / 100), true, cmd.commandId);
        this.player.activeEffects = upsertEffect(this.player.activeEffects, {
          key: 'heal_over_time',
          kind: 'heal_over_time',
          sourceCommandId: cmd.commandId,
          sourceName: cmd.name,
          remaining: v.durationSec,
          values: { pctPerSec: v.tickPctPerSec },
        });
        if (cmd.effectId === 'dragon_vein_heal' && v.attackSpeedBuffPct) {
          this.player.activeEffects = upsertEffect(this.player.activeEffects, {
            key: 'attack_speed_dragon_vein',
            kind: 'attack_speed',
            sourceCommandId: cmd.commandId,
            sourceName: cmd.name,
            remaining: v.durationSec,
            values: { pct: v.attackSpeedBuffPct },
          });
          this.recomputePlayerPartCooldowns();
        }
        break;
      }
      case 'molt_cleanse': {
        this.player.poison = { value: 0, noDecayChance: 0 };
        this.player.burn = null;
        this.player.shieldValue += this.player.maxHp * (v.shieldPct / 100);
        this.pushLog(`🐍 脱皮！毒と炎上を解除し、障壁${Math.round(this.player.maxHp * (v.shieldPct / 100))}を展開した`);
        break;
      }
      case 'full_organ_release': {
        const attackParts = [...this.player.parts.filter((p) => p.attack > 0)];
        for (const part of attackParts) {
          if (this.enemy.isDead) break;
          this.resolveAttack(this.player, this.enemy, part, false, src, 1);
        }
        if (!this.enemy.isDead) {
          // 周期器官(パッシブ: 回復・固定ダメージ)を1回ずつ発動する。
          // 全器官解放自身はコマンドでありパッシブ部位ではないため、この一覧には含まれ得ない
          // (=構造的に自己再発動しない)。
          for (const part of this.player.parts.filter((p) => p.attack === 0)) {
            this.applyPassiveEffectsOnce(this.player, this.enemy, part, src);
          }
        }
        const selfDamage = this.player.maxHp * (v.selfDamagePctOfMax / 100);
        this.player.hp = Math.max(1, this.player.hp - selfDamage);
        this.pushLog(`💢 全器官解放の代償で自身に${Math.round(selfDamage)}ダメージ（HP1は残る）`);
        break;
      }
      default:
        break;
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

  // --- コマンドシステムTEST用デバッグ操作 ---
  debugSetMetabolism(value: number) {
    this.metabolism = Math.max(0, Math.min(COMMAND_BALANCE.metabolismMax, value));
    this.notify();
  }

  debugSetMetabolismRegenPerSecond(value: number | null) {
    this.metabolismRegenPerSecondOverride = value;
    this.notify();
  }

  debugResetCommandCooldowns() {
    this.commandCooldowns = {};
    this.commandInputLock = 0;
    this.notify();
  }

  // 条件を無視してこの枠へ強制的にコマンドを装備する(TEST専用。戦闘中の一時的な検証用)。
  debugForceUnlockCommand(slotIndex: number, commandId: string) {
    if (slotIndex < 0 || slotIndex >= this.equippedCommands.length) return;
    const cmd = ALL_COMMANDS.find((c) => c.commandId === commandId) ?? null;
    this.equippedCommands[slotIndex] = cmd;
    this.notify();
  }

  debugSetHp(side: 'player' | 'enemy', value: number) {
    const c = side === 'player' ? this.player : this.enemy;
    c.hp = Math.max(0, Math.min(c.maxHp, value));
    this.checkEnd();
    this.notify();
  }

  debugSetEnemyAttackMult(mult: number) {
    for (const part of this.enemy.parts) part.attack = part.attack * mult;
    this.notify();
  }

  debugResetResultStats() {
    this.resultStats = {
      autoDamage: 0,
      commandDamage: 0,
      statusDamage: 0,
      healed: 0,
      maxSingleHit: 0,
      commandDamageByCommand: {},
      commandUsageByCommand: {},
      commandHealByCommand: {},
    };
    this.notify();
  }

  isCommandsEnabled(): boolean {
    return this.commandsEnabled;
  }

  // --- バランス計測(TEST12)向け: 戦闘終了後にUI側が読み取るための追加情報 ---
  // 装備されていなかった/未使用のコマンドはキーごと存在しない(0埋めしない)。
  getCommandBreakdown(): Record<string, { count: number; damage: number; heal: number }> {
    const ids = new Set([
      ...Object.keys(this.resultStats.commandUsageByCommand),
      ...Object.keys(this.resultStats.commandDamageByCommand),
      ...Object.keys(this.resultStats.commandHealByCommand),
    ]);
    const out: Record<string, { count: number; damage: number; heal: number }> = {};
    for (const id of ids) {
      out[id] = {
        count: this.resultStats.commandUsageByCommand[id] ?? 0,
        damage: Math.round(this.resultStats.commandDamageByCommand[id] ?? 0),
        heal: Math.round(this.resultStats.commandHealByCommand[id] ?? 0),
      };
    }
    return out;
  }

  // 敗北時のみ非null。プレイヤーへ最後にダメージを与えた要因のラベルを返す。
  getDeathCause(): string | null {
    return this.status === 'lost' ? this.lastPlayerDamageCause : null;
  }

  // 戦闘開始時点で各枠に解決された具体的なcommandId(familyIdではない)。空き枠はnull。
  getEquippedCommandIds(): (string | null)[] {
    return this.equippedCommands.map((c) => c?.commandId ?? null);
  }
}
