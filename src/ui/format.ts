import type { PartType, Rarity, Species, AbilityTag } from '../data/types';
import { PART_TYPE_LABELS, RARITY_LABELS, SPECIES_LABELS, TAG_LABELS } from '../data/types';

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  uncommon: '#38dbf0',
  rare: '#d879f7',
};

export const SPECIES_ICONS: Record<Species, string> = {
  insect: '🐛',
  golem: '🗿',
  dragon: '🐉',
  none: '⚙️',
};

export const TYPE_ICONS: Record<PartType, string> = {
  arm: '💪',
  head: '👁️',
  heart: '❤️',
  leg: '🦵',
  skin: '🛡️',
};

export const TAG_ICONS: Record<AbilityTag, string> = {
  poison: '☠️',
  fire: '🔥',
  multihit: '⚔️',
  defense: '🛡️',
  heal: '💚',
  counter: '🔁',
};

export function rarityLabel(r: Rarity) {
  return RARITY_LABELS[r];
}
export function typeLabel(t: PartType) {
  return PART_TYPE_LABELS[t];
}
export function speciesLabel(s: Species) {
  return SPECIES_LABELS[s];
}
export function tagLabel(t: AbilityTag) {
  return TAG_LABELS[t];
}

// TEST4: コマンドボタンをアイコンだけでなく色でも区別できるようにする（機能面には影響しない見た目のみの対応）。
export const COMMAND_COLORS: Record<string, { color: string; glow: string }> = {
  alpha_strike: { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.45)' },
  rampage: { color: '#fb7185', glow: 'rgba(251, 113, 133, 0.45)' },
  guard: { color: '#38dbf0', glow: 'rgba(56, 219, 240, 0.45)' },
  flame_breath: { color: '#f97316', glow: 'rgba(249, 115, 22, 0.45)' },
  default: { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
};

export function formatPct(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}%`;
}
