import type { PartDef, PartType, Species, SynergyTier } from '../data/types';
import { PART_TYPE_SYNERGIES, SPECIES_SYNERGIES } from '../data/synergies';

export interface SynergyGroupState {
  count: number;
  activeTiers: SynergyTier[];
  nextTier: SynergyTier | null;
}

export interface ActiveSynergies {
  partType: Record<PartType, SynergyGroupState>;
  species: Record<Exclude<Species, 'none'>, SynergyGroupState>;
}

export function computePartTypeCounts(equipped: PartDef[]): Record<PartType, number> {
  const counts: Record<PartType, number> = { arm: 0, head: 0, heart: 0, leg: 0, skin: 0 };
  for (const p of equipped) counts[p.type]++;
  return counts;
}

export function computeSpeciesCounts(equipped: PartDef[]): Record<Exclude<Species, 'none'>, number> {
  const counts: Record<Exclude<Species, 'none'>, number> = { insect: 0, golem: 0, dragon: 0 };
  for (const p of equipped) {
    if (p.species === 'insect' || p.species === 'golem' || p.species === 'dragon') counts[p.species]++;
  }
  return counts;
}

function groupState(count: number, tiers: SynergyTier[]): SynergyGroupState {
  const activeTiers = tiers.filter((t) => count >= t.count);
  const nextTier = tiers.find((t) => count < t.count) ?? null;
  return { count, activeTiers, nextTier };
}

export function computeActiveSynergies(equipped: PartDef[]): ActiveSynergies {
  const typeCounts = computePartTypeCounts(equipped);
  const speciesCounts = computeSpeciesCounts(equipped);

  const partType = Object.fromEntries(
    (Object.keys(typeCounts) as PartType[]).map((t) => [t, groupState(typeCounts[t], PART_TYPE_SYNERGIES[t])])
  ) as Record<PartType, SynergyGroupState>;

  const species = Object.fromEntries(
    (Object.keys(speciesCounts) as Exclude<Species, 'none'>[]).map((s) => [s, groupState(speciesCounts[s], SPECIES_SYNERGIES[s])])
  ) as Record<Exclude<Species, 'none'>, SynergyGroupState>;

  return { partType, species };
}
