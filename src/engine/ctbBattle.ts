import type { EnemyDef, EnemyMove } from '../data/types';
import type { PlayerBattleSetup } from './battle';
import { computeActiveSynergies } from './synergyEngine';
import { computeBonusHp, computeModifiers, computePerInstanceAttackMultiplier } from './modifiers';
import { COMMAND_BALANCE } from '../data/commandDefs';
import { CTB_COMMANDS, getCtbCommand, type CtbCommandDef } from '../data/ctbCommands';

// ============================================================
// TEST19: CTB(行動順可視化型コマンドバトル)プロトタイプ専用の戦闘エンジン。
//
// engine/battle.ts(本線・TEST18)とは完全に独立したファイルで、本線コードは
// 一切変更しない。ただし以下は本線から素直に再利用している:
//   - PlayerBattleSetup型(装備部位・コアHP・現在HPなど、戦闘準備画面から渡す形)
//   - computeActiveSynergies / computeModifiers / computeBonusHp /
//     computePerInstanceAttackMultiplier (装備部位・シナジーからのステータス計算)
//   - COMMAND_BALANCE.metabolismMax / metabolismStart (代謝ゲージの上限・初期値)
//   - data/types.ts の EnemyDef / EnemyMove (敵データそのもの。専用の敵データは作らない)
//
// 本線のBattleEngineは「毎フレームtick()する連続時間シミュレーション」だが、
// CTBは「行動順(離散イベント)」の仕組みが本質的に異なるため、エンジンとしては
// 別クラスに分離した(本線のtick駆動ループを壊さずに済む・CTB用に行動順予測の
// シミュレーションを独立して実装できる、という2つの理由から)。
//
// CT(行動順)モデル: 各陣営に「次の行動時刻(nextAt)」を持たせ、値が小さい側から
// 行動する(ATBゲージの一種)。行動すると、使用した速度とコマンドのCT倍率に応じて
// nextAtが加算される。倍率が小さいコマンドほど次の行動が早く巡ってくる。
// ============================================================

export type CtbSide = 'player' | 'enemy';
export type CtbStatus = 'ongoing' | 'won' | 'lost';
export type CtbPhase = 'player_turn' | 'ended';

export type CtbEvent =
  | { type: 'attack'; time: number; side: CtbSide; targetSide: CtbSide; commandName: string; commandIcon: string; damage: number; isCrit: boolean }
  | { type: 'evade'; time: number; side: CtbSide; targetSide: CtbSide }
  | { type: 'guard'; time: number; side: CtbSide }
  | { type: 'poison_apply'; time: number; side: CtbSide; amount: number }
  | { type: 'poison_tick'; time: number; side: CtbSide; damage: number }
  | { type: 'burn_apply'; time: number; side: CtbSide }
  | { type: 'burn_tick'; time: number; side: CtbSide; damage: number }
  | { type: 'command'; time: number; side: CtbSide; name: string; icon: string; color: string }
  | { type: 'turn_start'; time: number; side: CtbSide }
  | { type: 'victory'; time: number }
  | { type: 'defeat'; time: number };

type EventWithoutTime<T> = T extends CtbEvent ? Omit<T, 'time'> : never;

interface CtbBurnState {
  dps: number;
  turnsLeft: number;
}

interface CtbActor {
  name: string;
  icon: string;
  color: string;
  hp: number;
  maxHp: number;
  defense: number;
  damageReductionPct: number;
  evasionPct: number;
  poison: number;
  burn: CtbBurnState | null;
  isDead: boolean;
  speed: number;
}

interface CtbPlayerActor extends CtbActor {
  attackPower: number;
  critChance: number;
  critMultiplier: number;
  guardReductionPct: number; // 次の被弾1回だけ軽減する(消費型)
}

interface CtbEnemyActor extends CtbActor {
  attackMoves: EnemyMove[];
  moveIndex: number;
}

