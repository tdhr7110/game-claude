// 自由合体レイヤー表示: 開発者モード専用の検証画面。
// GameProviderの外側にオーバーレイとして重ねる独立画面で、RunState/戦闘ロジックには一切書き込まない。
//
// 「最低限、以下をデバッグ画面でワンタップ再現できるようにしてください」への対応として、
// 代表的な検証シナリオ(腕8本・脚6本・頭5個・同一部位8個・全カテゴリ混在・画像未登録部位・
// 最大想定装着数)をボタン1つで再現できるようにしている。加えて、装着数を自由に調整できる
// 手動スライダーと、生成にかかった時間(性能確認用)も表示する。
import { useMemo, useState } from 'react';
import './freeLayer.css';
import { ALL_PARTS } from '../../data/parts';
import { useLayerAssets } from './useLayerAssets';
import { FreeLayerFigure } from './FreeLayerFigure';
import type { EquippedPartRef } from './types';

const CATEGORY_LABELS: Record<string, string> = {
  arm: '腕',
  leg: '脚',
  horn: '角(頭)',
  wing: '翼',
  tail: '尻尾',
  back: '背中',
  face: '顎',
  armor: '装甲',
  organ: '内臓',
  eye: '目',
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

function partsOfType(type: string): string[] {
  return ALL_PARTS.filter((p) => p.type === type).map((p) => p.id);
}

function makeInstances(category: string, partIds: string[], count: number, tag: string): EquippedPartRef[] {
  return Array.from({ length: count }, (_, i) => ({
    instanceId: `${tag}-${category}-${String(i).padStart(3, '0')}`,
    partId: partIds[i % partIds.length],
    category,
  }));
}

interface Scenario {
  key: string;
  label: string;
  build: () => EquippedPartRef[];
  note: string;
}

const ARM_IDS = partsOfType('arm');
const LEG_IDS = partsOfType('leg');
const HEAD_IDS = partsOfType('head');

const SCENARIOS: Scenario[] = [
  { key: 'arms8', label: '腕8本', note: '実在する腕部位IDを巡回して8本装着', build: () => makeInstances('arm', ARM_IDS, 8, 'arms8') },
  { key: 'legs6', label: '脚6本', note: '実在する脚部位IDを巡回して6本装着', build: () => makeInstances('leg', LEG_IDS, 6, 'legs6') },
  { key: 'heads5', label: '頭5個', note: '実在する頭部位5種すべてを装着(horn枠)', build: () => makeInstances('horn', HEAD_IDS, 5, 'heads5') },
  {
    key: 'sameSame8',
    label: '同一部位8個',
    note: '全く同じ部位ID(weak_arm)を8個装着。画像は同じでも接続位置・角度・縮尺・明度で重複感を軽減できているか確認',
    build: () => makeInstances('arm', ['weak_arm'], 8, 'samesame8'),
  },
  {
    key: 'allCategories',
    label: '全カテゴリ混在',
    note: '10カテゴリすべてに1〜3個ずつ装着(描画順・重なりの総合確認)',
    build: () => {
      const parts: EquippedPartRef[] = [];
      let i = 0;
      for (const category of CATEGORY_KEYS) {
        const n = (i % 3) + 1;
        parts.push(...makeInstances(category, [`mix-${category}`, `mix-${category}-b`], n, 'allcat'));
        i++;
      }
      return parts;
    },
  },
  {
    key: 'unregistered',
    label: '画像未登録部位',
    note: 'manifestに存在しないカテゴリ(未実装の新部位を想定)。フォールバックアイコン表示になることを確認',
    build: () => [
      ...makeInstances('unregistered-future-part', ['debug_unregistered'], 3, 'unreg'),
      ...makeInstances('arm', ['weak_arm'], 2, 'unreg-mix'),
    ],
  },
  {
    key: 'maxAssumed',
    label: '最大想定装着数',
    note: '接続容量の伸び(永続ボーナス・特殊部位)を踏まえた想定上限規模(合計32個)での性能確認',
    build: () => [
      ...makeInstances('arm', ARM_IDS, 10, 'max'),
      ...makeInstances('leg', LEG_IDS, 8, 'max'),
      ...makeInstances('horn', HEAD_IDS, 6, 'max'),
      ...makeInstances('organ', ['insect_poison_gland', 'golem_mana_furnace', 'dragon_heart'], 8, 'max'),
    ],
  },
  { key: 'empty', label: '素体のみ', note: '部位0個。コアだけが表示されることを確認', build: () => [] },
];

export function FreeLayerTestScreen({ onExit }: { onExit: () => void }) {
  const { manifest, error } = useLayerAssets();
  const [parts, setParts] = useState<EquippedPartRef[]>([]);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [autoLayout, setAutoLayout] = useState(true);
  const [showAnchorDebug, setShowAnchorDebug] = useState(false);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [manualCounts, setManualCounts] = useState<Record<string, number>>({});

  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  function runScenario(s: Scenario) {
    const t0 = performance.now();
    const next = s.build();
    setParts(next);
    setActiveScenario(s.key);
    setManualCounts({});
    requestAnimationFrame(() => setRenderMs(performance.now() - t0));
  }

  function applyManual(counts: Record<string, number>) {
    const t0 = performance.now();
    const next: EquippedPartRef[] = [];
    for (const category of CATEGORY_KEYS) {
      const n = counts[category] ?? 0;
      if (n <= 0) continue;
      next.push(...makeInstances(category, [`manual-${category}`, `manual-${category}-b`], n, 'manual'));
    }
    setParts(next);
    setActiveScenario(null);
    setManualCounts(counts);
    requestAnimationFrame(() => setRenderMs(performance.now() - t0));
  }

  const totalCount = parts.length;

  return (
    <div className="free-layer-screen">
      <div className="free-layer-screen__header">
        <span>🧪 自由合体レイヤー表示 検証画面</span>
        <button className="btn btn--small" onClick={onExit}>
          閉じる
        </button>
      </div>

      {error && <div className="free-layer-screen__error">素材の読み込みに失敗しました: {error}(フォールバック表示を確認できます)</div>}
      {!error && !manifest && <div className="free-layer-screen__loading">読み込み中...</div>}

      {manifest && (
        <>
          <div className="free-layer-screen__stage">
            <FreeLayerFigure manifest={manifest} parts={parts} autoLayout={autoLayout} showAnchorDebug={showAnchorDebug} />
          </div>

          <div className="free-layer-screen__controls">
            <div className="free-layer-screen__meta muted">
              装着合計: {totalCount}個 {renderMs !== null && `・生成時間: ${renderMs.toFixed(2)}ms`} ・ prefers-reduced-motion:{' '}
              {prefersReducedMotion ? '有効' : '無効'}
            </div>

            <label className="free-layer-screen__slider-label">ワンタップ検証シナリオ</label>
            <div className="free-layer-screen__row" style={{ flexWrap: 'wrap' }}>
              {SCENARIOS.map((s) => (
                <button
                  key={s.key}
                  className={`btn btn--small${activeScenario === s.key ? ' btn--primary' : ''}`}
                  title={s.note}
                  onClick={() => runScenario(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {activeScenario && <div className="free-layer-screen__note muted">{SCENARIOS.find((s) => s.key === activeScenario)?.note}</div>}

            <label className="free-layer-screen__slider-label">手動調整(カテゴリ別 0〜12)</label>
            {CATEGORY_KEYS.map((category) => (
              <div key={category} className="free-layer-screen__row">
                <label className="free-layer-screen__slider-label">
                  {CATEGORY_LABELS[category]}: {manualCounts[category] ?? 0}
                </label>
                <input
                  type="range"
                  min={0}
                  max={12}
                  value={manualCounts[category] ?? 0}
                  onChange={(e) => applyManual({ ...manualCounts, [category]: Number(e.target.value) })}
                />
              </div>
            ))}

            <div className="free-layer-screen__row">
              <label>
                <input type="checkbox" checked={autoLayout} onChange={(e) => setAutoLayout(e.target.checked)} /> 動的分散配置 ON/OFF(比較用)
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
