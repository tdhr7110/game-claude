// 自由合体レイヤー表示: public/assets/chimera-layers/layer-manifest.json の型定義。
// JSONは実行時にfetchして読み込むため、ここには形だけを定義する。

export interface Vec2 {
  x: number;
  y: number;
}

export interface LayerAsset {
  id: string;
  category: string;
  file: string;
  pivot: Vec2;
  defaultScale: number;
  mirrorable: boolean;
  rotatable: boolean;
  zGroup: number;
}

export interface LayerManifest {
  version: number;
  canvas: { width: number; height: number };
  assets: LayerAsset[];
}

// 実際に装着されている部位1個分の参照。戦闘ロジック・能力計算とは無関係な
// 「見た目の解決」専用の入力で、図鑑・戦闘画面のどちらからも同じ形で渡す。
export interface EquippedPartRef {
  // 装着インスタンスごとに安定した一意なID(接続位置の並び順・見た目ジッターの種)。
  instanceId: string;
  // 部位定義ID(defId・敵の技ID等)。同じpartIdは常に同じ画像に解決される。
  partId: string;
  // レイヤー画像カテゴリ(manifestのcategoryと一致させる)。
  category: string;
}
