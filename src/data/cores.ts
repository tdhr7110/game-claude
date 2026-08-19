// ============================================================
// 初期コア（3択）
// 「はじめから」で選ぶ、ランの初期装着部位と方向性を決めるプリセット。
// 数値バランスの主体は既存の部位データそのものにあるため、ここでは
// 既存カタログの部位を組み合わせるだけにとどめ、コア専用の新しい
// 強力な効果は追加しない（初心者への説明コストを増やさないため）。
// ============================================================

export type CoreId = 'gluttony' | 'parasite' | 'iron_shell';

export interface CoreDef {
  id: CoreId;
  name: string; // 例: 暴食コア
  colorName: string; // 表示用の色名（赤/緑/青）
  accentColor: string; // カード装飾用のアクセントカラー
  icon: string;
  tagline: string; // 短い一言（得意分野）
  description: string; // 1〜2文の短い説明。数値は出さない
  strengths: string[]; // 得意分野タグ（最大2個）
  abilityPreview: string[]; // 能力プレビュー（各1行、簡潔に）
  startingPartIds: string[];
}

export const CORE_DEFS: CoreDef[] = [
  {
    id: 'gluttony',
    name: '暴食コア',
    colorName: '赤',
    accentColor: '#f8617a',
    icon: '🩸',
    tagline: '攻撃と部位集めが得意',
    description: 'とにかく喰らい、殴る。攻撃力と部位の集めやすさを重視した初心者にも分かりやすい方向性。',
    strengths: ['攻撃', '部位獲得'],
    abilityPreview: ['🦴 鋭い爪で素早く攻撃', '🍖 戦闘後の部位候補が1つ多い'],
    startingPartIds: ['dragon_claw', 'special_total_predation'],
  },
  {
    id: 'parasite',
    name: '寄生コア',
    colorName: '緑',
    accentColor: '#4ade80',
    icon: '🧪',
    tagline: '毒と状態異常が得意',
    description: 'じわじわと蝕む。攻撃に毒を乗せ続け、状態異常で相手を弱らせていく方向性。',
    strengths: ['毒', '状態異常'],
    abilityPreview: ['🪡 攻撃のたびに毒を付与', '🧪 腕・触手の攻撃に毒を追加するオーラ'],
    startingPartIds: ['insect_poison_needle_arm', 'insect_poison_gland'],
  },
  {
    id: 'iron_shell',
    name: '鉄殻コア',
    colorName: '青',
    accentColor: '#38dbf0',
    icon: '⚙️',
    tagline: '防御と容量が得意',
    description: '硬く、たくさん背負える。受けるダメージを抑えつつ、部位を装着する余裕そのものを広げる方向性。',
    strengths: ['防御', '接続容量'],
    abilityPreview: ['🧱 受けるダメージを軽減', '⚙️ 接続容量が広く、戦闘開始時に防御力も上昇'],
    startingPartIds: ['golem_rock_shell', 'golem_ancient_core'],
  },
];

export const CORE_DEFS_BY_ID: Record<CoreId, CoreDef> = Object.fromEntries(CORE_DEFS.map((c) => [c.id, c])) as Record<CoreId, CoreDef>;

export function getCoreDef(id: string): CoreDef | null {
  return (CORE_DEFS_BY_ID as Record<string, CoreDef>)[id] ?? null;
}

export function isCoreId(id: string): id is CoreId {
  return id in CORE_DEFS_BY_ID;
}
