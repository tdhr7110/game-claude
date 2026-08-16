import { useGame } from '../GameContext';

interface ChimeraGalleryModalProps {
  onClose: () => void;
}

export function ChimeraGalleryModal({ onClose }: ChimeraGalleryModalProps) {
  const { chimeraGallery } = useGame();

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
                  {c.icons.length > 0 ? (
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
        <button className="btn btn--primary btn--large" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
