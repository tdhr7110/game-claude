import { useState } from 'react';
import type { ActiveSynergies } from '../../engine/synergyEngine';
import { PART_TYPE_LABELS, SPECIES_LABELS, type PartType, type Species } from '../../data/types';
import { SPECIES_ICONS, TYPE_ICONS } from '../format';

interface SynergyPanelProps {
  synergies: ActiveSynergies;
  critChancePct?: number;
}

type FilterTab = 'all' | 'active' | 'inactive';

function stateOf(hasNextSoon: boolean, isActive: boolean): 'active' | 'soon' | 'inactive' {
  if (isActive) return 'active';
  if (hasNextSoon) return 'soon';
  return 'inactive';
}

export function SynergyPanel({ synergies, critChancePct }: SynergyPanelProps) {
  const [tab, setTab] = useState<FilterTab>('all');
  const partTypes = Object.keys(synergies.partType) as PartType[];
  const speciesList = Object.keys(synergies.species) as Exclude<Species, 'none'>[];

  const rows: { key: string; isActive: boolean; node: React.ReactNode }[] = [];

  for (const t of partTypes) {
    const g = synergies.partType[t];
    if (g.count === 0 && g.activeTiers.length === 0) continue;
    const isActive = g.activeTiers.length > 0 || (t === 'head' && !!critChancePct);
    const soon = !!g.nextTier && g.nextTier.count - g.count <= 1;
    const state = stateOf(soon, isActive);
    rows.push({
      key: `type-${t}`,
      isActive,
      node: (
        <div key={`type-${t}`} className={`synergy-row synergy-row--state-${state}`}>
          <div className="synergy-row__head">
            <span>{TYPE_ICONS[t]} {PART_TYPE_LABELS[t]}</span>
            <span className="synergy-row__level">{isActive ? `発動中 Lv.${g.activeTiers.length}` : `${g.count}個`}</span>
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
      ),
    });
  }

  for (const s of speciesList) {
    const g = synergies.species[s];
    if (g.count === 0 && g.activeTiers.length === 0) continue;
    const isActive = g.activeTiers.length > 0;
    const soon = !!g.nextTier && g.nextTier.count - g.count <= 1;
    const state = stateOf(soon, isActive);
    rows.push({
      key: `species-${s}`,
      isActive,
      node: (
        <div key={`species-${s}`} className={`synergy-row synergy-row--state-${state}`}>
          <div className="synergy-row__head">
            <span>{SPECIES_ICONS[s]} {SPECIES_LABELS[s]}</span>
            <span className="synergy-row__level">{isActive ? `発動中 Lv.${g.activeTiers.length}` : `${g.count}部位`}</span>
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
      ),
    });
  }

  const filtered = rows.filter((r) => (tab === 'all' ? true : tab === 'active' ? r.isActive : !r.isActive));

  return (
    <div className="synergy-panel">
      <div className="synergy-panel__tabs">
        <button className={`synergy-panel__tab${tab === 'all' ? ' synergy-panel__tab--active' : ''}`} onClick={() => setTab('all')}>
          すべて
        </button>
        <button className={`synergy-panel__tab${tab === 'active' ? ' synergy-panel__tab--active' : ''}`} onClick={() => setTab('active')}>
          発動中
        </button>
        <button className={`synergy-panel__tab${tab === 'inactive' ? ' synergy-panel__tab--active' : ''}`} onClick={() => setTab('inactive')}>
          未発動
        </button>
      </div>
      {filtered.length === 0 && <p className="synergy-panel__empty">該当するシナジーはまだありません。部位を装着すると表示されます。</p>}
      {filtered.map((r) => r.node)}
    </div>
  );
}
