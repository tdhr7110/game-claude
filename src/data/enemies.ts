import type { EnemyDef, EnemyMove } from './types';

// ============================================================
// 敵データ（通常6種、強敵3種、中ボス生成、最終ボス）
// 新しい敵を追加する場合は NORMAL_ENEMIES / ELITE_ENEMIES に追加するだけでよい。
// ============================================================

const NORMAL_ENEMIES: EnemyDef[] = [
  {
    id: 'poison_spider',
    name: '毒蜘蛛',
    species: 'insect',
    tier: 'normal',
    hp: 45,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 12,
    description: '素早く動き回り、毒の牙で獲物を弱らせる。',
    icon: '🕷️',
    color: '#4d7c0f',
    moves: [
      { id: 'm1', name: '毒牙', attack: 3, interval: 1.0, tags: ['poison'], effects: [{ kind: 'apply_poison', amount: 1 }], icon: '🦷' },
      { id: 'm2', name: '糸絡め', attack: 2, interval: 2.0, tags: [], effects: [], icon: '🕸️' },
    ],
  },
  {
    id: 'sickle_bug',
    name: '鎌蟲',
    species: 'insect',
    tier: 'normal',
    hp: 50,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 10,
    description: '二対の鎌で絶え間なく斬りつける手数型の虫。',
    icon: '🦗',
    color: '#65a30d',
    moves: [
      { id: 'm1', name: '鎌撃', attack: 3, interval: 1.3, tags: [], effects: [], icon: '⚔️' },
      { id: 'm2', name: '鎌撃', attack: 3, interval: 1.3, tags: [], effects: [], icon: '⚔️' },
    ],
  },
  {
    id: 'small_golem',
    name: '小型ゴーレム',
    species: 'golem',
    tier: 'normal',
    hp: 55,
    defense: 1,
    damageReductionPct: 5,
    evasionPct: 0,
    description: '鈍重だが硬い岩の身体を持つ。',
    icon: '🗿',
    color: '#78716c',
    moves: [{ id: 'm1', name: '岩拳', attack: 5, interval: 1.8, tags: [], effects: [], icon: '👊' }],
  },
  {
    id: 'crystal_golem',
    name: '水晶ゴーレム',
    species: 'golem',
    tier: 'normal',
    hp: 60,
    defense: 1,
    damageReductionPct: 5,
    evasionPct: 0,
    description: '体内の水晶から魔力光線を放つ。',
    icon: '💠',
    color: '#0e7490',
    moves: [{ id: 'm1', name: '水晶光線', attack: 5, interval: 1.7, tags: [], effects: [], icon: '✨' }],
  },
  {
    id: 'baby_fire_dragon',
    name: '火竜の幼体',
    species: 'dragon',
    tier: 'normal',
    hp: 60,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 5,
    description: 'まだ幼いが、口から小さな火炎を吐く。',
    icon: '🐣',
    color: '#c2410c',
    moves: [{ id: 'm1', name: '火の息', attack: 4, interval: 1.8, tags: ['fire'], effects: [{ kind: 'apply_burn', dps: 2, duration: 3 }], icon: '🔥' }],
  },
  {
    id: 'wyvern',
    name: '翼竜',
    species: 'dragon',
    tier: 'normal',
    hp: 55,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 8,
    description: '空を舞い、爪と体当たりで攻撃する。',
    icon: '🦅',
    color: '#991b1b',
    moves: [
      { id: 'm1', name: '爪撃', attack: 4, interval: 1.0, tags: [], effects: [], icon: '🐾' },
      { id: 'm2', name: '滑空突撃', attack: 2, interval: 2.0, tags: [], effects: [], icon: '💨' },
    ],
  },
];

