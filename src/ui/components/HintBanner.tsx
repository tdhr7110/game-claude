import { useGame } from '../GameContext';
import { HINTS } from '../../data/hints';

// 場面別ワンポイントヒント: 常時表示の説明画面ではなく、該当場面に到達した
// 最初の1回だけ画面上部に1メッセージだけ表示する軽量なバナー。
export function HintBanner() {
  const { activeHint, dismissHint } = useGame();
  if (!activeHint) return null;
  const hint = HINTS[activeHint];

  return (
    <div className="hint-banner" role="status">
      <span className="hint-banner__icon">{hint.icon}</span>
      <span className="hint-banner__text">{hint.text}</span>
      <button className="hint-banner__close" onClick={dismissHint} aria-label="ヒントを閉じる">
        ✕
      </button>
    </div>
  );
}
