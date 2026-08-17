import type { PartDef } from '../../data/types';
import { RARITY_COLORS, SPECIES_ICONS, rarityLabel, speciesLabel, tagLabel, typeLabel } from '../format';
import { PART_TYPE_SYNERGIES, SPECIES_SYNERGIES } from '../../data/synergies';

interface PartDetailPanelProps {
  def: PartDef;
  cost?: number;
  compareWith?: PartDef[]; // 同種の現装着パーツとの比較用
}

export function PartDetailPanel({ def, cost, compareWith }: PartDetailPanelProps) {
  const effectiveCost = cost ?? def.cost;
  return (
    <div className="detail-panel" style={{ borderColor: RARITY_COLORS[def.rarity] }}>
      <div className="detail-panel__header">
        <span className="detail-panel__icon" style={{ color: def.color }}>
          {def.icon}
        </span>
        <div>
          <div className="detail-panel__name">{def.name}</div>
          <div className="detail-panel__sub">
            <span style={{ color: RARITY_COLORS[def.rarity] }}>{rarityLabel(def.rarity)}</span> ・ {typeLabel(def.type)} ・{' '}
            {SPECIES_ICONS[def.species]}
            {speciesLabel(def.species)}
          </div>
        </div>
      </div>
      <p className="detail-panel__desc">{def.description}</p>
      {def.passiveDescription && <p className="detail-panel__passive">🌀 {def.passiveDescription}</p>}
      <div className="detail-panel__stats-grid">
        <div>
          🔌 接続コスト: <b>{effectiveCost}</b>
          {effectiveCost !== def.cost && <span className="muted"> (基礎{def.cost})</span>}
        </div>
        <div>
          ❤️ HP補正: <b>{def.hpBonus >= 0 ? '+' : ''}{def.hpBonus}</b>
        </div>
        {def.attack > 0 ? (
          <>
            <div>
              ⚔️ 攻撃力: <b>{def.attack}</b>
            </div>
            <div>
              ⏱️ 攻撃間隔: <b>{def.interval}秒</b>
            </div>
          </>
        ) : (
          <div className="muted">パッシブ部位（自動攻撃なし）</div>
        )}
      </div>
      {def.tags.length > 0 && (
        <div className="detail-panel__tags">
          {def.tags.map((t) => (
            <span key={t} className="chip">
              {tagLabel(t)}
            </span>
          ))}
        </div>
      )}
      <div className="detail-panel__synergy">
        <div className="muted">🔗 シナジー</div>
        {PART_TYPE_SYNERGIES[def.type].map((tier) => (
          <div key={`type-${tier.count}`} className="detail-panel__synergy-row">
            【{typeLabel(def.type)}】{tier.count}個: {tier.description}
          </div>
        ))}
        {def.species !== 'none' &&
          SPECIES_SYNERGIES[def.species].map((tier) => (
            <div key={`species-${tier.count}`} className="detail-panel__synergy-row">
              【{speciesLabel(def.species)}】{tier.count}部位: {tier.description}
            </div>
          ))}
      </div>
      {compareWith && compareWith.length > 0 && (
        <div className="detail-panel__compare">
          <div className="muted">現在装着中の同種部位と比較:</div>
          {compareWith.map((c) => (
            <div key={c.id} className="detail-panel__compare-row">
              <span>{c.icon} {c.name}</span>
              <span>
                ⚔️{c.attack || '-'} ❤️{c.hpBonus >= 0 ? '+' : ''}{c.hpBonus} 🔌{c.cost}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