const ELITE_ENEMIES: EnemyDef[] = [
  {
    id: 'insect_queen',
    name: '昆虫女王',
    species: 'insect',
    tier: 'elite',
    hp: 65,
    defense: 1,
    damageReductionPct: 0,
    evasionPct: 10,
    description: '無数の毒針と鎌を操る、巣の支配者。',
    icon: '👑',
    color: '#4d7c0f',
    moves: [
      { id: 'm1', name: '毒針乱舞', attack: 3, interval: 1.1, tags: ['poison'], effects: [{ kind: 'apply_poison', amount: 1 }], icon: '🪡' },
      { id: 'm2', name: '鎌撃', attack: 3, interval: 1.1, tags: [], effects: [], icon: '⚔️' },
    ],
  },
  {
    id: 'colossus_golem',
    name: '巨像ゴーレム',
    species: 'golem',
    tier: 'elite',
    hp: 85,
    defense: 4,
    damageReductionPct: 7,
    evasionPct: 0,
    description: '一撃が致命的な質量を持つ歩く要塞。',
    icon: '🗿',
    color: '#44403c',
    moves: [
      { id: 'm1', name: '大岩拳', attack: 7, interval: 2.4, tags: [], effects: [], icon: '👊' },
      { id: 'm2', name: '地割れ', attack: 5, interval: 3.0, tags: [], effects: [], icon: '🌋' },
    ],
  },
  {
    id: 'twin_dragon',
    name: '双頭竜',
    species: 'dragon',
    tier: 'elite',
    hp: 75,
    defense: 1,
    damageReductionPct: 0,
    evasionPct: 5,
    description: '二つの顎から絶え間なく業火を吐く。',
    icon: '🐉',
    color: '#c2410c',
    moves: [
      { id: 'm1', name: '火炎ブレス', attack: 4, interval: 2.0, tags: ['fire'], effects: [{ kind: 'apply_burn', dps: 2, duration: 4 }], icon: '🔥' },
      { id: 'm2', name: '爪撃', attack: 4, interval: 1.2, tags: [], effects: [], icon: '🐾' },
    ],
  },
];

function scaleMove(move: EnemyMove, atkMult: number): EnemyMove {
  return { ...move, attack: Math.round(move.attack * atkMult * 10) / 10 };
}

// 戦闘番号(1-8)に応じて敵をスケーリングする
// 序盤は緩やかに、終盤にかけて急激に強くなる曲線（終盤はビルドを考えないと厳しい水準を狙う）
export function scaleEnemy(def: EnemyDef, battleIndex: number): EnemyDef {
  const hpMult = 1 + (battleIndex - 1) * 0.2;
  const atkMult = 1 + (battleIndex - 1) * 0.11;
  return {
    ...def,
    hp: Math.round(def.hp * hpMult),
    moves: def.moves.map((m) => scaleMove(m, atkMult)),
  };
}

export function pickNormalEnemy(excludeId?: string): EnemyDef {
  const pool = NORMAL_ENEMIES.filter((e) => e.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickEliteEnemy(excludeIds: string[] = []): EnemyDef {
  const pool = ELITE_ENEMIES.filter((e) => !excludeIds.includes(e.id));
  const src = pool.length > 0 ? pool : ELITE_ENEMIES;
  return src[Math.floor(Math.random() * src.length)];
}

// 中ボス: 強敵からランダムに1体を強化して使用
export function buildMiniboss(excludeIds: string[] = []): EnemyDef {
  const base = pickEliteEnemy(excludeIds);
  return {
    ...base,
    id: `${base.id}_miniboss`,
    name: `【中ボス】強化${base.name}`,
    tier: 'miniboss',
    hp: Math.round(base.hp * 1.6),
    defense: base.defense + 4,
    damageReductionPct: base.damageReductionPct + 6,
    moves: base.moves.map((m) => scaleMove(m, 1.3)),
  };
}

// 最終ボス: 複数種族の部位を持つ巨大キメラ
export function buildFinalBoss(): EnemyDef {
  return {
    id: 'final_chimera',
    name: '大キメラ',
    species: 'chimera',
    tier: 'boss',
    hp: 580,
    defense: 6,
    damageReductionPct: 10,
    evasionPct: 8,
    description: '昆虫・ゴーレム・ドラゴンの部位を寄せ集めた、この地の頂点。',
    icon: '👹',
    color: '#581c87',
    moves: [
      { id: 'm1', name: '複合爪撃', attack: 5, interval: 1.0, tags: [], effects: [], icon: '🐾' },
      { id: 'm2', name: '猛毒噴射', attack: 4, interval: 1.6, tags: ['poison'], effects: [{ kind: 'apply_poison', amount: 2 }], icon: '☠️' },
      { id: 'm3', name: '灼熱ブレス', attack: 5, interval: 2.2, tags: ['fire'], effects: [{ kind: 'apply_burn', dps: 3, duration: 5 }], icon: '🔥' },
      { id: 'm4', name: '巨腕の一撃', attack: 11, interval: 3.2, tags: [], effects: [], icon: '👊' },
    ],
  };
}

export const ALL_NORMAL_ENEMIES = NORMAL_ENEMIES;
export const ALL_ELITE_ENEMIES = ELITE_ENEMIES;
