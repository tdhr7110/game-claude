import { useState } from 'react';
import { useGame } from '../GameContext';
import { getPartDef } from '../../data/parts';
import { PartDetailPanel } from './PartDetailPanel';

interface ChimeraGalleryModalProps {
  onClose: () => void;
}

export function ChimeraGalleryModal({ onClose }: ChimeraGalleryModalProps) {
  const { chimeraGallery } = useGame();
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const selectedDef = selectedPartId ? getPartDef(selectedPartId) : null;

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
                        className={`gallery-entry__icon-btn${selectedPartId === partId ? ' gallery-entry__icon-btn--selected' : ''}`}
                        title={`${getPartDef(partId).name}の詳細を見る`}
                        onClick={() => setSelectedPartId(partId)}
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
              </div>
            ))}
          </div>
        )}
        {selectedDef && (
          <div className="gallery-detail">
            <PartDetailPanel def={selectedDef} />
          </div>
        )}
        <button className="btn btn--primary btn--large" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
