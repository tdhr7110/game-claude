// ============================================================
// 図鑑アイコン画像の開発用スキャン・検査スクリプト。
//
// 実行: npm run art:scan   … マニフェスト再生成 + レポート表示
//       npm run art:check  … マニフェスト再生成 + 規格違反/重複があれば非ゼロ終了(CI向け)
//
// 【唯一の正】部位ID・敵IDは src/data/parts.ts / src/data/enemyCatalog.ts から読み取るだけで、
// このスクリプト内にID一覧を書き写さない。ファイル名解決も `<id>.png` という命名規則のみに
// 従い、ID別のif分岐は書かない(public/assets/collection-art/README.md参照)。
// ============================================================

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { ALL_PARTS } from '../../src/data/parts';
import { ENEMY_CATALOG } from '../../src/data/enemyCatalog';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ART_ROOT = join(REPO_ROOT, 'public', 'assets', 'collection-art');
const PARTS_DIR = join(ART_ROOT, 'parts');
const ENEMIES_DIR = join(ART_ROOT, 'enemies');
const SILHOUETTE_FILE = join(ART_ROOT, '_silhouette.png');
const MANIFEST_OUT = join(REPO_ROOT, 'src', 'data', 'collectionArtManifest.generated.ts');

const CHECK_MODE = process.argv.includes('--check');

// --- 規格値(public/assets/collection-art/README.md と同期させること) ---
const CANVAS_SIZE = 256;
const SAFE_MARGIN = 8; // 中央240x240の安全領域(片側8px)
const ALPHA_TRANSPARENT_THRESHOLD = 10; // これ未満のalphaは「透明」とみなす
const CENTER_OFFSET_TOLERANCE_PCT = 20; // バウンディングボックス中心が画像中心から許容されるズレ(%)

type Domain = 'part' | 'enemy';

interface ArtEntry {
  id: string;
  domain: Domain;
  file: string; // ART_ROOTからの相対パス
  width: number;
  height: number;
  hash: string;
}

interface ValidationIssue {
  id: string;
  domain: Domain;
  file: string;
  reasons: string[];
}

function listPngFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png'));
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

// アルファ値が閾値を超えるピクセルのバウンディングボックスを求める。
// 図柄が全く無い(全透明)場合はnullを返す。
function alphaBoundingBox(png: PNG): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(png.width * y + x) * 4 + 3];
      if (alpha >= ALPHA_TRANSPARENT_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function cornersAreTransparent(png: PNG): boolean {
  const corners: [number, number][] = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ];
  return corners.every(([x, y]) => png.data[(png.width * y + x) * 4 + 3] === 0);
}

