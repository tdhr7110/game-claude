import { COLLECTION_ART_ENTRIES } from '../data/collectionArtManifest.generated';
import { baseEnemyIdForCollection } from '../data/enemyCatalog';

// ============================================================
// 図鑑アイコン画像のランタイム解決。
//
// ID→ファイル名の対応はscripts/collectionArt/scanArt.tsが生成した
// collectionArtManifest.generated.ts(=実際に規格を満たすことを確認できた画像だけ)を
// 読むだけで、ここにID別のif分岐は書かない(public/assets/collection-art/README.md参照)。
// マニフェストに無いIDはnullを返し、呼び出し側は既存のアイコン絵文字表示へ
// フォールバックする(欠損時に表示が壊れることはない)。
// ============================================================

// GitHub PagesのサブパスデプロイでもBASE_URLを使うことで相対的に正しいURLになる
// (TEST11のfreeLayer素材と同じ方針)。
const ART_BASE = `${import.meta.env.BASE_URL}assets/collection-art/`;

const URL_BY_KEY: Record<string, string> = Object.fromEntries(
  COLLECTION_ART_ENTRIES.map((e) => [`${e.domain}:${e.id}`, `${ART_BASE}${e.file}`])
);

export function getPartArtUrl(partId: string): string | null {
  return URL_BY_KEY[`part:${partId}`] ?? null;
}

// 中ボスは元の強敵個体と同じ画像を使う(baseEnemyIdForCollectionで正規化)。
export function getEnemyArtUrl(enemyId: string): string | null {
  return URL_BY_KEY[`enemy:${baseEnemyIdForCollection(enemyId)}`] ?? null;
}

// 未発見項目の共通シルエット。存在しなくても呼び出し側はimgのonErrorでアイコン絵文字へ
// フォールバックするため、ビルドが壊れることはない。
export const SILHOUETTE_ART_URL = `${ART_BASE}_silhouette.png`;
