import type { PartType, Rarity, Species, AbilityTag } from '../data/types';
import { PART_TYPE_LABELS, RARITY_LABELS, SPECIES_LABELS, TAG_LABELS } from '../data/types';

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  uncommon: '#38bdf8',
  rare: '#c084fc',
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

export function formatPct(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}%`;
}
