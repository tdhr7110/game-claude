import type { TurnEnemyDef } from '../data/turnEnemies';
import { resolveActiveSkills, type TurnCommandSlot, type TurnSkillDef } from '../data/turnSkills';
import type { PartDef } from '../data/types';

// ============================================================
// コマンドバトルTEST専用のターン制戦闘エンジン（本線の battle.ts とは完全に独立、
// 参照もしない）。ターンの流れ:
//   1. (呼び出し側が)敵の次の行動を表示
//   2. プレイヤーがコマンドを1つ選択 → executeTurn を呼ぶ
//   3. プレイヤーの技を処理
//   4. 敵が生存していれば敵の行動を処理
//   5. 毒などのターン終了効果を処理
//   6. クールダウンを進める
// 技の条件判定(どの技が使えるか)は data/turnSkills.ts、
// 技効果の実行(ダメージ計算)はこのファイルに分離している。
// ============================================================

export type TurnBattleStatus = 'ongoing' | 'won' | 'lost';

export interface TurnCombatantState {
  hp: number;
  maxHp: number;
  poison: number;
}

export interface TurnHitResult {
  amount: number;
  isBig: boolean; // 会心・毒炎爆発・フィニッシャー等、大きく見せたい一撃
}

export interface TurnResultSummary {
  turn: number;
  playerSkillName: string;
  playerHits: TurnHitResult[];
  playerTotalDamage: number;
  enemyMoveName: string | null; // null = 敵が行動しなかった(この時点で決着済み)
  enemyDamageToPlayer: number;
  enemyDamageReducedPct: number;
  reflectedDamage: number;
  poisonTickPlayer: number;
  poisonTickEnemy: number;
  outcome: TurnBattleStatus;
}

export type TurnCooldowns = Record<TurnCommandSlot, number>;

export interface TurnBattleState {
  status: TurnBattleStatus;
  turn: number;
  enemyDef: TurnEnemyDef;
  enemyMoveIndex: number; // このターンに実行される予定の行動(パターン内インデックス)
  player: TurnCombatantState;
  enemy: TurnCombatantState;
  cooldowns: TurnCooldowns;
  log: string[];
  lastResult: TurnResultSummary | null;
}

const DEFAULT_PLAYER_MAX_HP = 32;

export function createTurnBattleState(enemyDef: TurnEnemyDef, playerMaxHp: number = DEFAULT_PLAYER_MAX_HP): TurnBattleState {
  return {
    status: 'ongoing',
    turn: 1,
    enemyDef,
    enemyMoveIndex: 0,
    player: { hp: playerMaxHp, maxHp: playerMaxHp, poison: 0 },
    enemy: { hp: enemyDef.maxHp, maxHp: enemyDef.maxHp, poison: 0 },
    cooldowns: { normal: 0, mutation: 0, guard: 0 },
    log: [`⚔️ ${enemyDef.name}が現れた！`],
    lastResult: null,
  };
}

export function currentEnemyMove(state: TurnBattleState) {
  return state.enemyDef.pattern[state.enemyMoveIndex % state.enemyDef.pattern.length];
}

// --- 技効果の実行(ダメージ計算)。条件判定は一切行わない ---

function dealHit(enemy: TurnCombatantState, rawDamage: number, defense: number, isBig = false): { enemy: TurnCombatantState; hit: TurnHitResult } {
  const amount = Math.max(1, Math.round(rawDamage) - defense);
  return { enemy: { ...enemy, hp: Math.max(0, enemy.hp - amount) }, hit: { amount, isBig } };
}

interface OffensiveResult {
  enemy: TurnCombatantState;
  hits: TurnHitResult[];
}