// --- CTBのCT(行動順)モデル用チューニング値。すべて仮の値。---
const CTB_BASE_INTERVAL = 100; // 速度100の陣営が1回行動するのに必要な基準値
const CTB_METABOLISM_REGEN_PER_TURN = 15; // プレイヤーターン開始時に回復する代謝(仮実装。TEST12的な検証は未実施)
const CTB_PREVIEW_STEPS = 7; // 行動順プレビューで表示する手数(5〜8手の指示に合わせる)
const CTB_MAX_RESOLVE_STEPS = 50; // 敵ターン連続処理の安全な上限(無限ループ防止)

function actionInterval(speed: number): number {
  return CTB_BASE_INTERVAL * (100 / Math.max(20, speed));
}

// 防御・被ダメージ軽減・防御コマンドの軽減を適用した最終ダメージ(最低1)。
// 本線のapplyDefenseAndReduction()と考え方は同じだが、CTBは会心・状態異常ボーナス等の
// 込み入った合成をしないため、独立した簡易版として実装している。
function computeCtbDamage(rawPower: number, defenderDefense: number, defenderReductionPct: number, guardReductionPct: number): number {
  let d = rawPower - defenderDefense;
  d = d * (1 - defenderReductionPct / 100) * (1 - guardReductionPct / 100);
  return Math.max(1, Math.round(d));
}

export interface CtbActorSnapshot {
  name: string;
  icon: string;
  color: string;
  hp: number;
  maxHp: number;
  poison: number;
  burn: CtbBurnState | null;
  isDead: boolean;
}

export interface CtbCommandSnapshot {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  metabolismCost: number;
  ctLabel: string; // 内部CT値は見せず「早い/標準/遅い」等の定性ラベルのみ渡す
  affordable: boolean;
  usable: boolean;
}

export interface CtbSnapshot {
  battleIndex: number;
  status: CtbStatus;
  phase: CtbPhase;
  turnCount: number;
  player: CtbActorSnapshot & { guardActive: boolean };
  enemy: CtbActorSnapshot;
  metabolism: { current: number; max: number };
  order: CtbSide[];
  commands: CtbCommandSnapshot[];
  log: string[];
  autoMode: boolean;
  speed: 1 | 2;
}

function ctLabel(mult: number): string {
  if (mult <= 0.65) return '⚡かなり早い';
  if (mult <= 0.9) return '🙂やや早い';
  if (mult >= 1.4) return '🐌遅い';
  return '標準';
}

let ctbLogSeq = 0;

export class CtbBattleEngine {
  private battleIndex: number;
  private status: CtbStatus = 'ongoing';
  private phase: CtbPhase = 'player_turn';
  private turnCount = 1;
  private player: CtbPlayerActor;
  private enemy: CtbEnemyActor;
  private nextAt: { player: number; enemy: number };
  private metabolism: number;
  private log: string[] = [];
  private events: CtbEvent[] = [];
  private seq = 0;
  private autoMode = false;
  private speed: 1 | 2 = 1;

