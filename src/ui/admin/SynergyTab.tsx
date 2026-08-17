import { useState } from 'react';
import { getPartTypeSynergies, getSpeciesSynergies, patchSynergyTier } from '../../engine/adminStore';
import { PART_TYPE_LABELS, SPECIES_LABELS, type PartType, type Species } from '../../data/types';

// 「腕6本以上なら攻撃速度+30%」のような部位数条件は、既存のシナジー閾値テーブル
// (PART_TYPE_SYNERGIES / SPECIES_SYNERGIES) がまさにそれを表現する仕組みとして既に存在するため、
// 新しいCondition評価エンジンを作らず、既存のシナジー閾値・数値を管理画面から調整できるようにする。
// 「HP50%以下」「毒状態の敵」のような戦闘中の動的な条件は、既存エンジンが対応していないため
// 今回のUIでは扱えない（要件34の報告で明記する）。
export function SynergyTab() {
  const [, tick] = useState(0);
  const partTypeSynergies = getPartTypeSynergies();
  const speciesSynergies = getSpeciesSynergies();

  return (
    <div className="admin-synergy-tab">
      <p className="muted">
        「腕が6本以上」のような部位数条件は、既存のシナジー閾値テーブルをそのまま管理画面から編集する形で対応しています。
        閾値（何個で発動するか）と効果の主要数値を調整できます。「HP50%以下」「毒状態の敵」のような戦闘中の動的な条件は、
        既存の戦闘エンジンが未対応のため今回は編集対象外です（Claudeによる追加実装が必要な範囲）。
      </p>

      <h2>部位数シナジー（Condition: 部位種類の装着数）</h2>
      {(Object.keys(partTypeSynergies) as PartType[]).map((t) => (
        <div key={t} className="admin-synergy-group">
          <div className="admin-synergy-group__title">{PART_TYPE_LABELS[t]}</div>
          {partTypeSynergies[t].map((tier, i) => (
            <TierRow
              key={i}
              tier={tier}
              onSave={(count, effectPatch) => {
                patchSynergyTier('partType', t, i, { count, effectPatch });
                tick((n) => n + 1);
              }}
            />
          ))}
        </div>
      ))}

      <h2>種族シナジー（Condition: 特定種族の装着数）</h2>
      {(Object.keys(speciesSynergies) as Exclude<Species, 'none'>[]).map((s) => (
        <div key={s} className="admin-synergy-group">
          <div className="admin-synergy-group__title">{SPECIES_LABELS[s]}</div>
          {speciesSynergies[s].map((tier, i) => (
            <TierRow
              key={i}
              tier={tier}
              onSave={(count, effectPatch) => {
                patchSynergyTier('species', s, i, { count, effectPatch });
                tick((n) => n + 1);
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function TierRow({
  tier,
  onSave,
}: {
  tier: { count: number; description: string; effect: Record<string, unknown> };
  onSave: (count: number, effectPatch: Record<string, number>) => void;
}) {
  const [count, setCount] = useState(tier.count);
  const numericFields = Object.entries(tier.effect).filter(([k, v]) => k !== 'kind' && typeof v === 'number') as [string, number][];
  const [values, setValues] = useState<Record<string, number>>(Object.fromEntries(numericFields));

  return (
    <div className="admin-tier-row">
      <span className="muted">{tier.description}</span>
      <label>
        必要数
        <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      {numericFields.map(([key]) => (
        <label key={key}>
          {key}
          <input type="number" step={0.05} value={values[key]} onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })} />
        </label>
      ))}
      <button className="btn btn--small" onClick={() => onSave(count, values)}>
        保存
      </button>
    </div>
  );
}
