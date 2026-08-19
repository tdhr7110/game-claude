import { CORE_DEFS, type CoreDef } from '../../data/cores';
import { useGame } from '../GameContext';

export function CoreSelectScreen() {
  const { goToTitle, confirmCore } = useGame();

  return (
    <div className="screen core-select-screen">
      <header className="screen__header">
        <button className="btn btn--small btn--ghost" onClick={goToTitle}>
          ◀ 戻る
        </button>
        <h1>初期コアを選ぼう</h1>
        <span style={{ width: 30 }} />
      </header>
      <p className="core-select-screen__lead muted">最初のキメラの方向性を決めます。どれを選んでも後から部位を集めて自由に育てられます。</p>

      <div className="core-select-list">
        {CORE_DEFS.map((core) => (
          <CoreCard key={core.id} core={core} onSelect={() => confirmCore(core.id)} />
        ))}
      </div>
    </div>
  );
}

function CoreCard({ core, onSelect }: { core: CoreDef; onSelect: () => void }) {
  return (
    <button
      className="core-card"
      style={{ ['--core-accent' as string]: core.accentColor }}
      onClick={onSelect}
    >
      <div className="core-card__head">
        <span className="core-card__icon">{core.icon}</span>
        <div className="core-card__title">
          <div className="core-card__name">
            {core.colorName}：{core.name}
          </div>
          <div className="core-card__tagline">{core.tagline}</div>
        </div>
      </div>
      <p className="core-card__desc">{core.description}</p>
      <div className="core-card__strengths">
        {core.strengths.map((s) => (
          <span key={s} className="chip core-card__chip">
            {s}
          </span>
        ))}
      </div>
      <ul className="core-card__preview">
        {core.abilityPreview.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="core-card__cta">このコアで始める ▶</div>
    </button>
  );
}