  constructor(setup: PlayerBattleSetup, enemyDef: EnemyDef, battleIndex: number) {
    this.battleIndex = battleIndex;

    const equippedDefs = setup.equipped.map((e) => e.def);
    const synergies = computeActiveSynergies(equippedDefs);
    const mods = computeModifiers(equippedDefs, synergies);
    if (mods.emptyCapacityDamageBonusPct > 0) {
      mods.finalDamageMult *= 1 + (mods.emptyCapacityDamageBonusPct / 100) * Math.max(0, setup.freeCapacity);
    }
    const maxHp = Math.max(1, setup.coreHpBase + computeBonusHp(equippedDefs));

    // プレイヤーの1コマンドあたりの基礎威力: 装備中の最強攻撃部位の攻撃力を採用する
    // (本線のcmd_strike「強打」と同じ考え方の流用。CTBは技ごとの個別部位発動を持たないため、
    // 「装備の強さ」を1つの代表値へ集約している)。
    let bestAttack = 0;
    for (const e of setup.equipped) {
      if (e.def.interval <= 0 || e.def.attack <= 0) continue;
      const mult = computePerInstanceAttackMultiplier(e.def, equippedDefs, mods);
      const atk = mult !== 1 ? e.def.attack * mult : e.def.attack;
      if (atk > bestAttack) bestAttack = atk;
    }
    if (bestAttack === 0) bestAttack = 8; // 攻撃部位が1つもない場合の素手フォールバック
    if (mods.finalDamageMult !== 1) bestAttack *= mods.finalDamageMult;

    // CTBの「速度」: 既存の攻撃速度系パーツ効果(attack_speed_all / 脚のattack_speed_type等)を
    // そのまま流用する。新規のCTB専用パーツを追加しなくても、既存の脚部位がCTBの行動速度にも
    // 反映される(TEST19セクション14「高速脚」の意図を、新規データなしで満たす)。
    const speedBonusPct = mods.attackSpeedGlobalPct + mods.attackSpeedTypePct.leg;
    const playerSpeed = Math.max(40, Math.min(220, 100 * Math.max(0.4, 1 + speedBonusPct / 100)));

    this.player = {
      name: 'キメラ',
      icon: '🧬',
      color: '#4ade80',
      hp: Math.min(maxHp, setup.currentHp),
      maxHp,
      defense: setup.baseDefense + mods.battleStartDefense,
      damageReductionPct: mods.damageReductionPct,
      evasionPct: mods.evasionPct,
      poison: 0,
      burn: null,
      isDead: false,
      speed: playerSpeed,
      attackPower: bestAttack,
      critChance: mods.critChance,
      critMultiplier: mods.critMultiplier,
      guardReductionPct: 0,
    };

    const attackMoves = enemyDef.moves.filter((m) => m.attack > 0);
    // 敵の速度: 平均攻撃間隔から逆算する(間隔が短い=素早い敵ほどCTBでも先手を取りやすい)。
    // 新しい敵データを追加せず、既存のmoves.intervalをそのまま再利用する。
    const avgInterval =
      attackMoves.length > 0 ? attackMoves.reduce((sum, m) => sum + Math.max(0.5, m.interval), 0) / attackMoves.length : 3;
    const enemySpeed = Math.max(55, Math.min(170, 100 * (2.2 / Math.max(0.5, avgInterval))));

    this.enemy = {
      name: enemyDef.name,
      icon: enemyDef.icon,
      color: enemyDef.color,
      hp: enemyDef.hp,
      maxHp: enemyDef.hp,
      defense: enemyDef.defense,
      damageReductionPct: enemyDef.damageReductionPct,
      evasionPct: enemyDef.evasionPct,
      poison: 0,
      burn: null,
      isDead: false,
      speed: enemySpeed,
      attackMoves: attackMoves.length > 0 ? attackMoves : [{ id: 'fallback', name: '体当たり', attack: 5, interval: 3, tags: [], effects: [], icon: '💢' }],
      moveIndex: 0,
    };

    this.metabolism = COMMAND_BALANCE.metabolismStart;
    // 初期行動順は速度に応じたわずかなズレを持たせる(同時スタートにすると常に同じ側が
    // 先手になり続けて不自然なため、それぞれの行動間隔の半分だけ待たせてから開始する)。
    this.nextAt = { player: actionInterval(this.player.speed) / 2, enemy: actionInterval(this.enemy.speed) / 2 };

    this.pushLog(`⚔️ CTB戦闘開始: ${enemyDef.name}が現れた！`);
    this.resolveUntilPlayerOrEnd();
  }

  // ------------------------------------------------------------
  // ログ・イベント
  // ------------------------------------------------------------
  private pushLog(msg: string) {
    ctbLogSeq += 1;
    this.log.unshift(`#${ctbLogSeq} ${msg}`);
    if (this.log.length > 60) this.log.length = 60;
  }

  private pushEvent(e: EventWithoutTime<CtbEvent>) {
    this.events.push({ ...e, time: this.seq++ } as CtbEvent);
  }

