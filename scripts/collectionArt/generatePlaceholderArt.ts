// ============================================================
// TEST15スコープ用の「代表部位・代表敵」プレースホルダー画像を生成する開発用スクリプト。
//
// 要件「この段階では全画像を一気に制作せず、代表部位をカテゴリごとに数点実装し、
// 制作規格とゲーム内表示を確定する」を満たすため、実際の1枚絵の代わりに
// public/assets/collection-art/README.md の規格(256x256 RGBA透過・安全領域8px・
// 中心配置)を満たす簡易図形アイコンを部位/敵の色(def.color)から自動生成する。
// 本物のイラストに差し替える際は、同じファイル名のPNGを上書きするだけでよい。
//
// 実行: npx tsx scripts/collectionArt/generatePlaceholderArt.ts
// ============================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { getPartDef } from '../../src/data/parts';
import { ENEMY_CATALOG_BY_ID } from '../../src/data/enemyCatalog';
import type { PartType } from '../../src/data/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const ART_ROOT = join(REPO_ROOT, 'public', 'assets', 'collection-art');

const SIZE = 256;
const CENTER = SIZE / 2;

// カテゴリ(種族)ごとに数点ずつ選んだ代表部位。部位種類(arm/head/heart/leg/skin)も
// できるだけ散らし、ゲーム内表示の確認に必要な見た目バリエーションを確保する。
const REPRESENTATIVE_PART_IDS = [
  'weak_arm',
  'insect_sickle_arm',
  'insect_carapace',
  'golem_giant_fist',
  'golem_ancient_core',
  'dragon_claw',
  'dragon_twin_heads',
  'special_colossal_heart',
];

const REPRESENTATIVE_ENEMY_IDS = ['poison_spider', 'insect_queen', 'final_chimera'];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [148, 163, 184];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function setPixel(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) * 4;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function newCanvas(): PNG {
  const png = new PNG({ width: SIZE, height: SIZE });
  png.data.fill(0); // 全面透過で初期化
  return png;
}

// 部位種類ごとに輪郭の形を変える(円/楕円/菱形+簡易ノッチ)。いずれも安全領域(8px余白)内に
// 収まる半径・中心配置にしている。
function shapeMask(type: PartType, dx: number, dy: number): boolean {
  switch (type) {
    case 'leg': {
      const rx = 82;
      const ry = 106;
      return (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
    }
    case 'skin':
      return Math.abs(dx) + Math.abs(dy) <= 106;
    case 'head': {
      if ((dx / 92) ** 2 + (dy / 92) ** 2 > 1) return false;
      return true;
    }
    case 'heart': {
      if ((dx / 90) ** 2 + (dy / 90) ** 2 > 1) return false;
      if (dy < -55 && Math.abs(dx) < 18) return false; // 上部に小さな切れ込み
      return true;
    }
    case 'arm':
    default:
      return (dx / 96) ** 2 + (dy / 96) ** 2 <= 1;
  }
}

function drawPartIcon(type: PartType, color: string): PNG {
  const png = newCanvas();
  const [r, g, b] = hexToRgb(color);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - CENTER;
      const dy = y - CENTER;
      if (shapeMask(type, dx, dy)) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        const alpha = dist > 100 ? Math.max(0, 255 - (dist - 100) * 12) : 255;
        setPixel(png, x, y, r, g, b, Math.round(alpha));
      }
    }
  }
  // 頭部は目玉のような2点をアクセントとして追加(視認性のため)
  if (type === 'head') {
    for (const ex of [-30, 30]) {
      for (let y = -12; y <= 12; y++) {
        for (let x = -12; x <= 12; x++) {
          if (x * x + y * y <= 144) setPixel(png, Math.round(CENTER + ex + x), Math.round(CENTER - 10 + y), 20, 20, 24, 230);
        }
      }
    }
  }
  return png;
}

// tier(normal/elite/boss)でサイズ・装飾を変え、同系色の敵同士でも図柄が偶然一致しないようにする
// (図鑑画像の「重複割り当て検査」が実際に機能することの確認も兼ねる)。
function drawEnemyIcon(color: string, tier: 'normal' | 'elite' | 'boss'): PNG {
  const png = newCanvas();
  const [r, g, b] = hexToRgb(color);
  const outerR = tier === 'boss' ? 98 : tier === 'elite' ? 100 : 92;
  const innerR = tier === 'boss' ? 60 : tier === 'elite' ? 56 : 50;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= outerR) {
        const alpha = dist > outerR - 10 ? Math.max(0, 255 - (dist - (outerR - 10)) * 25) : 255;
        setPixel(png, x, y, r, g, b, Math.round(alpha));
      }
    }
  }
  // エリート・ボスは中間リングを追加(通常個体と図柄を明確に区別する)
  if (tier !== 'normal') {
    const ringR = (outerR + innerR) / 2 + 6;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - CENTER;
        const dy = y - CENTER;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(dist - ringR) <= 4) setPixel(png, x, y, 255, 255, 255, 200);
      }
    }
  }
  // ボスのみ、四方に短い突起(トゲ)を追加する
  if (tier === 'boss') {
    for (const [dx0, dy0] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      for (let t = outerR; t < outerR + 14; t++) {
        for (let w = -6; w <= 6; w++) {
          const x = Math.round(CENTER + dx0 * t + dy0 * w);
          const y = Math.round(CENTER + dy0 * t + dx0 * w);
          const fade = Math.max(0, 255 - (t - outerR) * 12);
          if (fade > 0) setPixel(png, x, y, r, g, b, fade);
        }
      }
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - CENTER;
      const dy = y - CENTER;
      if (Math.sqrt(dx * dx + dy * dy) <= innerR) setPixel(png, x, y, 20, 20, 26, 235);
    }
  }
  return png;
}

function drawSilhouette(): PNG {
  const png = newCanvas();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 100) {
        const alpha = dist > 90 ? Math.max(0, 235 - (dist - 90) * 23) : 235;
        setPixel(png, x, y, 12, 12, 16, Math.round(alpha));
      }
    }
  }
  return png;
}

function writePng(png: PNG, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
  console.log(`✏️  ${path}`);
}

function main() {
  for (const id of REPRESENTATIVE_PART_IDS) {
    const def = getPartDef(id);
    const png = drawPartIcon(def.type, def.color);
    writePng(png, join(ART_ROOT, 'parts', `${id}.png`));
  }
  for (const id of REPRESENTATIVE_ENEMY_IDS) {
    const entry = ENEMY_CATALOG_BY_ID[id];
    if (!entry) continue;
    const png = drawEnemyIcon(entry.color, entry.tier === 'boss' ? 'boss' : entry.tier === 'elite' ? 'elite' : 'normal');
    writePng(png, join(ART_ROOT, 'enemies', `${id}.png`));
  }
  writePng(drawSilhouette(), join(ART_ROOT, '_silhouette.png'));
  console.log('\n完了。npm run art:scan でマニフェストを再生成してください。');
}

main();
