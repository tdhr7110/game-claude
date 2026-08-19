import type { PartDef } from '../../data/types';
import { RARITY_COLORS, SPECIES_ICONS, TAG_ICONS, TYPE_ICONS, rarityLabel, typeLabel } from '../format';

interface PartCardProps {
  def: PartDef;
  cost?: number; // 実効接続コスト（上書き表示用）
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  badge?: string;
  onClick?: () => void;
}

// 本番版UI(TEST4)のデザインを移植したもの。本番版は将来のイラスト差し替え用に
// def.image を持つが、TEST5の部位データにはこのフィールドが無いため常にアイコン表示とする。
export function PartCard({ def, cost, selected, disabled, compact, badge, onClick }: PartCardProps) {
  const effectiveCost = cost ?? def.cost;
  return (
    <button
      type="button"
      className={`part-card part-card--rarity-${def.rarity}${selected ? ' part-card--selected' : ''}${disabled ? ' part-card--disabled' : ''}${compact ? ' part-card--compact' : ''}`}
      onClick={onClick}
      title={`${def.name}\n${def.description}`}
    >
      {badge && <span className="part-card__badge">{badge}</span>}
      <span className="part-card__rarity-tag" style={{ color: RARITY_COLORS[def.rarity] }}>
        {rarityLabel(def.rarity)}
      </span>
      <div className="part-card__icon" style={{ color: def.color }}>
        {def.icon}
      </div>
      <div className="part-card__name">{def.name}</div>
      <div className="part-card__meta">
        <span className="chip">
          {TYPE_ICONS[def.type]} {typeLabel(def.type)}
        </span>
        <span className="chip">{SPECIES_ICONS[def.species]}</span>
      </div>
      <div className="part-card__stats">
        <span title="接続コスト">🔌{effectiveCost}</span>
        {def.hpBonus !== 0 && <span title="HP補正">❤️{def.hpBonus > 0 ? '+' : ''}{def.hpBonus}</span>}
        {def.attack > 0 && <span title="攻撃力/間隔">⚔️{def.attack}/{def.interval}s</span>}
      </div>
      {def.tags.length > 0 && (
        <div className="part-card__tags">
          {def.tags.map((t) => (
            <span key={t} className="tag-icon" title={t}>
              {TAG_ICONS[t]}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