  drainEvents(): CtbEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------
  // 状態異常(毒・炎上): 各陣営、自分の行動順が来た瞬間に1回だけ処理する。
  // 継続時間は「秒」ではなく「巡ってきた回数」で管理する(CTBは離散行動順のため)。
  // ------------------------------------------------------------
  private tickStatusAtTurnStart(side: CtbSide) {
    const actor = side === 'player' ? this.player : this.enemy;
    if (actor.poison > 0 && !actor.isDead) {
      const dmg = actor.poison;
      actor.hp = Math.max(0, actor.hp - dmg);
      this.pushLog(`☠️ ${actor.name}は毒で${dmg}ダメージ`);
      this.pushEvent({ type: 'poison_tick', side, damage: dmg });
      actor.poison = Math.max(0, actor.poison - 1);
      if (actor.hp <= 0) actor.isDead = true;
    }
    if (actor.burn && !actor.isDead) {
      const dmg = Math.round(actor.burn.dps);
      actor.hp = Math.max(0, actor.hp - dmg);
      this.pushLog(`🔥 ${actor.name}は炎上で${dmg}ダメージ`);
      this.pushEvent({ type: 'burn_tick', side, damage: dmg });
      actor.burn.turnsLeft -= 1;
      if (actor.burn.turnsLeft <= 0) actor.burn = null;
      if (actor.hp <= 0) actor.isDead = true;
    }
  }

  private applyOnHitEffectsToPlayer(move: EnemyMove) {
    for (const e of move.effects) {
      if (e.kind === 'apply_poison') {
        this.player.poison += e.amount;
        this.pushLog(`☠️ キメラに毒+${e.amount}（合計${this.player.poison}）`);
        this.pushEvent({ type: 'poison_apply', side: 'player', amount: e.amount });
      } else if (e.kind === 'apply_burn') {
        const turns = Math.max(1, Math.round(e.duration));
        if (!this.player.burn) this.player.burn = { dps: e.dps, turnsLeft: turns };
        else {
          this.player.burn.dps += e.dps;
          this.player.burn.turnsLeft = Math.max(this.player.burn.turnsLeft, turns);
        }
        this.pushLog(`🔥 キメラが炎上した`);
        this.pushEvent({ type: 'burn_apply', side: 'player' });
      }
    }
  }

  // ------------------------------------------------------------
  // 行動解決
  // ------------------------------------------------------------
  private resolveEnemyAttack() {
    const move = this.enemy.attackMoves[this.enemy.moveIndex % this.enemy.attackMoves.length];
    this.enemy.moveIndex += 1;

    if (Math.random() * 100 < this.player.evasionPct) {
      this.pushLog(`💨 キメラは${this.enemy.name}の${move.name}を回避した`);
      this.pushEvent({ type: 'evade', side: 'enemy', targetSide: 'player' });
    } else {
      const dmg = computeCtbDamage(move.attack, this.player.defense, this.player.damageReductionPct, this.player.guardReductionPct);
      this.player.guardReductionPct = 0; // 防御効果は1回の被弾で消費する
      this.player.hp = Math.max(0, this.player.hp - dmg);
      if (this.player.hp <= 0) this.player.isDead = true;
      this.pushLog(`${this.enemy.icon}${this.enemy.name}の${move.name}が${dmg}ダメージ`);
      this.pushEvent({ type: 'attack', side: 'enemy', targetSide: 'player', commandName: move.name, commandIcon: move.icon, damage: dmg, isCrit: false });
      this.applyOnHitEffectsToPlayer(move);
    }
    this.nextAt.enemy += actionInterval(this.enemy.speed);
  }

