// TEST11: 実戦闘中のキャラクター表示を、自由合体レイヤーの画像合成方式に置き換えるラッパー。
// 見た目の描画方式を差し替えるだけで、戦闘ロジック・能力計算・部位効果には一切触れない。
// 素材の読み込みが完了するまでは既存のBattleFigureと同じ「絵文字の丸」で一瞬だけ表示し、
// 崩れた見た目にならないようにする。
import type { PartType } from '../../data/types';
import { useLayerAssets } from './useLayerAssets';
import { FreeLayerFigure } from './FreeLayerFigure';
import { layerCountsFromPartTypeCounts } from './freeLayerFromParts';

export interface BattleChimeraFigureProps {
  side: 'player' | 'enemy';
  bodyColor: string;
  bodyIcon: string;
  partTypeCounts: Record<PartType, number>;
  isDead: boolean;
  rampageActive: boolean;
  guardActive: boolean;
  reflectActive: boolean;
  synergyGlow: 'poison' | 'fire' | 'defense' | null;
}

export function BattleChimeraFigure({ side, bodyColor, bodyIcon, partTypeCounts, isDead, rampageActive, guardActive, reflectActive, synergyGlow }: BattleChimeraFigureProps) {
  const { manifest, layouts } = useLayerAssets();

  const classes = [
    'battle-chimera-figure',
    `battle-chimera-figure--${side}`,
    isDead && 'battle-chimera-figure--dead',
    rampageActive && 'battle-chimera-figure--rampage',
    synergyGlow && `battle-chimera-figure--glow-${synergyGlow}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {manifest && layouts ? (
        <FreeLayerFigure manifest={manifest} layouts={layouts} counts={layerCountsFromPartTypeCounts(partTypeCounts)} />
      ) : (
        <div
          className="battle-chimera-figure__loading"
          style={{ width: '100%', height: '100%', borderRadius: '50%', background: bodyColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2em' }}
          aria-hidden
        >
          {bodyIcon}
        </div>
      )}
      {(guardActive || reflectActive) && <div className={`battle-chimera-figure__shield${reflectActive ? ' battle-chimera-figure__shield--reflect' : ''}`} aria-hidden />}
    </div>
  );
}
