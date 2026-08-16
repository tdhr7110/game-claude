interface CapacityBarProps {
  used: number;
  total: number;
}

export function CapacityBar({ used, total }: CapacityBarProps) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const over = used > total;
  return (
    <div className="capacity-bar" title="部位の装着にはコストがかかります。合計が接続容量を超えると装着できません">
      <div className="capacity-bar__label">
        接続容量 <b>{used}</b> / {total} {over && <span className="danger-text">(超過)</span>}
      </div>
      <div className="capacity-bar__track">
        <div
          className={`capacity-bar__fill${over ? ' capacity-bar__fill--over' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