  private resolvePlayerAttack(cmd: CtbCommandDef) {
    if (Math.random() * 100 < this.enemy.evasionPct) {
      this.pushLog(`💨 ${this.enemy.name}が回避した`);
      this.pushEvent({ type: 'evade', side: 'player', targetSide: 'enemy' });
      return;
    }
    let power = this.player.attackPower * cmd.powerMult;
    const isCrit = this.player.critChance > 0 && Math.random() < this.player.critChance;
    if (isCrit) power *= this.player.critMultiplier;
    const dmg = computeCtbDamage(power, this.enemy.defense, this.enemy.damageReductionPct, 0);
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    if (this.enemy.hp <= 0) this.enemy.isDead = true;
    this.pushLog(`${cmd.icon}${cmd.name}が${this.enemy.name}に${dmg}ダメージ${isCrit ? '(会心)' : ''}`);
    this.pushEvent({ type: 'attack', side: 'player', targetSide: 'enemy', commandName: cmd.name, commandIcon: cmd.icon, damage: dmg, isCrit });
  }

  private resolvePlayerGuard(cmd: CtbCommandDef) {
    this.player.guardReductionPct = cmd.guardReductionPct ?? 0;
    this.pushLog(`🛡️ ${cmd.name}！次に受けるダメージを軽減する`);
    this.pushEvent({ type: 'guard', side: 'player' });
  }

  private regenMetabolismForNewPlayerTurn() {
    this.metabolism = Math.min(COMMAND_BALANCE.metabolismMax, this.metabolism + CTB_METABOLISM_REGEN_PER_TURN);
  }

  // 敵が先手を取れる限り連続で行動させ、プレイヤーの行動順が来たら止める。
  // (要件5: プレイヤーターンでは戦闘進行を停止する / 要件6: 敵は自動的に行動する)
  private resolveUntilPlayerOrEnd() {
    let guard = 0;
    while (this.status === 'ongoing' && guard < CTB_MAX_RESOLVE_STEPS) {
      guard += 1;
      const side: CtbSide = this.nextAt.player <= this.nextAt.enemy ? 'player' : 'enemy';
      if (side === 'player') {
        this.tickStatusAtTurnStart('player');
        if (this.checkEnd()) return;
        this.phase = 'player_turn';
        this.regenMetabolismForNewPlayerTurn();
        this.pushEvent({ type: 'turn_start', side: 'player' });
        return;
      }
      this.tickStatusAtTurnStart('enemy');
      if (this.checkEnd()) return;
      this.resolveEnemyAttack();
      if (this.checkEnd()) return;
    }
  }