function applyOffensiveSkill(skill: TurnSkillDef, enemyIn: TurnCombatantState, enemyDefense: number): OffensiveResult {
  const hits: TurnHitResult[] = [];
  let enemy = enemyIn;
  const v = skill.effectValues;

  switch (skill.effectId) {
    case 'wait':
    case 'single_hit': {
      const r = dealHit(enemy, v.damage, enemyDefense);
      enemy = r.enemy;
      hits.push(r.hit);
      break;
    }
    case 'multi_hit_flat': {
      for (let i = 0; i < v.hits && enemy.hp > 0; i++) {
        const r = dealHit(enemy, v.damagePerHit, enemyDefense);
        enemy = r.enemy;
        hits.push(r.hit);
      }
      break;
    }
    case 'multi_hit_finisher': {
      for (let i = 0; i < v.hits && enemy.hp > 0; i++) {
        const isLast = i === v.hits - 1;
        const r = dealHit(enemy, isLast ? v.finisherDamage : v.damagePerHit, enemyDefense, isLast);
        enemy = r.enemy;
        hits.push(r.hit);
      }
      break;
    }
    case 'multi_hit_poison_stack': {
      for (let i = 0; i < v.hits && enemy.hp > 0; i++) {
        const r = dealHit(enemy, v.damagePerHit, enemyDefense);
        enemy = { ...r.enemy, poison: r.enemy.poison + v.poisonPerHit };
        hits.push(r.hit);
      }
      if (enemy.hp > 0 && enemy.poison >= v.poisonThreshold) {
        const r = dealHit(enemy, v.bonusDamage, enemyDefense, true);
        enemy = r.enemy;
        hits.push(r.hit);
      }
      break;
    }
    case 'poison_bolt': {
      const r = dealHit(enemy, v.damage, enemyDefense);
      enemy = { ...r.enemy, poison: r.enemy.poison + v.poison };
      hits.push(r.hit);
      break;
    }
    case 'poison_burst': {
      const consumed = enemy.poison;
      const damage = consumed > 0 ? consumed * v.damagePerPoison : v.minDamage;
      const r = dealHit(enemy, damage, enemyDefense, consumed >= 5);
      enemy = { ...r.enemy, poison: 0 };
      hits.push(r.hit);
      break;
    }
    default:
      break;
  }

  return { enemy, hits };
}

interface GuardEffect {
  reductionPct: number;
  reflectPct: number;
}

function guardEffectFor(skill: TurnSkillDef): GuardEffect | null {
  if (skill.effectId === 'guard_reduce') return { reductionPct: skill.effectValues.reductionPct, reflectPct: 0 };
  if (skill.effectId === 'guard_reflect') return { reductionPct: skill.effectValues.reductionPct, reflectPct: skill.effectValues.reflectPct };
  return null;
}

