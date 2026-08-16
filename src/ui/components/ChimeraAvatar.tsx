import type { PartDef, PartType } from '../../data/types';

interface ChimeraAvatarProps {
  defs: PartDef[];
  size?: 'sm' | 'md';
}

const MAX_ICONS_PER_ZONE = 6;

function groupByType(defs: PartDef[]): Record<PartType, PartDef[]> {
  const byType: Record<PartType, PartDef[]> = { arm: [], head: [], heart: [], leg: [], skin: [] };
  for (const d of defs) byType[d.type].push(d);
  return byType;
}

function Zone({ type, list }: { type: PartType; list: PartDef[] }) {
  if (list.length === 0) return <div className={`chimera-avatar__zone chimera-avatar__zone--${type} chimera-avatar__zone--empty`} />;
  const shown = list.slice(0, MAX_ICONS_PER_ZONE);
  const extra = list.length - shown.length;
  return (
    <div className={`chimera-avatar__zone chimera-avatar__zone--${type}`}>
      {shown.map((d, i) => (
        <span key={`${d.id}-${i}`} className="chimera-avatar__icon" title={d.name}>
          {d.icon}
        </span>
      ))}
      {extra > 0 && <span className="chimera-avatar__more">+{extra}</span>}
    </div>
  );
}

// 装着中の部位アイコンを部位種類ごとに集めて配置し、「寄せ集めのキメラ」らしい見た目を作る。
// 画像素材は使わず、絵文字のクラスタ配置だけで表現する。
export function ChimeraAvatar({ defs, size = 'md' }: ChimeraAvatarProps) {
  const byType = groupByType(defs);
  const hasAny = defs.length > 0;

  return (
    <div className={`chimera-avatar chimera-avatar--${size}`}>
      {hasAny ? (
        <>
          <Zone type="head" list={byType.head} />
          <div className="chimera-avatar__row">
            <Zone type="arm" list={byType.arm} />
            <Zone type="heart" list={byType.heart} />
            <Zone type="skin" list={byType.skin} />
          </div>
          <Zone type="leg" list={byType.leg} />
        </>
      ) : (
        <div className="chimera-avatar__core-only" title="人造核（部位未装着）">
          🫀
        </div>
      )}
    </div>
  );
}

