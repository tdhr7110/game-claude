// 自由合体レイヤー表示: layer-manifest.json をpublic/assets/chimera-layers/から取得する。
// import.meta.env.BASE_URLを使うことで、GitHub Pagesのサブパス配信(/game-claude/test11/等)でも
// 相対的に正しいURLになる。素材はfetchでそのまま参照し、複製やBase64化はしない。
import { useEffect, useState } from 'react';
import type { LayerManifest } from './types';

export const CHIMERA_LAYERS_BASE = `${import.meta.env.BASE_URL}assets/chimera-layers/`;

interface LayerAssetsState {
  manifest: LayerManifest | null;
  error: string | null;
}

const LOADING_STATE: LayerAssetsState = { manifest: null, error: null };
let cache: LayerAssetsState | null = null;

// 素材の取得に失敗しても(オフライン・配信不良など)ゲーム進行を止めないよう、
// ここでは例外を投げず、呼び出し側がerrorを見てフォールバック表示に切り替えられるようにする。
export function useLayerAssets(): LayerAssetsState {
  const [state, setState] = useState<LayerAssetsState>(cache ?? LOADING_STATE);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetch(`${CHIMERA_LAYERS_BASE}layer-manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<LayerManifest>;
      })
      .then((manifest) => {
        if (cancelled) return;
        cache = { manifest, error: null };
        setState(cache);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ manifest: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
