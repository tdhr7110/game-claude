// TEST11: 自由合体レイヤー表示(src/ui/freeLayer/)の回帰テスト。
// 実行: npx tsx scripts/freeLayerTest.ts
//
// 戦闘ロジックには一切触れず、layoutMath.tsの純粋関数とpublic/assets/chimera-layers/の
// JSON素材の整合性のみを検証する(見た目の座標計算が仕様書どおりかを静的に確認する)。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLayerStyle, placeCategory } from '../src/ui/freeLayer/layoutMath.ts';
import type { AnchorLayouts, LayerManifest } from '../src/ui/freeLayer/types.ts';

let passCount = 0;
let failCount = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}
function section(title: string) {
  console.log(`\n${'='.repeat(8)} ${title} ${'='.repeat(8)}`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(repoRoot, 'public/assets/chimera-layers');
const manifest: LayerManifest = JSON.parse(readFileSync(path.join(assetsDir, 'layer-manifest.json'), 'utf-8'));
const layouts: AnchorLayouts = JSON.parse(readFileSync(path.join(assetsDir, 'anchor-layouts.json'), 'utf-8'));

// ============================================================
// 1. 素材(JSON)の整合性
// ============================================================
section('1. layer-manifest.json / anchor-layouts.json の整合性');
{
  assert(manifest.canvas.width === 256 && manifest.canvas.height === 256, 'キャンバスは256x256(仕様書どおり)');
  const base = manifest.assets.find((a) => a.id === 'base-core');
  assert(!!base && base.category === 'base', '素体(base-core)がbaseカテゴリで存在する');

  for (const asset of manifest.assets) {
    assert(asset.pivot.x >= 0 && asset.pivot.x <= 256 && asset.pivot.y >= 0 && asset.pivot.y <= 256, `${asset.id}: pivotが256x256キャンバス内`);
  }

  // 仕様書「重複表示ルール」の上限と、anchor-layouts.jsonのoverflow設定が一致していること
  const expectedLimits: Record<string, number> = { arm: 6, wing: 4, horn: 5, tail: 3, leg: 4, organ: 3 };
  for (const [category, limit] of Object.entries(expectedLimits)) {
    assert(layouts.overflow[category]?.visibleLimit === limit, `${category}の表示上限が仕様書どおり${limit}`);
    assert(layouts.layouts[category]?.length >= limit, `${category}の接続点が上限数以上用意されている`);
  }
  assert(layouts.overflow.organ?.mode === 'representative', '内臓(organ)は代表表示モード');
  assert(layouts.overflow.arm?.mode === 'badge', '腕(arm)はバッジモード');
}

// ============================================================
// 2. computeLayerStyle: 基本式(left = anchor.x - pivot.x*scale)の検証
// ============================================================
section('2. computeLayerStyle の座標計算');
{
  const s = computeLayerStyle({ x: 174, y: 96 }, { x: 43, y: 132 }, 0.58, 256);
  const expectedLeft = 174 - 43 * 0.58;
  const expectedTop = 96 - 132 * 0.58;
  assert(Math.abs(s.leftPct - (expectedLeft / 256) * 100) < 1e-9, 'leftPctが基本式どおり');
  assert(Math.abs(s.topPct - (expectedTop / 256) * 100) < 1e-9, 'topPctが基本式どおり');
  assert(Math.abs(s.sizePct - 58) < 1e-9, 'sizePctはdefaultScale*100');
  assert(Math.abs(s.originXPct - (43 / 256) * 100) < 1e-9, 'transform-originはscaleに依存せずpivot/canvasの比率');

  // 素体(scale=1, pivot=anchor=中央)は左上(0,0)・全面表示になる
  const baseStyle = computeLayerStyle({ x: 128, y: 128 }, { x: 128, y: 128 }, 1, 256);
  assert(baseStyle.leftPct === 0 && baseStyle.topPct === 0 && baseStyle.sizePct === 100, '素体は(0,0)起点でキャンバス全面を占める');
}

// ============================================================
// 3. placeCategory: 安定ソート・上限・オーバーフローバッジ
// ============================================================
section('3. placeCategory の配置・安定ソート・上限');
{
  const ids7 = Array.from({ length: 7 }, (_, i) => `arm-${String(i).padStart(3, '0')}`);
  const p7 = placeCategory('arm', ids7, layouts);
  assert(p7.visible.length === 6, '腕7本 → 表示は6本まで(受け入れ条件5)');
  assert(p7.overflowCount === 1, '腕7本 → 超過は1本');
  assert(p7.mode === 'badge', '腕の超過はバッジモード');

  const ids1to6 = [1, 2, 3, 4, 5, 6].map((n) => Array.from({ length: n }, (_, i) => `arm-${String(i).padStart(3, '0')}`));
  for (const ids of ids1to6) {
    const p = placeCategory('arm', ids, layouts);
    assert(p.visible.length === ids.length, `腕${ids.length}本 → 全て表示され重複表示にならない(受け入れ条件2)`);
    const anchorKeys = new Set(p.visible.map((v) => `${v.anchor.x},${v.anchor.y}`));
    assert(anchorKeys.size === ids.length, `腕${ids.length}本 → 接続点が重複しない(完全には重ならない)`);
  }

  // 装着順に依存しない安定ソート
  const shuffled = ['arm-002', 'arm-000', 'arm-004', 'arm-001', 'arm-003'];
  const sortedInput = [...shuffled].sort();
  const pShuffled = placeCategory('arm', shuffled, layouts);
  const pSorted = placeCategory('arm', sortedInput, layouts);
  assert(
    JSON.stringify(pShuffled.visible.map((v) => v.instanceId)) === JSON.stringify(pSorted.visible.map((v) => v.instanceId)),
    '装着順(取得順)をシャッフルしても表示結果が変わらない(安定ソート)',
  );

  // 内臓は代表表示(バッジなし)で上限を超えても静かに切り詰める
  const organIds = Array.from({ length: 5 }, (_, i) => `organ-${String(i).padStart(3, '0')}`);
  const pOrgan = placeCategory('organ', organIds, layouts);
  assert(pOrgan.visible.length === 3, '内臓5個 → 表示は3個(代表表示)');
  assert(pOrgan.mode === 'representative', '内臓の超過モードはrepresentative');

  // 自動配置OFF: 全個体が同じ接続点に重なる(ON/OFF比較用)
  const pOff = placeCategory('arm', ['arm-000', 'arm-001', 'arm-002'], layouts, false);
  assert(pOff.visible.every((v) => v.anchor === layouts.layouts.arm[0]), '自動配置OFF時は全て同一の接続点に重ねる');

  // 左右mirrorの接続点が両方存在する(左右反転の検証)
  const armAnchors = layouts.layouts.arm;
  assert(armAnchors.some((a) => a.mirror) && armAnchors.some((a) => !a.mirror), '腕の接続点にmirror:true/falseの両方が存在する');
}

console.log(`\n合計: ${passCount}件成功 / ${failCount}件失敗`);
if (failCount > 0) process.exit(1);
