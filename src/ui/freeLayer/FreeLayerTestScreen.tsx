// TEST11: 開発者モード専用の自由合体レイヤー表示検証画面。
// TurnBattleTestScreenと同じ方式(GameProviderの外側にオーバーレイとして重ねる、
// RunState/戦闘ロジックには一切書き込まない独立画面)で実装する。
import { useMemo, useState } from 'react';
import './freeLayer.css';
import { useGame } from '../GameContext';
import { equippedDefs } from '../../engine/run';
import { useLayerAssets } from './useLayerAssets';
import { FreeLayerFigure } from './FreeLayerFigure';

const CATEGORY_CONFIG: { key: string; label: string; max: number }[] = [
  { key: 'arm', label: '腕', max: 8 },
  { key: 'wing', label: '翼', max: 6 },
  { key: 'horn', label: '角', max: 7 },
  { key: 'tail', label: '尻尾', max: 5 },
  { key: 'leg', label: '脚', max: 6 },
];

export function FreeLayerTestScreen({ onExit }: { onExit: () => void }) {
  const { state } = useGame();
  const { manifest, layouts, error } = useLayerAssets();

  // 既存の装着部位データとの接続: 腕・脚は現在の実装備数を初期値にする
  // (翼・角・尻尾はゲーム内のPartTypeにまだ存在しないため0から開始し、スライダーで検証する)。
  const eqDefs = useMemo(() => equippedDefs(state), [state]);
  const initialCounts = useMemo(
    () => ({
      arm: eqDefs.filter((d) => d.type === 'arm').length,
      wing: 0,
      horn: 0,
      tail: 0,
      leg: eqDefs.filter((d) => d.type === 'leg').length,
    }),
    // 画面を開いた時点の装備数を初期値にするだけで、以後はスライダー操作のみで検証するため
    // eqDefsの変化には追従しない(意図的に空配列)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [autoLayout, setAutoLayout] = useState(true);
  const [showAnchorDebug, setShowAnchorDebug] = useState(false);

  const assetsByCategory = useMemo(() => {
    const map = new Map<string, NonNullable<typeof manifest>['assets']>();
    if (!manifest) return map;
    for (const asset of manifest.assets) {
      const list = map.get(asset.category);
      if (list) list.push(asset);
      else map.set(asset.category, [asset]);
    }
    return map;
  }, [manifest]);

  return (
    <div className="free-layer-screen">
      <div className="free-layer-screen__header">
        <span>🧪 TEST11: 自由合体レイヤー表示</span>
        <button className="btn btn--small" onClick={onExit}>
          閉じる
        </button>
      </div>

      {error && <div className="free-layer-screen__error">素材の読み込みに失敗しました: {error}</div>}
      {!error && !manifest && <div className="free-layer-screen__loading">読み込み中...</div>}

      {manifest && layouts && (
        <>
          <div className="free-layer-screen__stage">
            <FreeLayerFigure
              manifest={manifest}
              layouts={layouts}
              counts={counts}
              variants={variants}
              autoLayout={autoLayout}
              showAnchorDebug={showAnchorDebug}
            />
          </div>

          <div className="free-layer-screen__controls">
            {CATEGORY_CONFIG.map(({ key, label, max }) => {
              const options = assetsByCategory.get(key) ?? [];
              return (
                <div key={key} className="free-layer-screen__row">
                  <label className="free-layer-screen__slider-label">
                    {label}: {counts[key] ?? 0}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={max}
                    value={counts[key] ?? 0}
                    onChange={(e) => setCounts((c) => ({ ...c, [key]: Number(e.target.value) }))}
                  />
                  {options.length > 1 && (
                    <select
                      value={variants[key] ?? options[0].id}
                      onChange={(e) => setVariants((v) => ({ ...v, [key]: e.target.value }))}
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            <div className="free-layer-screen__row">
              <label>
                <input type="checkbox" checked={autoLayout} onChange={(e) => setAutoLayout(e.target.checked)} /> 自動配置(扇状)
              </label>
              <label>
                <input type="checkbox" checked={showAnchorDebug} onChange={(e) => setShowAnchorDebug(e.target.checked)} /> 接続点・pivot表示
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
