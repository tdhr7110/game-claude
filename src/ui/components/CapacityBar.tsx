interface CapacityBarProps {
  used: number;
  total: number;
  compact?: boolean;
}

export function CapacityBar({ used, total, compact }: CapacityBarProps) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const free = total - used;
  const over = used > total;
  const warn = !over && free <= 1;
  const fillClass = over ? ' capacity-bar__fill--over' : warn ? ' capacity-bar__fill--warn' : '';
  return (
    <div
      className={`capacity-bar${compact ? ' capacity-bar--compact' : ''}`}
      title="部位の装着にはコストがかかります。合計が接続容量を超えると装着できません"
    >
      <div className="capacity-bar__label">
        🔗 接続容量 <b>{used}</b> / {total}
        {over && <span className="danger-text">（超過）</span>}
        {warn && <span className="muted"> 残り{Math.max(0, free)}</span>}
      </div>
      <div className="capacity-bar__track">
        <div className={`capacity-bar__fill${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
