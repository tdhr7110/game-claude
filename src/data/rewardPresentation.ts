import type { Rarity } from './types';

// ============================================================
// 部位獲得・コマンド獲得・コマンド進化で共通利用する「報酬演出」のデータ定義。
// レアリティごとの演出パラメータをここへ集約し、UI側(RewardOverlay)は
// このデータを読むだけにする(レアリティ分岐のif文をコンポーネント内に増やさない)。
// 将来エピック・レジェンダリー等を追加する場合は、Rarity型とこのマップへ
// 1行ずつ追加するだけでよい。
// ============================================================

export interface RarityEffectConfig {
  durationMs: number; // 演出全体の目安時間
  glowIntensity: number; // 0〜1。box-shadow等の強さに反映
  particleCount: number; // 演出中に表示する粒子の数
  scale: number; // アイコン強調時の拡大率
  screenShake: boolean; // 画面を軽く振動させるか
  backgroundDarkness: number; // 背景を暗くする濃さ(0〜1)
  beamCount: number; // 放射状の光の本数(0で非表示)
  haloRing: boolean; // アイコン周囲の光の輪を表示するか
}

export const RARITY_EFFECT_CONFIG: Record<Rarity, RarityEffectConfig> = {
  common: {
    durationMs: 900,
    glowIntensity: 0.15,
    particleCount: 5,
    scale: 1.04,
    screenShake: false,
    backgroundDarkness: 0,
    beamCount: 0,
    haloRing: false,
  },
  uncommon: {
    durationMs: 1300,
    glowIntensity: 0.5,
    particleCount: 12,
    scale: 1.08,
    screenShake: false,
    backgroundDarkness: 0.3,
    beamCount: 0,
    haloRing: true,
  },
  rare: {
    durationMs: 1900,
    glowIntensity: 0.9,
    particleCount: 24,
    scale: 1.16,
    screenShake: true,
    backgroundDarkness: 0.6,
    beamCount: 8,
    haloRing: true,
  },
};

// ------------------------------------------------------------
// 報酬カード（部位獲得・コマンド獲得・コマンド進化を同じ形で扱う）
// ------------------------------------------------------------

export type RewardType = 'part_acquired' | 'command_unlocked' | 'command_evolved';

export interface RewardCard {
  id: string; // React key / キュー内での識別用
  rewardType: RewardType;
  itemId: string; // partDefId または commandId(進化後)
  name: string;
  rarity: Rarity;
  icon: string;
  color: string;
  categoryLabel: string; // 部位種類 または コマンドカテゴリ
  description: string;
  sourcePartNames: string[]; // 解放・進化に関係した部位名

  // part_acquired専用
  connectionCost?: number;
  mainAbilityText?: string;
  // 部位・敵・キメラ図鑑への初回登録通知(TEST15)。図鑑上でまだ一度も発見していなかった
  // 場合にtrueになる(部位の付け外しによる再入手では発火しない)。
  isNewCollectionEntry?: boolean;

  // command_unlocked / command_evolved専用
  familyId?: string;
  metabolismCost?: number;
  cooldownSeconds?: number;
  alreadyEquippedSlot?: number; // 進化前がその枠に装備済みだった場合のスロット番号(-1は未装備)

  // command_evolved専用
  fromName?: string;
  fromIcon?: string;
  changeHighlights?: string[];
}
