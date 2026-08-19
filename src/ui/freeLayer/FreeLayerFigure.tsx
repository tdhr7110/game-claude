// 自由合体レイヤー表示: 装着部位を透明PNGレイヤーとしてコア(素体)の周りに合成するコンポーネント。
// 図鑑(ChimeraGalleryPanel)・戦闘画面(BattleChimeraFigure)の両方から同じものを使う。
// 戦闘ロジック・能力計算には一切関与しない、見た目専用の表示。
import { useState } from 'react';
import type { CSSProperties } from 'react';
import './freeLayerCanvas.css';
import { CHIMERA_LAYERS_BASE } from './useLayerAssets';
import { computeLayerStyle, resolveChimeraLayers, resolveChimeraLayersWithoutAutoLayout } from './layoutMath';
import { CATEGORY_PROFILES } from './categoryProfiles';
import { DRAW_GROUP_Z_BASE } from './drawOrder';
import type { EquippedPartRef, LayerAsset, LayerManifest } from './types';

// 画像読み込み失敗時・部位に画像が未登録の時のフォールバック絵文字(カテゴリごと)。
// 素材が本番配信で欠落していても、また大量装着で一部の画像取得が失敗しても、
// キャラクター表示自体は崩れず、既存アイコン相当の見た目に自然に落ちる。
const CATEGORY_FALLBACK_ICON: Record<string, string> = {
  base: '🧬',
  arm: '💪',
  wing: '🪽',
  horn: '🦌',
  tail: '🦂',
  leg: '🦵',
  back: '✨',
  face: '😈',
  armor: '🛡️',
  organ: '🫀',
  eye: '👁️',
};

export interface FreeLayerFigureProps {
  manifest: LayerManifest;
  parts: EquippedPartRef[];
  autoLayout?: boolean;
  showAnchorDebug?: boolean;
  className?: string;
}

function LayerImage({
  asset,
  fallbackIcon,
  style,
}: {
  asset: LayerAsset | null;
  fallbackIcon: string;
  style: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (!asset || failed) {
    return (
      <div className="free-layer__fallback" style={style} aria-hidden>
        {fallbackIcon}
      </div>
    );
  }
  return (
    <img
      src={`${CHIMERA_LAYERS_BASE}${asset.file}`}
      alt=""
      aria-hidden
      draggable={false}
      className="free-layer__img"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}

export function FreeLayerFigure({ manifest, parts, autoLayout = true, showAnchorDebug = false, className }: FreeLayerFigureProps) {
  const canvasSize = manifest.canvas.width;
  const base = manifest.assets.find((a) => a.id === 'base-core');

  const { layers, overflow } = autoLayout ? resolveChimeraLayers(parts, manifest) : resolveChimeraLayersWithoutAutoLayout(parts, manifest);

  return (
    <div className={`free-layer-canvas${className ? ` ${className}` : ''}`}>
      {base &&
        (() => {
          const s = computeLayerStyle({ x: canvasSize / 2, y: canvasSize / 2 }, base.pivot, base.defaultScale, canvasSize);
          return (
            <LayerImage
              asset={base}
              fallbackIcon={CATEGORY_FALLBACK_ICON.base}
              style={{ left: `${s.leftPct}%`, top: `${s.topPct}%`, width: `${s.sizePct}%`, height: `${s.sizePct}%`, zIndex: DRAW_GROUP_Z_BASE.torso }}
            />
          );
        })()}
      {layers.map((l) => (
        <LayerImage
          key={l.key}
          asset={l.asset}
          fallbackIcon={CATEGORY_FALLBACK_ICON[l.category] ?? '❓'}
          style={{
            left: `${l.style.leftPct}%`,
            top: `${l.style.topPct}%`,
            width: `${l.style.sizePct}%`,
            height: `${l.style.sizePct}%`,
            zIndex: l.z,
            transformOrigin: `${l.style.originXPct}% ${l.style.originYPct}%`,
            transform: `${l.mirror ? 'scaleX(-1) ' : ''}rotate(${l.rotationDeg}deg)`,
            filter: `brightness(${l.brightness})`,
          }}
        />
      ))}
      {showAnchorDebug && <AnchorDebugOverlay layers={layers} canvasSize={canvasSize} />}
      {overflow.length > 0 && (
        <div className="free-layer-canvas__badges">
          {overflow.map((o) => (
            <span key={o.category} className="free-layer-canvas__badge">
              {CATEGORY_FALLBACK_ICON[o.category] ?? ''}×{o.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AnchorDebugOverlay({ layers, canvasSize }: { layers: ReturnType<typeof resolveChimeraLayers>['layers']; canvasSize: number }) {
  // 実際に今のレイヤーが解決された接続位置(anchor = left + pivot*scale)をドットで可視化する。
  // カテゴリごとの基準点(profile.pivot)も併せて薄く表示し、検証しやすくする。
  return (
    <div className="free-layer-canvas__debug" aria-hidden>
      {layers.map((l) => (
        <span
          key={l.key}
          className="free-layer-canvas__debug-dot"
          style={{
            left: `${l.style.leftPct + (l.style.originXPct * l.style.sizePct) / 100}%`,
            top: `${l.style.topPct + (l.style.originYPct * l.style.sizePct) / 100}%`,
          }}
          title={`${l.category}:${l.key}`}
        />
      ))}
      {Object.values(CATEGORY_PROFILES).map((p) => (
        <span
          key={`pivot-${p.category}`}
          className="free-layer-canvas__debug-dot free-layer-canvas__debug-dot--pivot"
          style={{ left: `${(p.pivot.x / canvasSize) * 100}%`, top: `${(p.pivot.y / canvasSize) * 100}%` }}
          title={`${p.category} pivot`}
        />
      ))}
    </div>
  );
}
