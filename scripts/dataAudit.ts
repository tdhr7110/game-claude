// TEST3着手前のデータ監査スクリプト（本番ビルドには含まれない）
// adminStore経由で「現在ゲームが実際に参照している最新値」（管理画面上書き適用後）を出力する。
// 実行: npx tsx scripts/dataAudit.ts
import {
  getAllParts,
  getPartTypeSynergies,
  getSpeciesSynergies,
  getSpecialAbilities,
  getSpecialAbilityCurrentParams,
} from '../src/engine/adminStore';
import { COMMAND_DEFS } from '../src/data/commands';
import { ALL_ELITE_ENEMIES } from '../src/data/enemies';
import { PART_TYPE_LABELS, SPECIES_LABELS, RARITY_LABELS, TAG_LABELS } from '../src/data/types';

function effectsSummary(effects: any[]): string {
  if (!effects || effects.length === 0) return '-';
  return effects.map((e) => `${e.kind}(${Object.entries(e).filter(([k]) => k !== 'kind').map(([k, v]) => `${k}=${v}`).join(',')})`).join('; ');
}

console.log('# 1. 部位一覧\n');
console.log('| ID | 名前 | レアリティ | 種族 | カテゴリ | 接続コスト | 攻撃力 | 攻撃間隔 | HP補正 | タグ | 効果(通常/特殊) | 特殊能力ID | dropWeight | enabled |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const p of getAllParts()) {
  console.log(
    `| ${p.id} | ${p.name} | ${RARITY_LABELS[p.rarity]} | ${SPECIES_LABELS[p.species]} | ${PART_TYPE_LABELS[p.type]} | ${p.cost} | ${p.attack} | ${p.interval} | ${p.hpBonus} | ${p.tags.map((t) => TAG_LABELS[t]).join('/') || '-'} | ${effectsSummary(p.effects)} | ${p.specialAbilityId ?? '-'} | ${p.dropWeight ?? 1} | ${p.enabled === false ? '❌無効' : '✅有効'} |`
  );
}

console.log('\n# 2. シナジー一覧\n');
console.log('## 部位カテゴリシナジー\n');
console.log('| カテゴリ | 必要数 | 効果内容 | 効果詳細 |');
console.log('|---|---|---|---|');
const typeSyn = getPartTypeSynergies();
for (const [type, tiers] of Object.entries(typeSyn)) {
  for (const t of tiers) {
    console.log(`| ${PART_TYPE_LABELS[type as keyof typeof PART_TYPE_LABELS]} | ${t.count}以上 | ${t.description} | ${effectsSummary([t.effect])} |`);
  }
}
console.log('\n## 種族シナジー\n');
console.log('| 種族 | 必要数 | 効果内容 | 効果詳細 |');
console.log('|---|---|---|---|');
const speciesSyn = getSpeciesSynergies();
for (const [sp, tiers] of Object.entries(speciesSyn)) {
  for (const t of tiers) {
    console.log(`| ${SPECIES_LABELS[sp as keyof typeof SPECIES_LABELS]} | ${t.count}以上 | ${t.description} | ${effectsSummary([t.effect])} |`);
  }
}

console.log('\n# 3. 特殊能力一覧\n');
console.log('| ID | 名前 | Trigger | 効果概要 | editableParams(現在値) | Handler |');
console.log('|---|---|---|---|---|---|');
for (const a of getSpecialAbilities()) {
  const current = getSpecialAbilityCurrentParams(a.id);
  const paramsStr = a.editableParams.map((p) => `${p.label}=${current[p.key]}`).join(', ');
  console.log(`| ${a.id} | ${a.name} | ${a.trigger} | ${a.description} | ${paramsStr} | ${a.handler} |`);
}

console.log('\n# 4. コマンド一覧\n');
console.log('| ID | 名前 | クールダウン | 説明 | 部位由来 |');
console.log('|---|---|---|---|---|');
for (const c of COMMAND_DEFS) {
  console.log(`| ${c.id} | ${c.icon}${c.name} | ${c.baseCooldown}秒 | ${c.description} | ${c.requiresPartId ?? '-'} |`);
}

console.log('\n# 5. 敵ギミック一覧\n');
console.log('| 対象敵 | ギミック種別 | 数値 |');
console.log('|---|---|---|');
for (const e of ALL_ELITE_ENEMIES) {
  if (!e.gimmick) continue;
  console.log(`| ${e.name}(${e.id}) | ${e.gimmick.kind} | ${JSON.stringify(e.gimmick)} |`);
}

console.log(`\n合計: 部位${getAllParts().length}件`);
