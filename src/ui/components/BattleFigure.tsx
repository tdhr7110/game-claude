import { useMemo } from 'react';
import type { PartDef, PartType, Species } from '../../data/types';
import type { CombatantSnapshot } from '../../engine/battle';

// TEST3フェーズ3: 戦闘画面専用のキャラクター表示。
// 画像素材は使わず、CSSで「本体+放射状の腕」を組み立てる低コスト実装。
// 腕の本数は実際の装備数と一致させ、攻撃イベント(pulseNonce)が来た腕だけが個別にアニメーションする。

export interface FigureArm {
  instanceId: string;
  icon: string;
}

interface BattleFigureProps {
  side: 'player' | 'enemy';
  bodyColor: string;
  bodyIcon: string;
  arms: FigureArm[];
  headCount: number;
  legCount: number;
  heartCount: number;
  skinCount: number;
  isDead: boolean;
  rampageActive: boolean; // 攻撃速度>1（暴走コマンド・狂乱ギミック共通）
  slowedActive: boolean; // 攻撃速度<1（暴走の反動）
  guardActive: boolean; // 被ダメージ軽減中（防御コマンド・防御態勢ギミック共通）
  pulses: Record<string, number>; // partInstanceId -> 発動回数（変化するたびにその腕だけ再アニメーション）
  synergyGlow: 'poison' | 'fire' | 'defense' | null;
}

const MAX_RENDERED_ARMS = 24; // 念のための表示上限（性能対策。ゲーム側の上限は別途あるため通常到達しない）

function armAngles(count: number, side: 'player' | 'enemy'): number[] {
  if (count <= 0) return [];
  // 0度=画面の上方向。プレイヤーは上(敵)へ、敵は下(プレイヤー)へ向かって腕を構える。
  const baseDeg = side === 'player' ? 180 : 0;
  if (count === 1) return [baseDeg];
  const span = Math.min(220, 60 + count * 8); // 本数が多いほど扇を広げる（20本でもある程度の重なりに収める）
  const start = baseDeg - span / 2;
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => start + step * i);
}

function ArmEl({ angleDeg, icon, pulseNonce, length }: { angleDeg: number; icon: string; pulseNonce: number; length: number }) {
  return (
    <div className="battle-figure__arm" style={{ transform: `rotate(${angleDeg}deg)` }}>
      <div key={pulseNonce} className={`battle-figure__arm-bar${pulseNonce > 0 ? ' battle-figure__arm-bar--strike' : ''}`} style={{ width: length }}>
        <span className="battle-figure__arm-tip">{icon}</span>
      </div>
    </div>
  );
}

export function BattleFigure({
  side,
  bodyColor,
  bodyIcon,
  arms,
  headCount,
  legCount,
  heartCount,
  skinCount,
  isDead,
  rampageActive,
  slowedActive,
  guardActive,
  pulses,
  synergyGlow,
}: BattleFigureProps) {
  const shownArms = arms.slice(0, MAX_RENDERED_ARMS);
  const angles = useMemo(() => armAngles(shownArms.length, side), [shownArms.length, side]);
  const armLength = shownArms.length > 12 ? 30 : shownArms.length > 6 ? 36 : 44;
  const overflowArms = arms.length - shownArms.length;

  const classes = [
    'battle-figure',
    `battle-figure--${side}`,
    isDead && 'battle-figure--dead',
    rampageActive && 'battle-figure--rampage',
    slowedActive && 'battle-figure--slowed',
    guardActive && 'battle-figure--guard',
    synergyGlow && `battle-figure--glow-${synergyGlow}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {guardActive && <div className="battle-figure__shield" aria-hidden />}
      <div className="battle-figure__arms">
        {shownArms.map((a, i) => (
          <ArmEl key={a.instanceId} angleDeg={angles[i]} icon={a.icon} pulseNonce={pulses[a.instanceId] ?? 0} length={armLength} />
        ))}
      </div>
      <div className="battle-figure__body" style={{ background: bodyColor }}>
        <span className="battle-figure__body-icon">{bodyIcon}</span>
        {heartCount > 0 && <span className="battle-figure__heart" title={`心臓・臓器×${heartCount}`}>🫀</span>}
      </div>
      {headCount > 0 && (
        <div className="battle-figure__heads" title={`頭・口・目×${headCount}`}>
          {Array.from({ length: Math.min(4, headCount) }).map((_, i) => (
            <span key={i}>👁️</span>
          ))}
        </div>
      )}
      {legCount > 0 && (
        <div className="battle-figure__legs" title={`脚・翼×${legCount}`}>
          {Array.from({ length: Math.min(6, legCount) }).map((_, i) => (
            <span key={i} className="battle-figure__leg" />
          ))}
        </div>
      )}
      {skinCount > 0 && <div className="battle-figure__skin-ring" title={`皮膚・外殻×${skinCount}`} style={{ opacity: Math.min(0.9, 0.25 + skinCount * 0.12) }} />}
      {overflowArms > 0 && <span className="battle-figure__arm-overflow">+{overflowArms}</span>}
    </div>
  );
}

const SPECIES_COLOR: Record<Species, string> = {
  insect: '#4d7c0f',
  golem: '#57534e',
  dragon: '#c2410c',
  none: '#7c3aed',
};

// プレイヤー装備の種族構成から、最も多い種族の色を本体色として採用する（低コストな見た目の差別化）。
export function dominantSpeciesColor(defs: PartDef[]): string {
  const counts: Partial<Record<Species, number>> = {};
  for (const d of defs) counts[d.species] = (counts[d.species] ?? 0) + 1;
  let best: Species = 'none';
  let bestCount = 0;
  for (const [sp, c] of Object.entries(counts)) {
    if (sp !== 'none' && c! > bestCount) {
      best = sp as Species;
      bestCount = c!;
    }
  }
  return SPECIES_COLOR[best];
}

export function groupCountByType(defs: PartDef[]): Record<PartType, number> {
  const out: Record<PartType, number> = { arm: 0, head: 0, heart: 0, leg: 0, skin: 0 };
  for (const d of defs) out[d.type] += 1;
  return out;
}

export function figureArmsFromSnapshot(snapshot: CombatantSnapshot): FigureArm[] {
  return snapshot.parts.filter((p) => p.type === 'arm').map((p) => ({ instanceId: p.instanceId, icon: p.icon }));
}