  private checkEnd(): boolean {
    if (this.status !== 'ongoing') return true;
    if (this.player.hp <= 0 || this.player.isDead) {
      this.player.hp = 0;
      this.status = 'lost';
      this.phase = 'ended';
      this.pushLog('💀 キメラのコアが機能を停止した…敗北');
      this.pushEvent({ type: 'defeat' });
      return true;
    }
    if (this.enemy.hp <= 0 || this.enemy.isDead) {
      this.enemy.hp = 0;
      this.status = 'won';
      this.phase = 'ended';
      this.pushLog(`🎉 ${this.enemy.name}を撃破した！`);
      this.pushEvent({ type: 'victory' });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------
  // 外部API
  // ------------------------------------------------------------
  useCommand(commandId: string): { ok: boolean; reason?: string } {
    if (this.status !== 'ongoing') return { ok: false, reason: '戦闘は終了しています' };
    if (this.phase !== 'player_turn') return { ok: false, reason: 'まだ行動順ではありません' };
    const cmd = getCtbCommand(commandId);
    if (!cmd) return { ok: false, reason: '不明なコマンドです' };
    if (this.metabolism < cmd.metabolismCost) return { ok: false, reason: `代謝ゲージが足りません（必要${cmd.metabolismCost}）` };

    this.metabolism -= cmd.metabolismCost;
    this.pushEvent({ type: 'command', side: 'player', name: cmd.name, icon: cmd.icon, color: cmd.color });

    if (cmd.kind === 'attack') this.resolvePlayerAttack(cmd);
    else this.resolvePlayerGuard(cmd);

    this.nextAt.player += actionInterval(this.player.speed) * cmd.ctMultiplier;
    this.turnCount += 1;

    if (this.checkEnd()) return { ok: true };
    this.resolveUntilPlayerOrEnd();
    return { ok: true };
  }

  // 現在の行動順(先頭は「これから行動する陣営」)を予測する。
  // commandIdを渡すと「このコマンドを選んだ場合」の予測に切り替わる(要件10のプレビュー機能)。
  previewOrder(commandId: string | null, steps: number = CTB_PREVIEW_STEPS): CtbSide[] {
    if (this.phase !== 'player_turn') return [];
    const cmd = commandId ? getCtbCommand(commandId) : null;
    const firstMultiplier = cmd ? cmd.ctMultiplier : 1.0;
    const at = { ...this.nextAt };
    const order: CtbSide[] = [];
    let usedFirst = false;
    for (let i = 0; i < steps; i++) {
      const side: CtbSide = at.player <= at.enemy ? 'player' : 'enemy';
      order.push(side);
      if (side === 'player') {
        const mult = !usedFirst ? firstMultiplier : 1.0;
        usedFirst = true;
        at.player += actionInterval(this.player.speed) * mult;
      } else {
        at.enemy += actionInterval(this.enemy.speed);
      }
    }
    return order;
  }

  // AUTO用の簡易AI(要件15): 攻撃コマンド優先・代謝不足なら通常攻撃・HPが低ければ防御。
  decideAutoCommand(): CtbCommandDef {
    const guard = getCtbCommand('ctb_guard')!;
    const heavy = getCtbCommand('ctb_heavy')!;
    const quick = getCtbCommand('ctb_quick')!;
    const normal = getCtbCommand('ctb_normal')!;
    const hpPct = this.player.maxHp > 0 ? this.player.hp / this.player.maxHp : 1;
    if (hpPct < 0.3 && this.metabolism >= guard.metabolismCost) return guard;
    if (this.metabolism >= heavy.metabolismCost && Math.random() < 0.5) return heavy;
    if (this.metabolism >= quick.metabolismCost) return quick;
    return normal;
  }

  setAutoMode(v: boolean) {
    this.autoMode = v;
  }
  getAutoMode(): boolean {
    return this.autoMode;
  }
  setSpeed(v: 1 | 2) {
    this.speed = v;
  }
  getSpeed(): 1 | 2 {
    return this.speed;
  }
  getStatus(): CtbStatus {
    return this.status;
  }
  getFinalPlayerHp(): number {
    return this.player.hp;
  }

  getSnapshot(): CtbSnapshot {
    const commands: CtbCommandSnapshot[] = CTB_COMMANDS.map((cmd) => {
      const affordable = this.metabolism >= cmd.metabolismCost;
      const usable = this.status === 'ongoing' && this.phase === 'player_turn' && affordable;
      return {
        id: cmd.id,
        name: cmd.name,
        icon: cmd.icon,
        color: cmd.color,
        description: cmd.description,
        metabolismCost: cmd.metabolismCost,
        ctLabel: ctLabel(cmd.ctMultiplier),
        affordable,
        usable,
      };
    });

    return {
      battleIndex: this.battleIndex,
      status: this.status,
      phase: this.phase,
      turnCount: this.turnCount,
      player: {
        name: this.player.name,
        icon: this.player.icon,
        color: this.player.color,
        hp: Math.round(this.player.hp),
        maxHp: this.player.maxHp,
        poison: this.player.poison,
        burn: this.player.burn ? { ...this.player.burn } : null,
        isDead: this.player.isDead,
        guardActive: this.player.guardReductionPct > 0,
      },
      enemy: {
        name: this.enemy.name,
        icon: this.enemy.icon,
        color: this.enemy.color,
        hp: Math.round(this.enemy.hp),
        maxHp: this.enemy.maxHp,
        poison: this.enemy.poison,
        burn: this.enemy.burn ? { ...this.enemy.burn } : null,
        isDead: this.enemy.isDead,
      },
      metabolism: { current: Math.round(this.metabolism), max: COMMAND_BALANCE.metabolismMax },
      order: this.previewOrder(null),
      commands,
      log: this.log.slice(0, 30),
      autoMode: this.autoMode,
      speed: this.speed,
    };
  }
}
