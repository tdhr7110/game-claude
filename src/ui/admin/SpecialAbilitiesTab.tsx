import { useState } from 'react';
import { useGame } from '../GameContext';
import { getBasePartDef, getSpecialAbilities, getSpecialAbilityCurrentParams, setSpecialAbilityParams, tryGetPartDef } from '../../engine/adminStore';
import { readSpecialAbilityParams } from '../../engine/specialAbilityHandlers';

export function SpecialAbilitiesTab() {
  const { dispatch } = useGame();
  const abilities = getSpecialAbilities();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="admin-special-tab">
      <p className="muted">
        特殊能力は「handler」というCustom Handler方式で動作します。今回登録済みの5種は、いずれも既存の汎用Effectシステムだけで表現できたため、
        「genericPartEffectParam（汎用ブリッジ）」ハンドラ経由で該当部位のEffect数値を直接書き換える形で実装しています。
        将来、既存Effectでは表現できない専用ロジックが必要な特殊能力を追加する場合は、
        <code>src/engine/specialAbilityHandlers.ts</code> に新しいhandler関数を1つ追加し、
        <code>src/data/specialAbilities.ts</code> から参照するだけで拡張できます。
      </p>
      {notice && <div className="naming-box naming-box--done">{notice}</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="admin-special-list">
        {abilities.map((ability) => {
          const part = tryGetPartDef(ability.id);
          const basePart = getBasePartDef(ability.id);
          // 現在ゲームが実際に使用している値（テスト上書き適用後）を毎回読み直す。
          const currentParams = getSpecialAbilityCurrentParams(ability.id);
          const baseParams = basePart ? readSpecialAbilityParams(basePart, ability) : null;
          return (
            <div key={ability.id} className="admin-special-card">
              <div className="admin-special-card__header">
                <span>{part?.icon ?? '🧬'}</span>
                <div>
                  <div className="admin-special-card__name">{ability.name}</div>
                  <div className="muted">
                    ID: {ability.id} ・ handler: {ability.handler} ・ Trigger: {ability.trigger}
                  </div>
                </div>
              </div>
              <p className="muted">{ability.description}</p>
              <div className="admin-special-card__tags">
                {ability.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>

              {baseParams && ability.editableParams.some((p) => baseParams[p.key] !== currentParams[p.key]) && (
                <div className="admin-diff">
                  <div className="muted">正式値との差分（変更済み）:</div>
                  {ability.editableParams
                    .filter((p) => baseParams[p.key] !== currentParams[p.key])
                    .map((p) => (
                      <div key={p.key} className="admin-diff-row">
                        {p.label}: <span className="admin-diff-before">{baseParams[p.key]}</span> →{' '}
                        <span className="admin-diff-after">{currentParams[p.key]}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* key に現在値を含めることで、他の操作（JSONインポート・リセット等）で値が変わった際に
                  フォームを作り直し、常に最新値を表示させる（保存直後も含め値が古いまま残らないようにする）。 */}
              <ParamForm
                key={JSON.stringify(currentParams)}
                abilityId={ability.id}
                params={ability.editableParams}
                initialValues={currentParams}
                onSave={(values) => {
                  const res = setSpecialAbilityParams(ability.id, values);
                  if (res.ok) {
                    setNotice(`「${ability.name}」のパラメータを更新しました`);
                    setError(null);
                  } else {
                    setError(res.error ?? '更新に失敗しました');
                    setNotice(null);
                  }
                }}
              />

              <button
                className="btn btn--small"
                onClick={() => {
                  dispatch({ type: 'DEBUG_GRANT_PART', defId: ability.id });
                  setNotice(`「${ability.name}」を持つ部位「${part?.name}」をインベントリへ付与しました`);
                }}
              >
                🧪 この能力を持つ部位をテスト取得
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParamForm({
  params,
  initialValues,
  onSave,
}: {
  abilityId: string;
  params: { key: string; label: string; type: 'number' | 'percent'; min?: number; max?: number; step?: number }[];
  initialValues: Record<string, number>;
  onSave: (values: Record<string, number>) => void;
}) {
  const [values, setValues] = useState<Record<string, number>>(initialValues);

  return (
    <div className="admin-param-form">
      {params.map((p) => (
        <label key={p.key} className="admin-field">
          {p.label}
          <input
            type="number"
            min={p.min}
            max={p.max}
            step={p.step ?? (p.type === 'percent' ? 0.01 : 1)}
            value={values[p.key] ?? 0}
            onChange={(e) => setValues({ ...values, [p.key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <button className="btn btn--small btn--primary" onClick={() => onSave(values)}>
        💾 このパラメータを保存
      </button>
    </div>
  );
}
