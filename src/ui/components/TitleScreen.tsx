// TEST18: 簡易タイトル画面。
// UIデザイン・ロゴ画像は別途制作中のため、ここでは最低限の要素(タイトル文字列 + GAME START)
// だけを用意する。後から本番デザインへ差し替えやすいよう、ロゴ領域(title-screen__logo)と
// 背景(title-screen)を分けておき、ロジック(onStart呼び出し)には一切手を入れずに済む構造にする。
interface TitleScreenProps {
  onStart: () => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="title-screen">
      <div className="title-screen__logo">
        <div className="title-screen__emblem" aria-hidden>
          🧬
        </div>
        <h1 className="title-screen__title">CHIMERA BUTCHER</h1>
        <p className="title-screen__tagline">倒した敵から部位を奪い、キメラを組み上げるオートバトル</p>
      </div>
      <button type="button" className="btn btn--primary btn--large title-screen__start" onClick={onStart}>
        GAME START
      </button>
    </div>
  );
}
