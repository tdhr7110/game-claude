import { useGame } from '../GameContext';
import { TOTAL_BATTLES, TIER1_BATTLE_COUNT } from '../../engine/run';

export function IntroModal() {
  const { showIntro, setShowIntro } = useGame();
  if (!showIntro) return null;

  return (
    <div className="intro-overlay">
      <div className="intro-card">
        <div className="intro-card__title">🧬 キメラバトルへようこそ</div>
        <ul className="intro-card__list">
          <li>⚔️ 戦闘は完全自動。あなたは<b>部位の装着</b>だけを行う</li>
          <li>🎁 敵を倒すと部位を入手 → 装着してビルドを強化する</li>
          <li>🔗 同じ部位や種族を集めると<b>シナジー</b>が発動（例: 腕4本で攻撃速度UP、頭が多いほど会心率UP）</li>
          <li>
            ❤️ コアHPが0で敗北。全{TOTAL_BATTLES}戦（{TIER1_BATTLE_COUNT}戦目で中間ボス）の
            <b>最終ボス</b>を倒せば勝利！{TIER1_BATTLE_COUNT + 1}戦目以降は敵が明確に強くなる代わりに高レア部位が出やすい
          </li>
        </ul>
        <p className="intro-card__hint">迷ったら部位カードをタップ・クリックすると詳細が見られます。</p>
        <button className="btn btn--primary btn--large" onClick={() => setShowIntro(false)}>
          はじめる ▶
        </button>
      </div>
    </div>
  );
}
