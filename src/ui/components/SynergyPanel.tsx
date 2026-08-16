import type { ActiveSynergies } from '../../engine/synergyEngine';
import { PART_TYPE_LABELS, SPECIES_LABELS, type PartType, type Species } from '../../data/types';
import { SPECIES_ICONS, TYPE_ICONS } from '../format';

interface SynergyPanelProps {
  synergies: ActiveSynergies;
  critChancePct?: number;
}

export function SynergyPanel({ synergies, critChancePct }: SynergyPanelProps) {
  const partTypes = Object.keys(synergies.partType) as PartType[];
  const speciesList = Object.keys(synergies.species) as Exclude<Species, 'none'>[];

  return (
    <div className="synergy-panel">
      <div className="synergy-panel__section">
        <div className="synergy-panel__title">部位数シナジー</div>
        {partTypes.map((t) => {
          const g = synergies.partType[t];
          if (g.count === 0 && g.activeTiers.length === 0) return null;
          return (
            <div key={t} className="synergy-row">
              <div className="synergy-row__head">
                <span>{TYPE_ICONS[t]} {PART_TYPE_LABELS[t]}</span>
                <span className="muted">{g.count}個装着</span>
              </div>
              {t === 'head' && !!critChancePct && (
                <div className="synergy-row__tier synergy-row__tier--active">💥 会心率 {critChancePct}%（1個につき+5%、最大65%）</div>
              )}
              {g.activeTiers.map((tier) => (
                <div key={tier.count} className="synergy-row__tier synergy-row__tier--active">
                  ✅ {tier.count}個: {tier.description}
                </div>
              ))}
              {g.nextTier && (
                <div className="synergy-row__tier synergy-row__tier--next">
                  🔒 あと{g.nextTier.count - g.count}個で: {g.nextTier.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="synergy-panel__section">
        <div className="synergy-panel__title">種族シナジー</div>
        {speciesList.map((s) => {
          const g = synergies.species[s];
          if (g.count === 0 && g.activeTiers.length === 0) return null;
          return (
            <div key={s} className="synergy-row">
              <div className="synergy-row__head">
                <span>{SPECIES_ICONS[s]} {SPECIES_LABELS[s]}</span>
                <span className="muted">{g.count}部位</span>
              </div>
              {g.activeTiers.map((tier) => (
                <div key={tier.count} className="synergy-row__tier synergy-row__tier--active">
                  ✅ {tier.count}部位: {tier.description}
                </div>
              ))}
              {g.nextTier && (
                <div className="synergy-row__tier synergy-row__tier--next">
                  🔒 あと{g.nextTier.count - g.count}部位で: {g.nextTier.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
