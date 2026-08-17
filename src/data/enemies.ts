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
    hp: 28,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 6,
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
    hp: 32,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 5,
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
    hp: 36,
    defense: 1,
    damageReductionPct: 3,
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
    hp: 38,
    defense: 1,
    damageReductionPct: 3,
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
    hp: 38,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 3,
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
    hp: 34,
    defense: 0,
    damageReductionPct: 0,
    evasionPct: 4,
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
    hp: 55,
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
    hp: 72,
    defense: 3,
    damageReductionPct: 5,
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
    hp: 64,
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

// 第1階層(1-8戦)の戦闘数。深層(第2階層)の判定・倍率計算の基準に使う。
export const TIER1_BATTLE_COUNT = 8;

// 第2階層(9戦以降)の深層倍率。9戦目で1.15倍、16戦目で1.4倍になるよう線形補間する。
// （テスト版フィードバックにより、全体の難易度をさらに引き下げるため元の1.4〜1.8から2段階緩和）
const DEEP_TIER_MULT_START = 1.15;
const DEEP_TIER_MULT_END = 1.4;
const DEEP_TIER_PROGRESS_SPAN = 7; // 9戦目(progress=0)〜16戦目(progress=7)

function deepTierMultiplier(battleIndex: number): number {
  const progress = Math.max(0, battleIndex - (TIER1_BATTLE_COUNT + 1));
  const ratio = Math.min(1, progress / DEEP_TIER_PROGRESS_SPAN);
  return DEEP_TIER_MULT_START + (DEEP_TIER_MULT_END - DEEP_TIER_MULT_START) * ratio;
}

function scaleStatusEffect(effect: EnemyMove['effects'][number], statusMult: number): EnemyMove['effects'][number] {
  if (effect.kind === 'apply_poison') return { ...effect, amount: Math.ceil(effect.amount * statusMult) };
  if (effect.kind === 'apply_burn') return { ...effect, dps: Math.round(effect.dps * statusMult * 10) / 10 };
  return effect;
}

// 深層(第2階層)専用の追加倍率。種族ごとの得意分野を強調する（ゴーレム=HP/防御、昆虫=速度/毒、ドラゴン=攻撃力/炎上）。
function applyDeepTierScaling(def: EnemyDef, battleIndex: number): EnemyDef {
  const deepMult = deepTierMultiplier(battleIndex);
  let hpFactor = 1.0;
  let atkFactor = 1.0;
  let intervalFactor = 1.0;
  let statusMult = 1.0;
  let defenseBonus = 0;

  switch (def.species) {
    case 'golem':
      hpFactor = 1.15;
      defenseBonus = Math.round(deepMult * 3);
      break;
    case 'insect':
      intervalFactor = 0.85;
      statusMult = 1.5;
      break;
    case 'dragon':
      atkFactor = 1.15;
      statusMult = 1.4;
      break;
    default:
      // 最終ボス(chimera)などは全方位に軽めのボーナス
      hpFactor = 1.05;
      atkFactor = 1.05;
      statusMult = 1.2;
  }

  return {
    ...def,
    hp: Math.round(def.hp * deepMult * hpFactor),
    defense: def.defense + defenseBonus,
    moves: def.moves.map((m) => ({
      ...m,
      attack: Math.round(m.attack * deepMult * atkFactor * 10) / 10,
      interval: Math.round(m.interval * intervalFactor * 100) / 100,
      effects: m.effects.map((e) => scaleStatusEffect(e, statusMult)),
    })),
  };
}

// 戦闘番号に応じて敵をスケーリングする。
// 1-8戦(第1階層)の伸び幅はtierごとに変える：
// 「通常敵=基本的に勝ちやすい」を保つため、通常(normal)はほぼ横ばいの緩やかな伸びに留め、
// 「エリート=少し危険」の緊張感を出すため、強敵(elite)は従来通りの伸びを維持する。
// 9戦目以降(第2階層)は第1階層8戦目相当の強さを土台に、種族特化の深層倍率をさらに掛ける（深層=通常より難しい）。
export function scaleEnemy(def: EnemyDef, battleIndex: number): EnemyDef {
  const clampedIndex = Math.min(battleIndex, TIER1_BATTLE_COUNT);
  const isNormalTier = def.tier === 'normal';
  const hpMult = 1 + (clampedIndex - 1) * (isNormalTier ? 0.04 : 0.11);
  const atkMult = 1 + (clampedIndex - 1) * (isNormalTier ? 0.02 : 0.065);
  let scaled: EnemyDef = {
    ...def,
    hp: Math.round(def.hp * hpMult),
    moves: def.moves.map((m) => scaleMove(m, atkMult)),
  };
  if (battleIndex > TIER1_BATTLE_COUNT) {
    scaled = applyDeepTierScaling(scaled, battleIndex);
  }
  return scaled;
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

// 中ボス: 強敵からランダムに1体を強化して使用。
// 第1階層(battleIndex<=8)は従来通り未スケーリングの素体を使い、既存の難易度を変えない。
// 第2階層(battleIndex>8)のみ、素体にscaleEnemyの深層倍率をあらかじめ乗せてから中ボス補正をかける。
export function buildMiniboss(excludeIds: string[] = [], battleIndex: number = 5): EnemyDef {
  const rawBase = pickEliteEnemy(excludeIds);
  const base = battleIndex > TIER1_BATTLE_COUNT ? scaleEnemy(rawBase, battleIndex) : rawBase;
  return {
    ...base,
    id: `${base.id}_miniboss`,
    name: `【中ボス】強化${base.name}`,
    tier: 'miniboss',
    hp: Math.round(base.hp * 1.35),
    defense: base.defense + 2,
    damageReductionPct: base.damageReductionPct + 4,
    moves: base.moves.map((m) => scaleMove(m, 1.12)),
  };
}

// 第1階層ボス（8戦目）: 複数種族の部位を持つ巨大キメラ。第2階層では「中間ボス」として再登場する。
export function buildFinalBoss(): EnemyDef {
  return {
    id: 'final_chimera',
    name: '大キメラ',
    species: 'chimera',
    tier: 'boss',
    hp: 400,
    defense: 4,
    damageReductionPct: 6,
    evasionPct: 5,
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

// 第2階層ボス（16戦目・真の最終ボス）: 大キメラの覚醒版。既存データを流用して強化するだけで新規作成しない。
export function buildDeepFinalBoss(): EnemyDef {
  const base = buildFinalBoss();
  return {
    ...base,
    id: 'final_chimera_awakened',
    name: '覚醒した大キメラ',
    description: '深層の力を取り込み、さらに巨大化・凶暴化した大キメラの成れの果て。',
    hp: Math.round(base.hp * 1.3),
    defense: base.defense + 2,
    damageReductionPct: base.damageReductionPct + 2,
    evasionPct: base.evasionPct + 1,
    moves: base.moves.map((m) => ({
      ...m,
      attack: Math.round(m.attack * 1.15 * 10) / 10,
      effects: m.effects.map((e) => scaleStatusEffect(e, 1.1)),
    })),
  };
}

export const ALL_NORMAL_ENEMIES = NORMAL_ENEMIES;
export const ALL_ELITE_ENEMIES = ELITE_ENEMIES;
