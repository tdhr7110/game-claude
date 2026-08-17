import { useState } from 'react';
import { useGame } from '../GameContext';
import { getPartDef } from '../../engine/adminStore';
import { PartDetailPanel } from './PartDetailPanel';
import { PartCard } from './PartCard';
import { SynergyPanel } from './SynergyPanel';
import { computeActiveSynergies } from '../../engine/synergyEngine';
import { computeBonusHp, computeModifiers } from '../../engine/modifiers';
import { computeCapacity } from '../../engine/capacity';
import { BASE_CAPACITY, CORE_HP_BASE } from '../../engine/run';

interface ChimeraGalleryModalProps {
  onClose: () => void;
}

type DetailView = { kind: 'part'; partId: string } | { kind: 'build'; chimeraId: string } | null;

export function ChimeraGalleryModal({ onClose }: ChimeraGalleryModalProps) {
  const { chimeraGallery } = useGame();
  const [view, setView] = useState<DetailView>(null);

  const selectedDef = view?.kind === 'part' ? getPartDef(view.partId) : null;
  const selectedChimera = view?.kind === 'build' ? chimeraGallery.find((c) => c.id === view.chimeraId) ?? null : null;

  const buildOverview = (() => {
    if (!selectedChimera) return null;
    const defs = selectedChimera.partIds.map((id) => getPartDef(id));
    const equipped = defs.map((def, i) => ({ instanceId: `gallery_${i}`, def }));
    const synergies = computeActiveSynergies(defs);
    const mods = computeModifiers(defs, synergies);
    const capacity = computeCapacity(equipped, BASE_CAPACITY, selectedChimera.permanentCapacityBonus);
    const maxHp = CORE_HP_BASE + computeBonusHp(defs);
    return { defs, capacity, synergies, critPct: Math.round(mods.critChance * 100), maxHp };
  })();

  return (
    <div className="intro-overlay" onClick={onClose}>
      <div className="intro-card gallery-card" onClick={(e) => e.stopPropagation()}>
        <div className="intro-card__title">🏛️ キメラ図鑑（{chimeraGallery.length}体）</div>
        {chimeraGallery.length === 0 ? (
          <p className="muted gallery-empty">
            まだ記録されたキメラはいません。ランの決着後（勝利・敗北時）に名前をつけると、ここに記録されます。
          </p>
        ) : (
          <div className="gallery-list">
            {chimeraGallery.map((c) => (
              <div key={c.id} className="gallery-entry">
                <div className="gallery-entry__icons">
                  {c.partIds.length > 0 ? (
                    c.partIds.slice(0, 12).map((partId, i) => (
                      <button
                        key={`${partId}-${i}`}
                        type="button"
                        className={`gallery-entry__icon-btn${view?.kind === 'part' && view.partId === partId ? ' gallery-entry__icon-btn--selected' : ''}`}
                        title={`${getPartDef(partId).name}の詳細を見る`}
                        onClick={() => setView({ kind: 'part', partId })}
                      >
                        {c.icons[i] ?? getPartDef(partId).icon}
                      </button>
                    ))
                  ) : c.icons.length > 0 ? (
                    // 旧バージョンで記録された図鑑データ（partIdsを持たない）は詳細を見られない
                    c.icons.slice(0, 12).map((icon, i) => (
                      <span key={i} className="gallery-entry__icon">
                        {icon}
                      </span>
                    ))
                  ) : (
                    <span className="gallery-entry__icon">🫀</span>
                  )}
                </div>
                <div className="gallery-entry__info">
                  <div className="gallery-entry__name">
                    {c.outcome === 'victory' ? '🏆' : '💀'} {c.name}
                  </div>
                  <div className="muted gallery-entry__sub">
                    {c.outcome === 'victory' ? 'ラン勝利' : `第${c.battleReached}戦で敗北`} ・ 部位{c.icons.length}個
                  </div>
                </div>
                {c.partIds.length > 0 && (
                  <button
                    type="button"
                    className={`btn btn--small gallery-entry__build-btn${view?.kind === 'build' && view.chimeraId === c.id ? ' btn--primary' : ' btn--ghost'}`}
                    onClick={() => setView({ kind: 'build', chimeraId: c.id })}
                  >
                    🧬 ビルド全体
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {selectedDef && (
          <div className="gallery-detail">
            <PartDetailPanel def={selectedDef} />
          </div>
        )}
        {buildOverview && selectedChimera && (
          <div className="gallery-detail gallery-build">
            <div className="gallery-build__header">
              <div className="gallery-build__title">
                🧬 {selectedChimera.name} のビルド（{selectedChimera.outcome === 'victory' ? 'ラン勝利' : `第${selectedChimera.battleReached}戦で敗北`}）
              </div>
              <div className="muted gallery-build__stats">
                ❤️ 最大HP {buildOverview.maxHp} ・ 🔌 接続容量 {buildOverview.capacity.used}/{buildOverview.capacity.total} ・ 部位
                {buildOverview.defs.length}個
              </div>
            </div>
            <div className="part-grid">
              {buildOverview.defs.map((def, i) => (
                <PartCard key={`${def.id}-${i}`} def={def} cost={buildOverview.capacity.instanceCosts[`gallery_${i}`]} compact />
              ))}
            </div>
            <SynergyPanel synergies={buildOverview.synergies} critChancePct={buildOverview.critPct} />
          </div>
        )}
        <button className="btn btn--primary btn--large" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