function validatePng(buf: Buffer): string[] {
  const reasons: string[] = [];
  let png: PNG;
  try {
    png = PNG.sync.read(buf);
  } catch (e) {
    return [`PNGとして読み込めません: ${e instanceof Error ? e.message : String(e)}`];
  }

  if (png.width !== CANVAS_SIZE || png.height !== CANVAS_SIZE) {
    reasons.push(`キャンバスサイズが${CANVAS_SIZE}x${CANVAS_SIZE}ではありません(実際: ${png.width}x${png.height})`);
    return reasons; // サイズが違うと以降の座標系チェックが無意味なのでここで打ち切る
  }

  if (!cornersAreTransparent(png)) {
    reasons.push('四隅が完全透過(alpha=0)になっていません(背景が透過していない可能性)');
  }

  const bbox = alphaBoundingBox(png);
  if (!bbox) {
    reasons.push('不透明なピクセルが見つかりません(図柄が空です)');
    return reasons;
  }

  const safeMin = SAFE_MARGIN;
  const safeMax = CANVAS_SIZE - SAFE_MARGIN - 1;
  if (bbox.minX < safeMin || bbox.minY < safeMin || bbox.maxX > safeMax || bbox.maxY > safeMax) {
    reasons.push(`図柄が安全領域(外周${SAFE_MARGIN}px余白)からはみ出しています(bbox: x${bbox.minX}-${bbox.maxX}, y${bbox.minY}-${bbox.maxY})`);
  }

  // 向き(構図)の自動検査代替: バウンディングボックス中心が画像中心から大きくズレていないか。
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const center = CANVAS_SIZE / 2;
  const offsetXPct = (Math.abs(cx - center) / center) * 100;
  const offsetYPct = (Math.abs(cy - center) / center) * 100;
  if (offsetXPct > CENTER_OFFSET_TOLERANCE_PCT || offsetYPct > CENTER_OFFSET_TOLERANCE_PCT) {
    reasons.push(`図柄の中心が画像中心から大きくズレています(向き・構図を確認してください: offsetX ${offsetXPct.toFixed(1)}%, offsetY ${offsetYPct.toFixed(1)}%)`);
  }

  const bboxW = bbox.maxX - bbox.minX + 1;
  const bboxH = bbox.maxY - bbox.minY + 1;
  const aspect = bboxW / bboxH;
  if (aspect < 0.35 || aspect > 2.8) {
    reasons.push(`図柄の縦横比が極端です(向きが誤っている可能性: ${aspect.toFixed(2)})`);
  }

  return reasons;
}

interface ScanDomainResult {
  entries: ArtEntry[];
  missing: string[]; // idはあるがファイルが無い
  unused: string[]; // ファイルはあるが対応するidが無い
  invalid: ValidationIssue[];
}

function scanDomain(domain: Domain, dir: string, knownIds: string[]): ScanDomainResult {
  const knownSet = new Set(knownIds);
  const files = listPngFiles(dir);
  const fileStems = new Set(files.map((f) => f.replace(/\.png$/i, '')));

  const entries: ArtEntry[] = [];
  const missing: string[] = [];
  const invalid: ValidationIssue[] = [];

  for (const id of knownIds) {
    const fileName = `${id}.png`;
    if (!fileStems.has(id)) {
      missing.push(id);
      continue;
    }
    const filePath = join(dir, fileName);
    const buf = readFileSync(filePath);
    const reasons = validatePng(buf);
    if (reasons.length > 0) {
      invalid.push({ id, domain, file: fileName, reasons });
      continue;
    }
    const png = PNG.sync.read(buf);
    entries.push({ id, domain, file: `${domain === 'part' ? 'parts' : 'enemies'}/${fileName}`, width: png.width, height: png.height, hash: sha256(buf) });
  }

  const unused = files.filter((f) => !knownSet.has(f.replace(/\.png$/i, ''))).sort();

  return { entries, missing, unused, invalid };
}

function checkSilhouette(): string[] {
  if (!existsSync(SILHOUETTE_FILE)) {
    return ['未発見シルエット画像(_silhouette.png)が存在しません'];
  }
  const reasons = validatePng(readFileSync(SILHOUETTE_FILE));
  return reasons.map((r) => `_silhouette.png: ${r}`);
}

function findDuplicateAssignments(entries: ArtEntry[]): { hash: string; ids: string[] }[] {
  const byHash = new Map<string, string[]>();
  for (const e of entries) {
    const key = `${e.domain}:${e.hash}`;
    const list = byHash.get(key) ?? [];
    list.push(e.id);
    byHash.set(key, list);
  }
  return Array.from(byHash.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ hash: key, ids }));
}

