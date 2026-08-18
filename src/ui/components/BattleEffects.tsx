// TEST3フェーズ3: 戦闘演出用の表示専用コンポーネント群（ロジックは持たず、渡された配列を描画するだけ）。

export interface Floater {
  id: number;
  side: 'player' | 'enemy';
  text: string;
  kind: 'normal' | 'big' | 'fixed' | 'crit' | 'heal' | 'merged' | 'evade';
  createdAt: number;
  xPct: number; // 横方向のジッター位置(%)
}

export function FloatingNumbers({ floaters }: { floaters: Floater[] }) {
  return (
    <div className="floater-layer" aria-hidden>
      {floaters.map((f) => (
        <span key={f.id} className={`floater floater--${f.kind} floater--${f.side}`} style={{ left: `${f.xPct}%` }}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

export interface SynergyToast {
  id: number;
  label: string;
  side: 'player' | 'enemy';
}

export function SynergyToastList({ toasts }: { toasts: SynergyToast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="synergy-toast-layer" aria-hidden>
      {toasts.map((t) => (
        <div key={t.id} className={`synergy-toast synergy-toast--${t.side}`}>
          ✨ {t.label} ✨
        </div>
      ))}
    </div>
  );
}

function hitTier(count: number): 'normal' | 'big' | 'huge' | 'epic' {
  if (count >= 100) return 'epic';
  if (count >= 50) return 'huge';
  if (count >= 25) return 'big';
  return 'normal';
}

export function HitCounter({ count }: { count: number }) {
  if (count < 3) return null;
  const tier = hitTier(count);
  return (
    <div className={`hit-counter hit-counter--${tier}`}>
      <span className="hit-counter__num">{count}</span>
      <span className="hit-counter__label">HIT</span>
    </div>
  );
}