// --- ターン実行 ---
// 呼び出し側(UI)で二重実行を防ぐこと(state.status !== 'ongoing' やクールダウン中の
// 選択を弾く)。この関数自身も同条件を再チェックし、不正な呼び出しはそのまま state を返す。
export function executeTurn(state: TurnBattleState, equipped: PartDef[], slot: TurnCommandSlot): TurnBattleState {
  if (state.status !== 'ongoing') return state;
  const skill = resolveActiveSkills(equipped)[slot];
  if (!skill) return state;
  if ((state.cooldowns[slot] ?? 0) > 0) return state;

  const log: string[] = [];
  let player = state.player;
  let enemy = state.enemy;
  let guard: GuardEffect | null = null;
  let playerHits: TurnHitResult[] = [];

  if (slot === 'guard') {
    guard = guardEffectFor(skill);
    log.push(`🛡️ ${skill.name}！`);
  } else {
    const result = applyOffensiveSkill(skill, enemy, state.enemyDef.defense);
    enemy = result.enemy;
    playerHits = result.hits;
    const total = playerHits.reduce((s, h) => s + h.amount, 0);
    log.push(playerHits.length > 1 ? `✨ ${skill.name}！ ${playerHits.length}ヒット 合計${total}ダメージ` : `✨ ${skill.name}！ ${total}ダメージ`);
  }
  const playerTotalDamage = playerHits.reduce((s, h) => s + h.amount, 0);

  let status: TurnBattleStatus = enemy.hp <= 0 ? 'won' : 'ongoing';
  let enemyMoveName: string | null = null;
  let enemyDamageToPlayer = 0;
  let enemyDamageReducedPct = 0;
  let reflectedDamage = 0;

  if (status === 'ongoing') {
    const move = currentEnemyMove(state);
    enemyMoveName = move.name;
    let dmg = move.damage;
    if (dmg > 0 && guard) {
      const reduced = Math.round(dmg * (guard.reductionPct / 100));
      dmg = Math.max(0, dmg - reduced);
      enemyDamageReducedPct = guard.reductionPct;
      if (guard.reflectPct > 0) {
        reflectedDamage = Math.max(0, Math.round(move.damage * (guard.reflectPct / 100)));
        enemy = { ...enemy, hp: Math.max(0, enemy.hp - reflectedDamage) };
      }
    }
    player = { ...player, hp: Math.max(0, player.hp - dmg) };
    enemyDamageToPlayer = dmg;
    if (move.poison) player = { ...player, poison: player.poison + move.poison };

    log.push(`👹 ${move.name}！ ${dmg > 0 ? `${dmg}ダメージ` : 'ノーダメージ'}${move.poison ? `（毒+${move.poison}）` : ''}`);
    if (reflectedDamage > 0) log.push(`🪞 反射！ 敵に${reflectedDamage}ダメージ`);

    if (enemy.hp <= 0) status = 'won';
    else if (player.hp <= 0) status = 'lost';
  }

  let poisonTickPlayer = 0;
  let poisonTickEnemy = 0;
  if (status === 'ongoing') {
    if (enemy.poison > 0) {
      poisonTickEnemy = enemy.poison;
      enemy = { ...enemy, hp: Math.max(0, enemy.hp - poisonTickEnemy), poison: Math.max(0, enemy.poison - 2) };
      log.push(`☠️ 敵は毒で${poisonTickEnemy}ダメージ`);
    }
    if (player.poison > 0) {
      poisonTickPlayer = player.poison;
      player = { ...player, hp: Math.max(0, player.hp - poisonTickPlayer), poison: Math.max(0, player.poison - 2) };
      log.push(`☠️ 毒で${poisonTickPlayer}ダメージを受けた`);
    }
    if (enemy.hp <= 0) status = 'won';
    else if (player.hp <= 0) status = 'lost';
  }

  if (status === 'won') log.push(`🎉 ${state.enemyDef.name}を倒した！`);
  else if (status === 'lost') log.push('💀 力尽きた…');

  const cooldowns: TurnCooldowns = { ...state.cooldowns };
  (Object.keys(cooldowns) as TurnCommandSlot[]).forEach((s) => {
    cooldowns[s] = Math.max(0, cooldowns[s] - 1);
  });
  cooldowns[slot] = skill.cooldown;

  const enemyMoveIndex = status === 'ongoing' ? (state.enemyMoveIndex + 1) % state.enemyDef.pattern.length : state.enemyMoveIndex;

  const lastResult: TurnResultSummary = {
    turn: state.turn,
    playerSkillName: skill.name,
    playerHits,
    playerTotalDamage,
    enemyMoveName,
    enemyDamageToPlayer,
    enemyDamageReducedPct,
    reflectedDamage,
    poisonTickPlayer,
    poisonTickEnemy,
    outcome: status,
  };

  return {
    ...state,
    status,
    turn: state.turn + 1,
    player,
    enemy,
    enemyMoveIndex,
    cooldowns,
    log: [...state.log, ...log].slice(-60),
    lastResult,
  };
}

// --- TEST用デバッグ操作 ---

export function debugSetHp(state: TurnBattleState, side: 'player' | 'enemy', hp: number): TurnBattleState {
  const clamped = Math.max(0, Math.min(state[side].maxHp, Math.round(hp)));
  return { ...state, [side]: { ...state[side], hp: clamped } };
}

export function debugResetCooldowns(state: TurnBattleState): TurnBattleState {
  return { ...state, cooldowns: { normal: 0, mutation: 0, guard: 0 } };
}