function writeManifest(entries: ArtEntry[]): void {
  const sorted = [...entries].sort((a, b) => (a.domain === b.domain ? a.id.localeCompare(b.id) : a.domain.localeCompare(b.domain)));
  const body = sorted
    .map((e) => `  { id: ${JSON.stringify(e.id)}, domain: ${JSON.stringify(e.domain)}, file: ${JSON.stringify(e.file)}, width: ${e.width}, height: ${e.height}, hash: ${JSON.stringify(e.hash)} },`)
    .join('\n');
  const content = `// AUTO-GENERATED by \`npm run art:scan\` (scripts/collectionArt/scanArt.ts). DO NOT EDIT BY HAND.
// 規格を満たすことを確認できた画像だけがここに載る。IDに対応するエントリが無い場合、
// src/ui/collectionArt.ts はnullを返しUI側は既存のアイコン絵文字表示へフォールバックする。

export interface CollectionArtEntry {
  id: string;
  domain: 'part' | 'enemy';
  file: string;
  width: number;
  height: number;
  hash: string;
}

export const COLLECTION_ART_ENTRIES: CollectionArtEntry[] = [
${body}
];
`;
  mkdirSync(dirname(MANIFEST_OUT), { recursive: true });
  writeFileSync(MANIFEST_OUT, content);
}

function main() {
  const partIds = ALL_PARTS.map((p) => p.id);
  const enemyIds = ENEMY_CATALOG.map((e) => e.id);

  const partsResult = scanDomain('part', PARTS_DIR, partIds);
  const enemiesResult = scanDomain('enemy', ENEMIES_DIR, enemyIds);
  const silhouetteIssues = checkSilhouette();

  const allEntries = [...partsResult.entries, ...enemiesResult.entries];
  const duplicates = findDuplicateAssignments(allEntries);

  writeManifest(allEntries);

  console.log('📖 図鑑アイコン画像スキャン結果\n');
  console.log(`✅ 登録済み(規格OK): 部位 ${partsResult.entries.length}/${partIds.length} ・ 敵 ${enemiesResult.entries.length}/${enemyIds.length}`);

  const missingTotal = partsResult.missing.length + enemiesResult.missing.length;
  console.log(`\n📋 未登録画像(art:未実装、ゲーム内はアイコン絵文字にフォールバック): ${missingTotal}件`);
  if (partsResult.missing.length > 0) console.log(`  部位: ${partsResult.missing.join(', ')}`);
  if (enemiesResult.missing.length > 0) console.log(`  敵: ${enemiesResult.missing.join(', ')}`);

  const unusedTotal = partsResult.unused.length + enemiesResult.unused.length;
  console.log(`\n🗑️  未使用画像(IDに対応しないファイル): ${unusedTotal}件`);
  if (partsResult.unused.length > 0) console.log(`  parts/: ${partsResult.unused.join(', ')}`);
  if (enemiesResult.unused.length > 0) console.log(`  enemies/: ${enemiesResult.unused.join(', ')}`);

  const invalidAll = [...partsResult.invalid, ...enemiesResult.invalid];
  console.log(`\n🚫 規格違反(マニフェストから除外): ${invalidAll.length}件`);
  for (const issue of invalidAll) {
    console.log(`  [${issue.domain}] ${issue.id} (${issue.file})`);
    for (const r of issue.reasons) console.log(`    - ${r}`);
  }

  if (silhouetteIssues.length > 0) {
    console.log(`\n⚠️  シルエット画像の問題:`);
    for (const r of silhouetteIssues) console.log(`  - ${r}`);
  }

  console.log(`\n♻️  重複割り当て(同じ画像が複数IDに割り当てられている): ${duplicates.length}件`);
  for (const d of duplicates) {
    console.log(`  - ${d.ids.join(', ')} が同一の画像を使用しています(意図しない使い回しの可能性)`);
  }

  console.log(`\n📄 マニフェスト書き出し: ${MANIFEST_OUT}`);

  if (CHECK_MODE) {
    const blocking = invalidAll.length > 0 || duplicates.length > 0 || silhouetteIssues.length > 0;
    if (blocking) {
      console.error('\n❌ art:check失敗: 規格違反・重複割り当て・シルエット未整備のいずれかがあります。');
      process.exit(1);
    }
    console.log('\n✅ art:check成功。');
  }
}

main();
