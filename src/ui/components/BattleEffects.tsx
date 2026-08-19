// ============================================================
// TEST8: 戦闘演出用の表示専用コンポーネント群。
// TEST4(test4/chimera-butcher-phase4)のBattleEffects.tsxを土台に、
// 現行のBattleEvent構成(engine/battle.ts)へ合わせて再実装したもの。
// CSSは既存のindex.css(.floater* / .hit-counter* / .synergy-toast*)を
// そのまま再利用し、新規クラスは最小限(OVERKILL演出のみ)に留めている。
// ロジックは持たず、BattleScreen側が管理する配列を描画するだけ。
// 同時表示数・寿命はすべて呼び出し側(BattleScreen)の上限管理に従う。
// ============================================================

export interface Floater {
  id: number;
  side: 'player' | 'enemy';
  text: string;
  kind: 'normal' | 'big' | 'fixed' | 'crit' | 'heal' | 'poison' | 'burn' | 'merged' | 'evade';
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

export interface Toast {
  id: number;
  label: string;
  icon: string;
  side: 'player' | 'enemy';
  // TEST7×TEST8統合: 'telegraph'は大技の予兆専用。他のトーストより警告色で目立たせる。
  kind: 'synergy' | 'special' | 'telegraph';
}

// シナジー発動・特殊能力発動を1つの帯として表示する(役割が近く、頻度も抑えたいため共通化)。
export function ToastList({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="synergy-toast-layer" aria-hidden>
      {toasts.map((t) => (
        <div key={t.id} className={`synergy-toast synergy-toast--${t.kind}`}>
          {t.icon} {t.label}
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

export function OverkillBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fx-overkill" aria-hidden>
      OVERKILL
    </div>
  );
}
