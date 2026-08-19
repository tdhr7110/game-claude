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

export function formatPct(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}%`;
}

// インフレ確認用の大きな数値表記(K/M)。戦闘結果の内訳表示で使用する。
export function formatBigNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// 図鑑の「初入手日時」表示用。ロケール依存にならないよう手組みでフォーマットする。
export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
